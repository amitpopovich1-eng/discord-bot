const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createCase, applyAutoPunish } = require('../../mod');
const { canActOn } = require('../../perms');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('warn').setDescription('מתן אזהרה (3/5/7 אזהרות ב-30 יום = ענישה אוטומטית)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('סיבה').setRequired(true).setMaxLength(400)),
  async execute(i) {
    const user = i.options.getUser('user');
    const member = i.options.getMember('user');
    if (user.bot) return i.reply(ephemeral('אי אפשר להזהיר בוט.'));
    if (member && !canActOn(i.member, member)) return i.reply(ephemeral('אי אפשר להזהיר מישהו עם רול גבוה או שווה לשלך.'));
    await i.deferReply();
    try {
      const c = await createCase(i.guild, { type: 'warn', userId: user.id, modId: i.user.id, reason: i.options.getString('reason') });
      const auto = await applyAutoPunish(i.guild, member, user.id, c.warnCount);
      await i.editReply({ content: `⚠️ ${user} הוזהר/ה · Case #${c.case_no} · ${c.warnCount} אזהרות ב-30 יום${c.dmOk === false ? ' · (לא ניתן לשלוח DM)' : ''}${auto ? `\n${auto}` : ''}`, allowedMentions: { parse: [] } });
    } catch (e) {
      await i.editReply(`❌ האזהרה נכשלה: ${e.message}`);
    }
  },
};
