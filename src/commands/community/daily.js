const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../../db');
const { addXp } = require('../../xp');
const { nowParts, prevDay } = require('../../util');

module.exports = {
  category: 'קהילה',
  data: new SlashCommandBuilder().setName('daily').setDescription('בונוס יומי + סטריק 🔥').setContexts(0),
  async execute(i) {
    const today = nowParts().date;
    const row = db.prepare('SELECT streak, best_streak, last_daily FROM users WHERE guild_id = ? AND user_id = ?').get(i.guild.id, i.user.id);
    if (row?.last_daily === today) return i.reply({ content: 'כבר לקחת את הבונוס היום. תחזרו מחר! 🔥', flags: 64 });

    const streak = row?.last_daily === prevDay(today) ? row.streak + 1 : 1;
    const bonus = 50 + Math.min(streak, 30) * 10; // עד 350 XP
    await addXp(i.member, bonus);
    db.prepare('UPDATE users SET streak = ?, best_streak = MAX(best_streak, ?), last_daily = ? WHERE guild_id = ? AND user_id = ?')
      .run(streak, streak, today, i.guild.id, i.user.id);
    await i.reply(`🎁 קיבלת **${bonus} XP**! סטריק: 🔥 **${streak}** ${streak > 1 ? 'ימים ברצף' : 'יום'}.`);
  },
};
