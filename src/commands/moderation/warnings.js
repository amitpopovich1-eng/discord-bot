const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../../db');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('warnings').setDescription('הצגת אזהרות של משתמש')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true)),
  async execute(i) {
    const user = i.options.getUser('user');
    const rows = db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 10').all(i.guild.id, user.id);
    if (!rows.length) return i.reply({ content: `ל-${user.username} אין אזהרות.`, flags: 64 });
    await i.reply({
      content: rows.map((r) => `**#${r.id}** <t:${Math.floor(r.created_at / 1000)}:d> ע"י <@${r.mod_id}>: ${r.reason}`).join('\n'),
      allowedMentions: { parse: [] }, flags: 64,
    });
  },
};
