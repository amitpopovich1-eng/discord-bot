const { db, getSetting, transaction } = require('./db');
const { brand, COLORS } = require('./ui');

const TYPES = {
  warn: { label: 'אזהרה', emoji: '⚠️', color: COLORS.warn },
  timeout: { label: 'השתקה', emoji: '🔇', color: COLORS.warn },
  untimeout: { label: 'הסרת השתקה', emoji: '🔊', color: COLORS.success },
  kick: { label: 'הרחקה', emoji: '👢', color: 0xe67e22 },
  ban: { label: 'חסימה', emoji: '🔨', color: COLORS.danger },
  tempban: { label: 'חסימה זמנית', emoji: '⏳', color: COLORS.danger },
  unban: { label: 'הסרת חסימה', emoji: '✅', color: COLORS.success },
};

/** ענישה אוטומטית לפי כמות אזהרות ב-30 הימים האחרונים */
const AUTO_PUNISH = [
  { warns: 7, action: 'ban' },
  { warns: 5, action: 'timeout', ms: 24 * 36e5 },
  { warns: 3, action: 'timeout', ms: 36e5 },
];
const WARN_WINDOW_MS = 30 * 864e5;

const nextNo = db.prepare('SELECT COALESCE(MAX(case_no), 0) + 1 AS n FROM cases WHERE guild_id = ?');
const insert = db.prepare(
  'INSERT INTO cases (guild_id, case_no, type, user_id, mod_id, reason, created_at, expires_at, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const BAN_TYPES = ['ban', 'tempban', 'unban'];

/**
 * יוצר Case. סדר הפעולות:
 *  1. הקצאת מספר + שמירה (אטומי, כולל ספירת אזהרות ל-warn)
 *  2. DM מראש (רק ל-kick/ban, כי אחריהם אין ערוץ משותף)
 *  3. `action` - הפעולה האמיתית מול Discord. אם נכשלה: ה-Case נמחק והשגיאה נזרקת
 *  4. ביטול באנים זמניים קודמים של אותו משתמש (כדי שמשימה ישנה לא תבטל באן חדש)
 *  5. לוג מודרציה + DM
 */
async function createCase(guild, { type, userId, modId, reason, expiresAt = null, dm = true, dmFirst = false, action = null }) {
  const c = transaction(() => {
    const no = nextNo.get(guild.id).n;
    insert.run(guild.id, no, type, userId, modId, reason || 'לא צוינה סיבה', Date.now(), expiresAt, type === 'tempban' ? 1 : 0);
    const row = db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_no = ?').get(guild.id, no);
    if (type === 'warn') {
      row.warnCount = db.prepare("SELECT COUNT(*) AS n FROM cases WHERE guild_id = ? AND user_id = ? AND type = 'warn' AND created_at > ?")
        .get(guild.id, userId, Date.now() - WARN_WINDOW_MS).n;
    }
    return row;
  });

  const wantsDm = dm && ['warn', 'timeout', 'kick', 'ban', 'tempban'].includes(type);
  const sendDm = async () => {
    const user = await guild.client.users.fetch(userId).catch(() => null);
    if (!user) return false;
    return user.send({ embeds: [caseEmbed(guild, c, { forUser: true })] }).then(() => true, () => false);
  };

  if (wantsDm && dmFirst) c.dmOk = await sendDm();
  if (action) {
    try {
      await action();
    } catch (e) {
      db.prepare('DELETE FROM cases WHERE id = ?').run(c.id);
      throw e;
    }
  }
  if (BAN_TYPES.includes(type)) {
    db.prepare("UPDATE cases SET active = 0 WHERE guild_id = ? AND user_id = ? AND type = 'tempban' AND active = 1 AND id != ?")
      .run(guild.id, userId, c.id);
  }

  const logId = getSetting(guild.id, 'modlog_channel');
  const log = logId && guild.channels.cache.get(logId);
  if (log?.isTextBased()) {
    await log.send({ embeds: [caseEmbed(guild, c)], allowedMentions: { parse: [] } })
      .catch((e) => console.warn(`[mod] modlog send failed (guild ${guild.id}): ${e.message}`));
  }
  if (wantsDm && !dmFirst) c.dmOk = await sendDm();
  return c;
}

function caseEmbed(guild, c, { forUser = false } = {}) {
  const t = TYPES[c.type] ?? { label: c.type, emoji: '📌', color: COLORS.muted };
  const e = brand(guild, t.color).setTitle(`${t.emoji} ${t.label} · Case #${c.case_no}`)
    .addFields({ name: 'סיבה', value: c.reason.slice(0, 1000) });
  if (!forUser) e.addFields({ name: 'משתמש', value: `<@${c.user_id}> (\`${c.user_id}\`)`, inline: true }, { name: 'צוות', value: `<@${c.mod_id}>`, inline: true });
  else e.setDescription(`קיבלת ${t.label} ב-**${guild.name}**.`);
  if (c.expires_at) e.addFields({ name: 'עד', value: `<t:${Math.floor(c.expires_at / 1000)}:f> (<t:${Math.floor(c.expires_at / 1000)}:R>)`, inline: true });
  return e;
}

/**
 * ענישה אוטומטית. מקבל את מספר האזהרות כפי שנקבע ברגע יצירת ה-Case (לא סופר מחדש),
 * כך שאזהרות מקבילות לא מפעילות את אותו סף פעמיים.
 * @returns {Promise<string|null>} הודעה למנהל, או null אם אין סף
 */
async function applyAutoPunish(guild, member, userId, warnCount) {
  if (getSetting(guild.id, 'auto_punish') === '0') return null;
  const rule = AUTO_PUNISH.find((r) => warnCount === r.warns);
  if (!rule) return null;
  const botId = guild.client.user.id;
  const reason = `ענישה אוטומטית: ${warnCount} אזהרות ב-30 יום`;
  try {
    if (rule.action === 'timeout') {
      if (!member) return `⚠️ הגיע לסף ${warnCount} אזהרות אבל המשתמש לא בשרת.`;
      if (!member.moderatable) return `⚠️ הגיע לסף ${warnCount} אזהרות אבל אין לי הרשאה להשתיק אותו/ה.`;
      await createCase(guild, { type: 'timeout', userId, modId: botId, reason, expiresAt: Date.now() + rule.ms, action: () => member.timeout(rule.ms, reason) });
      return `🔇 הושתק/ה ל-${rule.ms / 36e5} שעות (${warnCount} אזהרות)`;
    }
    if (member && !member.bannable) return `⚠️ הגיע לסף ${warnCount} אזהרות אבל אין לי הרשאה לחסום אותו/ה.`;
    await createCase(guild, { type: 'ban', userId, modId: botId, reason, dmFirst: true, action: () => guild.members.ban(userId, { reason }) });
    return `🔨 נחסם/ה אוטומטית (${warnCount} אזהרות)`;
  } catch (e) {
    console.error(`[mod] auto-punish failed (guild ${guild.id}):`, e.message);
    return `⚠️ הגיע לסף ${warnCount} אזהרות אבל הענישה האוטומטית נכשלה: ${e.message}`;
  }
}

const UNKNOWN_BAN = 10026; // Discord: Unknown Ban
const lastErrorLog = new Map();

/**
 * שחרור באנים זמניים שפג תוקפם. בטוח להפעלה חוזרת ולהפעלה מחדש של הבוט:
 *  - המשימה נתפסת (active=0) לפני הביצוע, כך ששתי ריצות לא יבצעו פעמיים
 *  - כשל זמני מחזיר אותה לתור (אלא אם בינתיים נוצר באן חדש)
 *  - אם קיים Case חדש יותר של באן/שחרור לאותו משתמש, המשימה הישנה מבוטלת ולא מבוצעת
 */
async function expireTempBans(client) {
  const due = db.prepare("SELECT * FROM cases WHERE type = 'tempban' AND active = 1 AND expires_at <= ? ORDER BY expires_at").all(Date.now());
  const newerBanCase = db.prepare(
    "SELECT 1 FROM cases WHERE guild_id = ? AND user_id = ? AND case_no > ? AND type IN ('ban','tempban','unban') LIMIT 1"
  );
  for (const c of due) {
    if (newerBanCase.get(c.guild_id, c.user_id, c.case_no)) {
      db.prepare('UPDATE cases SET active = 0 WHERE id = ?').run(c.id);
      continue;
    }
    const guild = client.guilds.cache.get(c.guild_id);
    if (!guild) continue; // הבוט לא בשרת כרגע; ננסה שוב
    if (db.prepare('UPDATE cases SET active = 0 WHERE id = ? AND active = 1').run(c.id).changes !== 1) continue;
    try {
      await guild.members.unban(c.user_id, `חסימה זמנית הסתיימה (Case #${c.case_no})`);
    } catch (e) {
      if (e.code !== UNKNOWN_BAN) {
        if (!newerBanCase.get(c.guild_id, c.user_id, c.case_no)) db.prepare('UPDATE cases SET active = 1 WHERE id = ?').run(c.id);
        if (Date.now() - (lastErrorLog.get(c.id) ?? 0) > 10 * 60_000) {
          lastErrorLog.set(c.id, Date.now());
          console.error(`[mod] unban of ${c.user_id} failed, will retry: ${e.message}`);
        }
        continue;
      }
    }
    await createCase(guild, { type: 'unban', userId: c.user_id, modId: client.user.id, reason: `סיום חסימה זמנית (Case #${c.case_no})`, dm: false })
      .catch((e) => console.warn('[mod] unban case log failed:', e.message));
  }
}

module.exports = { createCase, caseEmbed, applyAutoPunish, expireTempBans, TYPES };
