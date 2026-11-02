const { SlashCommandBuilder } = require('discord.js');
const { db, getSetting } = require('../../db');
const { suggestionMessage } = require('../../suggestions');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'תמיכה',
  data: new SlashCommandBuilder()
    .setName('suggest').setDescription('שליחת הצעה לשיפור השרת').setContexts(0)
    .addStringOption((o) => o.setName('idea').setDescription('ההצעה שלך').setRequired(true).setMinLength(10).setMaxLength(1500)),
  async execute(i) {
    const chId = getSetting(i.guild.id, 'suggestion_channel');
    const ch = chId && i.guild.channels.cache.get(chId);
    if (!ch?.isTextBased()) return i.reply(ephemeral('ערוץ ההצעות עדיין לא הוגדר (`/setup channel`).'));
    const number = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM suggestions WHERE guild_id = ?').get(i.guild.id).n;
    const info = db.prepare('INSERT INTO suggestions (guild_id, number, user_id, content) VALUES (?, ?, ?, ?)').run(i.guild.id, number, i.user.id, i.options.getString('idea'));
    const s = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(Number(info.lastInsertRowid));
    const msg = await ch.send(suggestionMessage(i.guild, s, i.user));
    db.prepare('UPDATE suggestions SET message_id = ? WHERE id = ?').run(msg.id, s.id);
    await i.reply(ephemeral(`✅ ההצעה #${number} נשלחה: ${msg.url}`));
  },
};
