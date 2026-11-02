const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db, getSetting } = require('../../db');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'מיינקראפט',
  data: new SlashCommandBuilder()
    .setName('unlink').setDescription('ניתוק חשבון מיינקראפט ממשתמש')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true)),
  async execute(i) {
    const user = i.options.getUser('user');
    const r = db.prepare('DELETE FROM mc_links WHERE guild_id = ? AND user_id = ?').run(i.guild.id, user.id);
    if (!r.changes) return i.reply(ephemeral('אין קישור למשתמש הזה.'));
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    const verified = getSetting(i.guild.id, 'verified_role');
    const unverified = getSetting(i.guild.id, 'unverified_role');
    if (member && verified) await member.roles.remove(verified).catch(() => {});
    if (member && unverified) await member.roles.add(unverified).catch(() => {});
    await i.reply(ephemeral(`✅ ${user} נותק/ה.`));
  },
};
