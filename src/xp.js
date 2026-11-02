const { db, getSetting } = require('./db');
const { levelFromXp } = require('./util');

const getUser = db.prepare('SELECT * FROM users WHERE guild_id = ? AND user_id = ?');
const upsert = db.prepare(`
  INSERT INTO users (guild_id, user_id, xp, weekly_xp, level, messages)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET
    xp = excluded.xp, weekly_xp = excluded.weekly_xp, level = excluded.level, messages = excluded.messages
`);
const levelRoles = db.prepare('SELECT level, role_id FROM level_roles WHERE guild_id = ? AND level <= ? ORDER BY level');

/**
 * מוסיף XP למשתמש, מטפל בעליית רמה (הודעה + רול).
 * @param member GuildMember
 */
async function addXp(member, amount, { message = false } = {}) {
  const guildId = member.guild.id;
  const row = getUser.get(guildId, member.id) ?? { xp: 0, weekly_xp: 0, level: 0, messages: 0 };
  const xp = row.xp + amount;
  const { level } = levelFromXp(xp);
  upsert.run(guildId, member.id, xp, row.weekly_xp + amount, level, row.messages + (message ? 1 : 0));

  if (level > row.level) {
    await onLevelUp(member, level).catch((e) => console.error('level-up error:', e));
  }
  return { xp, level, leveledUp: level > row.level };
}

async function onLevelUp(member, level) {
  // רולים לפי רמה
  for (const { role_id } of levelRoles.all(member.guild.id, level)) {
    const role = member.guild.roles.cache.get(role_id);
    if (role && !member.roles.cache.has(role_id)) await member.roles.add(role, `הגיע לרמה ${level}`).catch(() => {});
  }
  const channelId = getSetting(member.guild.id, 'levelup_channel');
  const channel = channelId && member.guild.channels.cache.get(channelId);
  if (channel?.isTextBased()) {
    await channel.send(`🎉 ${member} עלה/תה לרמה **${level}**! כל הכבוד!`).catch(() => {});
  }
}

module.exports = { addXp, getUser };
