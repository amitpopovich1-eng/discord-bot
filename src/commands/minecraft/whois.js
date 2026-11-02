const { SlashCommandBuilder } = require('discord.js');
const { db } = require('../../db');
const { brand, ephemeral } = require('../../ui');
const { isStaff } = require('../../perms');

module.exports = {
  category: 'מיינקראפט',
  data: new SlashCommandBuilder()
    .setName('whois').setDescription('חשבון המיינקראפט המקושר למשתמש (או להפך)').setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('משתמש דיסקורד'))
    .addStringOption((o) => o.setName('ign').setDescription('שם במיינקראפט')),
  async execute(i) {
    const user = i.options.getUser('user');
    const ign = i.options.getString('ign');
    if (!user && !ign) return i.reply(ephemeral('ציינו משתמש או שם במיינקראפט.'));
    const row = user
      ? db.prepare('SELECT * FROM mc_links WHERE guild_id = ? AND user_id = ?').get(i.guild.id, user.id)
      : db.prepare('SELECT * FROM mc_links WHERE guild_id = ? AND ign = ? COLLATE NOCASE').get(i.guild.id, ign.trim());
    if (!row) return i.reply(ephemeral('לא נמצא קישור.'));
    const e = brand(i.guild).setTitle(`🔗 ${row.ign}`).setThumbnail(`https://mc-heads.net/avatar/${row.uuid}/128`)
      .addFields({ name: 'דיסקורד', value: `<@${row.user_id}>`, inline: true }, { name: 'אומת', value: `<t:${Math.floor(row.verified_at / 1000)}:R>`, inline: true },
        { name: 'הוכחת בעלות', value: row.proven ? '✅ קישור Discord בפרופיל Hypixel' : '⚠️ קישור ישן ללא הוכחה', inline: true });
    if (isStaff(i.member)) e.addFields({ name: 'UUID', value: `\`${row.uuid}\`` });
    await i.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
};
