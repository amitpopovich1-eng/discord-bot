const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brand, ephemeral } = require('../../ui');
const { DANGEROUS } = require('../../components');

module.exports = {
  category: 'ניהול',
  data: (() => {
    const b = new SlashCommandBuilder().setName('rolepanel').setDescription('פאנל רולים עם כפתורים (עד 5)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles).setContexts(0)
      .addStringOption((o) => o.setName('title').setDescription('כותרת').setRequired(true).setMaxLength(100))
      .addRoleOption((o) => o.setName('role1').setDescription('רול 1').setRequired(true));
    for (let n = 2; n <= 5; n++) b.addRoleOption((o) => o.setName(`role${n}`).setDescription(`רול ${n}`));
    b.addStringOption((o) => o.setName('description').setDescription('תיאור').setMaxLength(500));
    return b;
  })(),
  async execute(i) {
    const roles = [1, 2, 3, 4, 5].map((n) => i.options.getRole(`role${n}`)).filter(Boolean);
    // היוצר לא יכול לחשוף בפאנל רול שמעל הרול הגבוה שלו (מניעת הסלמת הרשאות)
    const above = roles.find((r) => i.user.id !== i.guild.ownerId && r.position >= i.member.roles.highest.position);
    if (above) return i.reply(ephemeral(`אי אפשר לשים בפאנל את **${above.name}**: הוא לא נמוך מהרול הגבוה שלך.`));
    const bad = roles.find((r) => r.managed || r.position >= i.guild.members.me.roles.highest.position || r.permissions.has(DANGEROUS));
    if (bad) return i.reply(ephemeral(`הרול **${bad.name}** לא מתאים: רול של בוט, מעל הבוט, או עם הרשאות ניהול.`));
    const row = new ActionRowBuilder().addComponents(
      roles.map((r) => new ButtonBuilder().setCustomId(`role:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary)));
    await i.channel.send({
      embeds: [brand(i.guild).setTitle(i.options.getString('title')).setDescription(i.options.getString('description') ?? 'לחצו על כפתור כדי לקבל או להסיר רול.')],
      components: [row],
    });
    await i.reply(ephemeral('✅ הפאנל נשלח.'));
  },
};
