const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db } = require('../../db');

module.exports = {
  category: 'ניהול',
  data: new SlashCommandBuilder()
    .setName('levelrole').setDescription('רולים שמקבלים בהגעה לרמה')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setContexts(0)
    .addSubcommand((s) => s.setName('add').setDescription('הוספה')
      .addIntegerOption((o) => o.setName('level').setDescription('רמה').setRequired(true).setMinValue(1).setMaxValue(200))
      .addRoleOption((o) => o.setName('role').setDescription('רול').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('הסרה')
      .addIntegerOption((o) => o.setName('level').setDescription('רמה').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('רשימה')),
  async execute(i) {
    const eph = (content) => i.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    const sub = i.options.getSubcommand();
    if (sub === 'add') {
      const role = i.options.getRole('role');
      if (role.managed || role.position >= i.guild.members.me.roles.highest.position) return eph('הרול של הבוט צריך להיות מעל הרול הזה.');
      db.prepare('INSERT INTO level_roles (guild_id, level, role_id) VALUES (?, ?, ?) ON CONFLICT(guild_id, level) DO UPDATE SET role_id = excluded.role_id')
        .run(i.guild.id, i.options.getInteger('level'), role.id);
      return eph(`✅ רמה ${i.options.getInteger('level')} ← ${role}`);
    }
    if (sub === 'remove') {
      db.prepare('DELETE FROM level_roles WHERE guild_id = ? AND level = ?').run(i.guild.id, i.options.getInteger('level'));
      return eph('הוסר.');
    }
    const rows = db.prepare('SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level').all(i.guild.id);
    return eph(rows.length ? rows.map((r) => `רמה **${r.level}** ← <@&${r.role_id}>`).join('\n') : 'לא הוגדרו רולים לפי רמה.');
  },
};
