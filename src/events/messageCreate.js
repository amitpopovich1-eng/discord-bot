const { Events, PermissionFlagsBits } = require('discord.js');
const { db, getSetting } = require('../db');
const { createCase } = require('../mod');
const { addXp } = require('../xp');

const xpCooldown = new Map(); // guild:user -> timestamp
const spamTracker = new Map(); // guild:user -> [timestamps]
const wordsStmt = db.prepare('SELECT word FROM filter_words WHERE guild_id = ?');
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hasBadWord(guildId, content) {
  const lower = content.toLowerCase();
  return wordsStmt.all(guildId).some(({ word }) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(word)}($|[^\\p{L}\\p{N}])`, 'u').test(lower));
}
const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite)\/\w+/i;

async function automod(message) {
  if (getSetting(message.guild.id, 'automod') !== '1') return false;
  const member = message.member;
  if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  let reason = null;
  if (INVITE_RE.test(message.content)) reason = 'לינקים להזמנות אסורים כאן';
  else if (message.mentions.users.size >= 5) reason = 'תיוגים מרובים';
  else if (hasBadWord(message.guild.id, message.content)) reason = 'שפה לא הולמת';

  if (!reason) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const list = (spamTracker.get(key) ?? []).filter((t) => now - t < 5000);
    list.push(now);
    spamTracker.set(key, list);
    if (list.length >= 6) {
      spamTracker.delete(key);
      reason = 'ספאם';
      await member.timeout(5 * 60_000, 'AutoMod: ספאם').catch(() => {});
      await createCase(message.guild, { type: 'timeout', userId: member.id, modId: message.client.user.id, reason: 'AutoMod: ספאם', expiresAt: Date.now() + 5 * 60_000 }).catch(() => {});
    }
  }
  if (!reason) return false;

  await message.delete().catch(() => {});
  const warn = await message.channel.send(`${message.author}, ${reason}.`).catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 6000);
  return true;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot || !message.member) return;
    if (await automod(message)) return;

    // XP: 15-25 פעם בדקה, רק להודעות עם תוכן ממשי
    if (message.content.length < 4) return;
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    if (now - (xpCooldown.get(key) ?? 0) < 60_000) return;
    xpCooldown.set(key, now);
    await addXp(message.member, 15 + Math.floor(Math.random() * 11), { message: true });
  },
};
