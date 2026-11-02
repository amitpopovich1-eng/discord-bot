const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createCase } = require('../../mod');
const { canActOn } = require('../../perms');
const { parseDuration } = require('../../util');
const { ephemeral } = require('../../ui');

const MAX = 28 * 864e5;

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('timeout').setDescription('השתקה זמנית של משתמש (עד 28 ימים)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('משך: 10m, 2h, 3d, או 0 להסרה').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('סיבה').setMaxLength(400)),
  async execute(i) {
    const target = i.options.getMember('user');
    const durStr = i.options.getString('duration').trim();
    const reason = i.options.getString('reason') ?? 'לא צוינה סיבה';
    if (!target) return i.reply(ephemeral('המשתמש לא נמצא בשרת.'));
    if (!target.moderatable) return i.reply(ephemeral('אין לי הרשאה להשתיק את המשתמש הזה.'));
    if (!canActOn(i.member, target)) return i.reply(ephemeral('אי אפשר להשתיק מישהו עם רול גבוה או שווה לשלך.'));

    if (durStr === '0') {
      await target.timeout(null, `${i.user.tag}: ${reason}`);
      const c = await createCase(i.guild, { type: 'untimeout', userId: target.id, modId: i.user.id, reason, dm: false });
      return i.reply({ content: `🔊 ההשתקה של **${target.user.tag}** הוסרה. Case #${c.case_no}`, allowedMentions: { parse: [] } });
    }
    const ms = parseDuration(durStr);
    if (!ms || ms < 1000 || ms > MAX) return i.reply(ephemeral('משך לא תקין. דוגמאות: `10m`, `2h`, `3d` (עד 28 ימים).'));
    await target.timeout(ms, `${i.user.tag}: ${reason}`);
    const c = await createCase(i.guild, { type: 'timeout', userId: target.id, modId: i.user.id, reason, expiresAt: Date.now() + ms });
    await i.reply({ content: `🔇 **${target.user.tag}** הושתק ל-${durStr}. Case #${c.case_no}`, allowedMentions: { parse: [] } });
  },
};
