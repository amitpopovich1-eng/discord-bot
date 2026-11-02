const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createCase } = require('../../mod');
const { ephemeral } = require('../../ui');

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
    await i.deferReply();
    try {
      // יצירת ה-Case מבטלת אוטומטית באנים זמניים פעילים של המשתמש
      const c = await createCase(i.guild, {
        type: 'unban', userId: id, modId: i.user.id, reason: i.options.getString('reason'), dm: false,
        action: () => i.guild.members.unban(id, `${i.user.tag}: ${i.options.getString('reason') ?? ''}`),
      });
      await i.editReply(`✅ **${ban.user.tag}** שוחרר מהחסימה. Case #${c.case_no}`);
    } catch (e) {
      await i.editReply(`❌ שחרור החסימה נכשל: ${e.message}`);
    }
  },
};
