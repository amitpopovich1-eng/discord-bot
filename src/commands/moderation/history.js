const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../../db');
const { TYPES } = require('../../mod');
const { linePages, paginate, ephemeral } = require('../../ui');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('history').setDescription('היסטוריית ענישה של משתמש')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true)),
  async execute(i) {
    const user = i.options.getUser('user');
    const rows = db.prepare('SELECT * FROM cases WHERE guild_id = ? AND user_id = ? ORDER BY case_no DESC').all(i.guild.id, user.id);
    if (!rows.length) return i.reply(ephemeral(`ל-${user.username} אין היסטוריה. 🎉`));
    const lines = rows.map((c) => {
      const t = TYPES[c.type] ?? { emoji: '📌', label: c.type };
      return `${t.emoji} **#${c.case_no}** ${t.label} · <t:${Math.floor(c.created_at / 1000)}:d> · <@${c.mod_id}>\n> ${c.reason.slice(0, 120)}`;
    });
    const pages = linePages(i.guild, `היסטוריה: ${user.username}`, lines, 6).map((p) => p.setThumbnail(user.displayAvatarURL()));
    await paginate(i, pages, { ephemeralReply: true });
  },
};
