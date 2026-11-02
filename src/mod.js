const { db, getSetting } = require('./db');
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

/** יוצר Case, שולח ללוג ומחזיר את השורה. */
async function createCase(guild, { type, userId, modId, reason, expiresAt = null, dm = true }) {
  const no = nextNo.get(guild.id).n;
  insert.run(guild.id, no, type, userId, modId, reason || 'לא צוינה סיבה', Date.now(), expiresAt, type === 'tempban' ? 1 : 0);
  const c = db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_no = ?').get(guild.id, no);

  const logId = getSetting(guild.id, 'modlog_channel');
  const log = logId && guild.channels.cache.get(logId);
  if (log?.isTextBased()) await log.send({ embeds: [caseEmbed(guild, c)], allowedMentions: { parse: [] } }).catch(() => {});

  if (dm && ['warn', 'timeout', 'kick', 'ban', 'tempban'].includes(type)) {
    const user = await guild.client.users.fetch(userId).catch(() => null);
    await user?.send({ embeds: [caseEmbed(guild, c, { forUser: true })] }).catch(() => {});
  }
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

/** בודק אם אזהרה חדשה מחצה סף ענישה אוטומטי; מחזיר את הפעולה שבוצעה */
async function applyAutoPunish(guild, member, userId) {
  if (getSetting(guild.id, 'auto_punish') === '0') return null;
  const n = db.prepare("SELECT COUNT(*) AS n FROM cases WHERE guild_id = ? AND user_id = ? AND type = 'warn' AND created_at > ?")
    .get(guild.id, userId, Date.now() - WARN_WINDOW_MS).n;
  const rule = AUTO_PUNISH.find((r) => n === r.warns);
  if (!rule) return null;
  const botId = guild.client.user.id;
  const reason = `ענישה אוטומטית: ${n} אזהרות ב-30 יום`;
  if (rule.action === 'timeout' && member?.moderatable) {
    await member.timeout(rule.ms, reason);
    await createCase(guild, { type: 'timeout', userId, modId: botId, reason, expiresAt: Date.now() + rule.ms });
    return `🔇 הושתק/ה ל-${rule.ms / 36e5} שעות (${n} אזהרות)`;
  }
  if (rule.action === 'ban' && member?.bannable) {
    await guild.members.ban(userId, { reason });
    await createCase(guild, { type: 'ban', userId, modId: botId, reason });
    return `🔨 נחסם/ה אוטומטית (${n} אזהרות)`;
  }
  return null;
}

/** שחרור באנים זמניים שפג תוקפם */
async function expireTempBans(client) {
  const due = db.prepare("SELECT * FROM cases WHERE type = 'tempban' AND active = 1 AND expires_at <= ?").all(Date.now());
  for (const c of due) {
    db.prepare('UPDATE cases SET active = 0 WHERE id = ?').run(c.id);
    const guild = client.guilds.cache.get(c.guild_id);
    if (!guild) continue;
    await guild.members.unban(c.user_id, 'חסימה זמנית הסתיימה').catch(() => {});
    await createCase(guild, { type: 'unban', userId: c.user_id, modId: client.user.id, reason: `סיום חסימה זמנית (Case #${c.case_no})`, dm: false });
  }
}

module.exports = { createCase, caseEmbed, applyAutoPunish, expireTempBans, TYPES };
