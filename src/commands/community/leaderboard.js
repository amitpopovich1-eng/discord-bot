const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../../db');

module.exports = {
  category: 'קהילה',
  data: new SlashCommandBuilder()
    .setName('leaderboard').setDescription('טבלת המובילים בשרת').setContexts(0)
    .addStringOption((o) => o.setName('type').setDescription('סוג').addChoices(
      { name: 'כללי', value: 'xp' }, { name: 'השבוע', value: 'weekly_xp' }, { name: 'סטריק', value: 'streak' })),
  async execute(i) {
    const col = i.options.getString('type') ?? 'xp'; // ערך מתוך רשימה סגורה (addChoices)
    const rows = db.prepare(`SELECT user_id, xp, weekly_xp, streak, level FROM users WHERE guild_id = ? AND ${col} > 0 ORDER BY ${col} DESC LIMIT 10`).all(i.guild.id);
    if (!rows.length) return i.reply('עדיין אין נתונים. תתחילו לדבר! 💬');
    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map((r, n) => {
      const val = col === 'streak' ? `🔥 ${r.streak} ימים` : col === 'xp' ? `רמה ${r.level} · ${r.xp} XP` : `${r.weekly_xp} XP`;
      return `${medals[n] ?? `**${n + 1}.**`} <@${r.user_id}> — ${val}`;
    });
    await i.reply({ embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('🏆 טבלת מובילים').setDescription(lines.join('\n'))], allowedMentions: { parse: [] } });
  },
};
