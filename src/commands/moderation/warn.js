const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db } = require('../../db');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('warn').setDescription('מתן אזהרה למשתמש')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('סיבה').setRequired(true).setMaxLength(300)),
  async execute(i) {
    const user = i.options.getUser('user');
    if (user.bot) return i.reply({ content: 'אי אפשר להזהיר בוט.', flags: MessageFlags.Ephemeral });
    db.prepare('INSERT INTO warnings (guild_id, user_id, mod_id, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(i.guild.id, user.id, i.user.id, i.options.getString('reason'), Date.now());
    const n = db.prepare('SELECT COUNT(*) AS n FROM warnings WHERE guild_id = ? AND user_id = ?').get(i.guild.id, user.id).n;
    await user.send(`קיבלת אזהרה ב-**${i.guild.name}**: ${i.options.getString('reason')}`).catch(() => {});
    await i.reply(`⚠️ ${user} הוזהר/ה (סה"כ ${n} אזהרות). סיבה: ${i.options.getString('reason')}`);
  },
};
