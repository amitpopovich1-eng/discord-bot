const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createCase } = require('../../mod');
const { ephemeral } = require('../../ui');
const { db } = require('../../db');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('unban').setDescription('הסרת חסימה')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setContexts(0)
    .addStringOption((o) => o.setName('user_id').setDescription('מזהה המשתמש (ID)').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('סיבה').setMaxLength(400)),
  async execute(i) {
    const id = i.options.getString('user_id').trim();
    if (!/^\d{15,22}$/.test(id)) return i.reply(ephemeral('מזהה לא תקין (מספרים בלבד).'));
    const ban = await i.guild.bans.fetch(id).catch(() => null);
    if (!ban) return i.reply(ephemeral('המשתמש הזה לא חסום.'));
    await i.guild.members.unban(id, `${i.user.tag}: ${i.options.getString('reason') ?? ''}`);
    db.prepare("UPDATE cases SET active = 0 WHERE guild_id = ? AND user_id = ? AND type = 'tempban'").run(i.guild.id, id);
    const c = await createCase(i.guild, { type: 'unban', userId: id, modId: i.user.id, reason: i.options.getString('reason'), dm: false });
    await i.reply(`✅ **${ban.user.tag}** שוחרר מהחסימה. Case #${c.case_no}`);
  },
};
