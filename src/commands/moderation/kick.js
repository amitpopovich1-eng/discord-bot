const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createCase } = require('../../mod');
const { canActOn } = require('../../perms');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('kick').setDescription('הרחקת משתמש מהשרת')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('סיבה').setMaxLength(400)),
  async execute(i) {
    const member = i.options.getMember('user');
    const reason = i.options.getString('reason') ?? 'לא צוינה סיבה';
    if (!member) return i.reply(ephemeral('המשתמש לא נמצא בשרת.'));
    if (member.id === i.user.id) return i.reply(ephemeral('אי אפשר להרחיק את עצמך.'));
    if (!member.kickable) return i.reply(ephemeral('אין לי הרשאה להרחיק את המשתמש הזה.'));
    if (!canActOn(i.member, member)) return i.reply(ephemeral('אי אפשר להרחיק מישהו עם רול גבוה או שווה לשלך.'));
    await i.deferReply();
    try {
      const c = await createCase(i.guild, { type: 'kick', userId: member.id, modId: i.user.id, reason, dmFirst: true, action: () => member.kick(`${i.user.tag}: ${reason}`) });
      await i.editReply({ content: `👢 **${member.user.tag}** הורחק. Case #${c.case_no}${c.dmOk === false ? ' · (לא ניתן לשלוח DM)' : ''}`, allowedMentions: { parse: [] } });
    } catch (e) {
      await i.editReply(`❌ ההרחקה נכשלה: ${e.message}`);
    }
  },
};
