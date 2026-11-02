const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createCase, applyAutoPunish } = require('../../mod');
const { canActOn } = require('../../perms');
const { ephemeral } = require('../../ui');
const { db } = require('../../db');

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
    const c = await createCase(i.guild, { type: 'warn', userId: user.id, modId: i.user.id, reason: i.options.getString('reason') });
    const auto = await applyAutoPunish(i.guild, member, user.id).catch(() => null);
    const total = db.prepare("SELECT COUNT(*) AS n FROM cases WHERE guild_id = ? AND user_id = ? AND type = 'warn'").get(i.guild.id, user.id).n;
    await i.editReply({ content: `⚠️ ${user} הוזהר/ה · Case #${c.case_no} · סה"כ ${total} אזהרות${auto ? `\n${auto}` : ''}`, allowedMentions: { parse: [] } });
  },
};
