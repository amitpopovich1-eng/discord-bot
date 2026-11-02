const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db, getSetting } = require('../../db');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'מיינקראפט',
  data: new SlashCommandBuilder()
    .setName('unlink').setDescription('ניתוק חשבון מיינקראפט ממשתמש')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש'))
    .addStringOption((o) => o.setName('ign').setDescription('או: שם במיינקראפט (כשחשבון הדיסקורד כבר לא קיים)')),
  async execute(i) {
    const user = i.options.getUser('user');
    const ign = i.options.getString('ign')?.trim();
    if (!user && !ign) return i.reply(ephemeral('ציינו משתמש או שם במיינקראפט.'));
    const row = user
      ? db.prepare('SELECT user_id, ign FROM mc_links WHERE guild_id = ? AND user_id = ?').get(i.guild.id, user.id)
      : db.prepare('SELECT user_id, ign FROM mc_links WHERE guild_id = ? AND ign = ? COLLATE NOCASE').get(i.guild.id, ign);
    if (!row) return i.reply(ephemeral('לא נמצא קישור.'));
    db.prepare('DELETE FROM mc_links WHERE guild_id = ? AND user_id = ?').run(i.guild.id, row.user_id);
    // אחרי ניתוק הקוד הישן של אותו חשבון כבר נוצל; ניתן להנפיק חדש מיידית
    const member = await i.guild.members.fetch(row.user_id).catch(() => null);
    const verified = getSetting(i.guild.id, 'verified_role');
    const unverified = getSetting(i.guild.id, 'unverified_role');
    if (member && verified) await member.roles.remove(verified).catch((e) => console.warn('[unlink]', e.message));
    if (member && unverified) await member.roles.add(unverified).catch((e) => console.warn('[unlink]', e.message));
    await i.reply(ephemeral(`✅ <@${row.user_id}> נותק/ה מ-**${row.ign}**.`));
  },
};
