const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createCase } = require('../../mod');
const { canActOn } = require('../../perms');
const { parseDuration } = require('../../util');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('ban').setDescription('חסימת משתמש (קבועה או זמנית)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('סיבה').setMaxLength(400))
    .addStringOption((o) => o.setName('duration').setDescription('חסימה זמנית: 12h, 7d, 2w (ריק = קבועה)'))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('מחיקת הודעות מהימים האחרונים (0-7)').setMinValue(0).setMaxValue(7)),
  async execute(i) {
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    const reason = i.options.getString('reason') ?? 'לא צוינה סיבה';
    const durStr = i.options.getString('duration');
    const ms = durStr ? parseDuration(durStr) : null;
    if (durStr && (!ms || ms < 6e4)) return i.reply(ephemeral('משך לא תקין. דוגמאות: `12h`, `7d`, `2w`.'));
    if (user.id === i.user.id) return i.reply(ephemeral('אי אפשר לחסום את עצמך.'));
    if (member) {
      if (!member.bannable) return i.reply(ephemeral('אין לי הרשאה לחסום את המשתמש הזה.'));
      if (!canActOn(i.member, member)) return i.reply(ephemeral('אי אפשר לחסום מישהו עם רול גבוה או שווה לשלך.'));
    }
    await i.deferReply();
    try {
      // ה-DM נשלח לפני החסימה (אחריה אין ערוץ משותף). אם החסימה נכשלת ה-Case נמחק.
      const c = await createCase(i.guild, {
        type: ms ? 'tempban' : 'ban', userId: user.id, modId: i.user.id, reason, expiresAt: ms ? Date.now() + ms : null, dmFirst: true,
        action: () => i.guild.members.ban(user, { reason: `${i.user.tag}: ${reason}`, deleteMessageSeconds: (i.options.getInteger('delete_days') ?? 0) * 86400 }),
      });
      await i.editReply({ content: `🔨 **${user.tag}** נחסם${ms ? ` ל-${durStr}` : ''}. Case #${c.case_no}${c.dmOk === false ? ' · (לא ניתן לשלוח DM)' : ''}`, allowedMentions: { parse: [] } });
    } catch (e) {
      await i.editReply(`❌ החסימה נכשלה: ${e.message}`);
    }
  },
};
