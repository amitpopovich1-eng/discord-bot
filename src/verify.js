/**
 * אימות חשבון מיינקראפט.
 *
 * מודל: השרת (הפלאגין) מנפיק קוד לשחקן המחובר לפי ה-UUID שלו; השחקן מזין את הקוד בדיסקורד.
 * מי שמחזיק בקוד הוא מי שראה אותו בתוך המשחק. הקוד נוצר בצד השרת בלבד, כך שאי אפשר
 * "לדחוף" לשחקן קוד של מישהו אחר (הנדסה חברתית בכיוון ההפוך).
 *
 * כל המצב נשמר ב-DB (לא בזיכרון), והקודים נשמרים כ-HMAC בלבד.
 */
const crypto = require('node:crypto');
const { db, getSetting, transaction } = require('./db');
const { brand, COLORS } = require('./ui');

const CODE_LEN = 8;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 תווים, בלי 0/O/1/I/L
const CODE_TTL_MS = 5 * 60_000;
const ISSUE_COOLDOWN_MS = 30_000;
const MAX_FAILURES = 5;
const FAIL_WINDOW_MS = 15 * 60_000;

const UUID_RE = /^[0-9a-f]{32}$/;
const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

const normUuid = (u) => String(u ?? '').replace(/-/g, '').toLowerCase();
const normCode = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmtCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;

function secret() {
  const s = process.env.API_SECRET;
  if (!s || s.length < 32) throw new Error('API_SECRET חסר או קצר מ-32 תווים');
  return s;
}
const hashCode = (code) => crypto.createHmac('sha256', secret()).update(`code:${code}`).digest('hex');

function makeCode() {
  let c = '';
  for (let i = 0; i < CODE_LEN; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return c;
}

/**
 * הנפקת קוד לשחקן (נקרא מה-API כשהשחקן מריץ /discord link בשרת).
 * @returns {{status:number, code?:string, expiresAt?:number, retryAfter?:number, error?:string}}
 */
function issueCode({ guildId, uuid, name, now = Date.now() }) {
  const id = normUuid(uuid);
  if (!UUID_RE.test(id)) return { status: 400, error: 'invalid_uuid' };
  if (!NAME_RE.test(String(name ?? ''))) return { status: 400, error: 'invalid_name' };

  return transaction(() => {
    if (db.prepare('SELECT 1 FROM mc_links WHERE guild_id = ? AND uuid = ?').get(guildId, id)) {
      return { status: 409, error: 'already_linked' };
    }
    const last = db.prepare('SELECT created_at FROM verify_codes WHERE guild_id = ? AND uuid = ? ORDER BY created_at DESC LIMIT 1').get(guildId, id);
    if (last && now - last.created_at < ISSUE_COOLDOWN_MS) {
      return { status: 429, error: 'cooldown', retryAfter: Math.ceil((ISSUE_COOLDOWN_MS - (now - last.created_at)) / 1000) };
    }
    db.prepare('DELETE FROM verify_codes WHERE guild_id = ? AND uuid = ?').run(guildId, id); // קוד פעיל אחד לכל חשבון
    let code;
    for (;;) { // התנגשות כמעט בלתי אפשרית, אבל PK מבטיח ייחודיות
      code = makeCode();
      if (!db.prepare('SELECT 1 FROM verify_codes WHERE code_hash = ?').get(hashCode(code))) break;
    }
    db.prepare('INSERT INTO verify_codes (code_hash, guild_id, uuid, ign, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(hashCode(code), guildId, id, name, now, now + CODE_TTL_MS);
    return { status: 200, code: fmtCode(code), expiresAt: now + CODE_TTL_MS };
  });
}

function checkLockout(guildId, userId, now) {
  const row = db.prepare('SELECT failures, window_start FROM verify_attempts WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row) return null;
  if (now - row.window_start > FAIL_WINDOW_MS) return null;
  return row.failures >= MAX_FAILURES ? Math.ceil((FAIL_WINDOW_MS - (now - row.window_start)) / 60_000) : null;
}

function recordFailure(guildId, userId, now) {
  db.prepare(`
    INSERT INTO verify_attempts (guild_id, user_id, failures, window_start) VALUES (?, ?, 1, ?)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      failures = CASE WHEN ? - window_start > ? THEN 1 ELSE failures + 1 END,
      window_start = CASE WHEN ? - window_start > ? THEN ? ELSE window_start END
  `).run(guildId, userId, now, now, FAIL_WINDOW_MS, now, FAIL_WINDOW_MS, now);
  const row = db.prepare('SELECT failures FROM verify_attempts WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return Math.max(0, MAX_FAILURES - row.failures);
}

/**
 * מימוש קוד ע"י משתמש דיסקורד. כל הבדיקות והכתיבה בטרנזקציה אחת:
 * או שהקוד נצרך והקישור נוצר, או שלא קרה כלום.
 * @returns {{ok:true, ign:string, uuid:string} | {ok:false, error:string}}
 */
function redeemCode(guildId, userId, rawCode, { accountCreatedAt, now = Date.now() } = {}) {
  const locked = checkLockout(guildId, userId, now);
  if (locked !== null) return { ok: false, error: `יותר מדי ניסיונות שגויים. נסו שוב בעוד ${locked} דקות.` };

  const minAge = Number(getSetting(guildId, 'min_account_age_days') ?? 0);
  if (minAge && accountCreatedAt && now - accountCreatedAt < minAge * 864e5) {
    return { ok: false, error: `החשבון בדיסקורד חייב להיות בן ${minAge} ימים לפחות.` };
  }

  const code = normCode(rawCode);
  const fail = (msg) => {
    const left = recordFailure(guildId, userId, now);
    return { ok: false, error: `${msg} (נותרו ${left} ניסיונות)` };
  };
  if (code.length !== CODE_LEN) return fail('קוד לא תקין.');

  try {
    return transaction(() => {
      const mine = db.prepare('SELECT ign FROM mc_links WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
      if (mine) return { ok: false, error: `כבר מקושר אליך החשבון **${mine.ign}**. פנו לצוות כדי לשנות.` };

      const row = db.prepare('SELECT * FROM verify_codes WHERE code_hash = ? AND guild_id = ?').get(hashCode(code), guildId);
      if (!row || row.used) return fail('קוד שגוי או שכבר נוצל.');
      if (row.expires_at <= now) return fail('הקוד פג תוקף. הריצו שוב /discord link במשחק.');

      // UNIQUE(guild_id, uuid) ו-UNIQUE(guild_id, user_id) הם קו ההגנה האחרון מפני קישור כפול
      const consumed = db.prepare('UPDATE verify_codes SET used = 1 WHERE code_hash = ? AND used = 0').run(row.code_hash);
      if (consumed.changes !== 1) return fail('קוד שגוי או שכבר נוצל.');
      try {
        db.prepare('INSERT INTO mc_links (guild_id, user_id, uuid, ign, verified_at, proven) VALUES (?, ?, ?, ?, ?, 1)')
          .run(guildId, userId, row.uuid, row.ign, now);
      } catch (e) {
        // זורקים כדי שהטרנזקציה כולה תתבטל (גם צריכת הקוד)
        if (/UNIQUE/i.test(e.message)) throw Object.assign(new Error('dup'), { dup: true });
        throw e;
      }
      db.prepare('DELETE FROM verify_attempts WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
      return { ok: true, ign: row.ign, uuid: row.uuid };
    });
  } catch (e) {
    if (e.dup) return { ok: false, error: 'החשבון הזה כבר מקושר למשתמש אחר. פנו לצוות.' };
    throw e;
  }
}

/** נותן רול מאומת, מסיר לא-מאומת, ומסנכרן כינוי. מחזיר רשימת כשלונות (לא זורק). */
async function applyVerifiedState(member, ign) {
  const guild = member.guild;
  const failures = [];
  const verified = getSetting(guild.id, 'verified_role');
  const unverified = getSetting(guild.id, 'unverified_role');
  if (verified && !member.roles.cache?.has?.(verified)) {
    await member.roles.add(verified, 'אימות מיינקראפט').catch((e) => failures.push(`הוספת רול מאומת: ${e.message}`));
  }
  if (unverified) await member.roles.remove(unverified, 'אימות מיינקראפט').catch((e) => failures.push(`הסרת רול לא-מאומת: ${e.message}`));
  if (getSetting(guild.id, 'verify_nickname') !== '0' && member.nickname !== ign) {
    if (member.manageable) await member.setNickname(ign.slice(0, 32), 'אימות מיינקראפט').catch((e) => failures.push(`כינוי: ${e.message}`));
  }
  if (failures.length) {
    console.warn(`[verify] ${guild.id}/${member.id}: ${failures.join('; ')}`);
    await logToStaff(guild, `⚠️ אימות של <@${member.id}> (**${ign}**) נשמר, אבל חלק מהפעולות נכשלו:\n- ${failures.join('\n- ')}\nבדקו שהרול של הבוט **מעל** הרולים. הלחיצה על כפתור האימות תנסה שוב.`);
  }
  return failures;
}

/** מסנכרן מצב של משתמש מקושר (חזרה לשרת / כשל קודם ברולים) */
async function reconcileMember(member) {
  const link = db.prepare('SELECT ign FROM mc_links WHERE guild_id = ? AND user_id = ?').get(member.guild.id, member.id);
  if (!link) return null;
  await applyVerifiedState(member, link.ign);
  return link;
}

async function logToStaff(guild, text, color = COLORS.warn) {
  const id = getSetting(guild.id, 'modlog_channel');
  const ch = id && guild.channels.cache.get(id);
  if (!ch?.isTextBased()) return;
  await ch.send({ embeds: [brand(guild, color).setDescription(text)], allowedMentions: { parse: [] } })
    .catch((e) => console.warn(`[verify] modlog send failed: ${e.message}`));
}

/** מנקה קודים ישנים */
function pruneCodes(now = Date.now()) {
  db.prepare('DELETE FROM verify_codes WHERE expires_at < ?').run(now - 24 * 36e5);
  db.prepare('DELETE FROM verify_attempts WHERE window_start < ?').run(now - FAIL_WINDOW_MS);
}

module.exports = {
  issueCode, redeemCode, applyVerifiedState, reconcileMember, logToStaff, pruneCodes,
  normUuid, normCode, fmtCode, hashCode, CODE_TTL_MS, MAX_FAILURES, ISSUE_COOLDOWN_MS, FAIL_WINDOW_MS,
};
