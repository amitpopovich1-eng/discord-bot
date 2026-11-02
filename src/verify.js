/**
 * אימות חשבון מיינקראפט דרך Hypixel (בלי שרת/פלאגין).
 *
 * הוכחת הבעלות: השחקן מגדיר את שם המשתמש שלו בדיסקורד בפרופיל ה-Hypixel שלו (Social Media > Discord).
 * רק מי שמחובר לחשבון Hypixel יכול לשנות זאת. הבוט קורא את הערך דרך ה-API הציבורי ומשווה לשם המשתמש
 * של מי שלחץ על הכפתור. בלי התאמה - אין אימות, אין רול. כל כשל שירות מוביל לאי-אימות (fail closed).
 *
 * מגבלות (ראו docs/verification.md): הערך בפרופיל הוא טקסט חופשי ש-Hypixel לא מאמת מול Discord,
 * והתאמה נבדקת ברגע האימות בלבד.
 */
const { db, getSetting, transaction } = require('./db');
const { brand, COLORS } = require('./ui');
const hypixel = require('./hypixel');

const MAX_FAILURES = 5;
const FAIL_WINDOW_MS = 15 * 60_000;

function checkLockout(guildId, userId, now) {
  const row = db.prepare('SELECT failures, window_start FROM verify_attempts WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!row || now - row.window_start > FAIL_WINDOW_MS) return null;
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

const SERVICE_MESSAGES = {
  auth: 'האימות לא זמין כרגע (בעיית הגדרה בבוט). הצוות קיבל התראה.',
  rate_limited: 'השירות עמוס כרגע. נסו שוב בעוד דקה.',
  unavailable: 'לא הצלחתי להגיע ל-Hypixel/Mojang כרגע. נסו שוב עוד רגע. (לא נספר כניסיון כושל)',
  malformed: 'קיבלתי תשובה לא צפויה מהשירות, ולכן לא אימתתי. נסו שוב מאוחר יותר.',
};

/**
 * מאמת שמשתמש הדיסקורד הוא בעל חשבון המיינקראפט `ign`.
 * @param {{guildId:string,user:{id:string,username:string,discriminator?:string,createdTimestamp?:number},ign:string}} a
 * @param {{fetchImpl?:Function, apiKey?:string, now?:number, onServiceError?:Function}} deps
 * @returns {Promise<{ok:true, ign:string, uuid:string} | {ok:false, error:string, service?:boolean}>}
 */
async function verifyAccount({ guildId, user, ign }, { fetchImpl, apiKey = process.env.HYPIXEL_API_KEY, now = Date.now(), onServiceError } = {}) {
  if (!apiKey) return { ok: false, service: true, error: SERVICE_MESSAGES.auth };

  const locked = checkLockout(guildId, user.id, now);
  if (locked !== null) return { ok: false, error: `יותר מדי ניסיונות שגויים. נסו שוב בעוד ${locked} דקות.` };

  const minAge = Number(getSetting(guildId, 'min_account_age_days') ?? 0);
  if (minAge && user.createdTimestamp && now - user.createdTimestamp < minAge * 864e5) {
    return { ok: false, error: `החשבון בדיסקורד חייב להיות בן ${minAge} ימים לפחות.` };
  }

  ign = String(ign ?? '').trim();
  const fail = (msg) => ({ ok: false, error: `${msg} (נותרו ${recordFailure(guildId, user.id, now)} ניסיונות)` });
  if (!hypixel.IGN_RE.test(ign)) return fail('שם משתמש לא תקין (3-16 תווים: אותיות לטיניות, מספרים וקו תחתון).');

  const mine = db.prepare('SELECT ign FROM mc_links WHERE guild_id = ? AND user_id = ?').get(guildId, user.id);
  if (mine) return { ok: false, error: `כבר מקושר אליך החשבון **${mine.ign}**. פנו לצוות כדי לשנות.` };

  let profile; let social;
  try {
    profile = await hypixel.resolveUuid(ign, { fetchImpl, now });
    if (!profile) return fail(`לא נמצא שחקן בשם **${ign}**.`);
    const taken = db.prepare('SELECT 1 FROM mc_links WHERE guild_id = ? AND uuid = ?').get(guildId, profile.uuid);
    if (taken) return { ok: false, error: `החשבון **${profile.name}** כבר מקושר למשתמש אחר. אם זה החשבון שלכם, פנו לצוות.` };
    social = await hypixel.getHypixelDiscord(profile.uuid, { apiKey, fetchImpl, now });
  } catch (e) {
    if (!(e instanceof hypixel.ServiceError)) throw e;
    console.warn(`[verify] service error (${e.kind}): ${e.message}`); // בלי מפתח/כותרות
    onServiceError?.(e);
    return { ok: false, service: true, error: SERVICE_MESSAGES[e.kind] ?? SERVICE_MESSAGES.unavailable };
  }

  if (!social.found) return fail(`**${profile.name}** לא נמצא ב-Hypixel (לא נכנס/ה מעולם, או שהנתונים מוסתרים).`);
  if (!social.discord) {
    return fail(`בפרופיל ה-Hypixel של **${profile.name}** לא מוגדר חשבון Discord. הגדירו אותו (ראו הוראות בפאנל), המתינו כדקה, ונסו שוב.`);
  }
  if (!hypixel.discordHandleMatches(social.discord, user)) {
    return fail(`בפרופיל ה-Hypixel של **${profile.name}** מוגדר Discord אחר. הקלידו שם בדיוק: \`${user.username}\` (שם המשתמש, לא שם התצוגה).`);
  }

  // רגע האמת: כתיבה אטומית. UNIQUE על (שרת,משתמש) ועל (שרת,UUID) חוסמים מרוץ בין ניסיונות מקבילים.
  try {
    transaction(() => {
      db.prepare('INSERT INTO mc_links (guild_id, user_id, uuid, ign, verified_at, proven, method, matched_handle) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
        .run(guildId, user.id, profile.uuid, profile.name, now, 'hypixel_social', String(social.discord).trim().toLowerCase());
      db.prepare('DELETE FROM verify_attempts WHERE guild_id = ? AND user_id = ?').run(guildId, user.id);
    });
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) return { ok: false, error: 'החשבון הזה (או המשתמש שלך) כבר מקושר. אם זה לא צפוי, פנו לצוות.' };
    throw e;
  }
  return { ok: true, ign: profile.name, uuid: profile.uuid };
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

/** מנקה רשומות ניסיונות ישנות */
function pruneAttempts(now = Date.now()) {
  db.prepare('DELETE FROM verify_attempts WHERE window_start < ?').run(now - FAIL_WINDOW_MS);
}

module.exports = {
  verifyAccount, applyVerifiedState, reconcileMember, logToStaff, pruneAttempts,
  MAX_FAILURES, FAIL_WINDOW_MS,
};
