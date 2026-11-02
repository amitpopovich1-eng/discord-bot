const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../../db');
const { levelFromXp, progressBar } = require('../../util');

module.exports = {
  category: 'קהילה',
  data: new SlashCommandBuilder()
    .setName('rank').setDescription('הרמה וה-XP שלך (או של מישהו אחר)').setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('משתמש')),
  async execute(i) {
    const user = i.options.getUser('user') ?? i.user;
    const row = db.prepare('SELECT * FROM users WHERE guild_id = ? AND user_id = ?').get(i.guild.id, user.id);
    if (!row) return i.reply({ content: `ל-${user.username} עדיין אין XP. זמן לדבר! 💬` });
    const { level, current, needed } = levelFromXp(row.xp);
    const place = db.prepare('SELECT COUNT(*) + 1 AS p FROM users WHERE guild_id = ? AND xp > ?').get(i.guild.id, row.xp).p;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2).setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .addFields(
        { name: 'רמה', value: String(level), inline: true },
        { name: 'דירוג', value: `#${place}`, inline: true },
        { name: 'הודעות', value: String(row.messages), inline: true },
        { name: 'סטריק יומי', value: `🔥 ${row.streak}`, inline: true },
        { name: `התקדמות (${current}/${needed})`, value: progressBar(current, needed) },
      );
    await i.reply({ embeds: [embed] });
  },
};
