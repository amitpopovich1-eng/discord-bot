const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brand, COLORS, ephemeral } = require('../../ui');

module.exports = {
  category: 'מיינקראפט',
  data: new SlashCommandBuilder()
    .setName('verifypanel').setDescription('שליחת פאנל אימות חשבון מיינקראפט לערוץ הזה')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setContexts(0),
  async execute(i) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify_start').setLabel('✅ אימות חשבון').setStyle(ButtonStyle.Success));
    await i.channel.send({
      embeds: [brand(i.guild, COLORS.success).setTitle('🔗 אימות חשבון מיינקראפט')
        .setDescription('קשרו את חשבון המיינקראפט שלכם לדיסקורד כדי לקבל גישה לשאר השרת, רול מאומת ושם משתמש מסונכרן.')],
      components: [row],
    });
    await i.reply(ephemeral('✅ הפאנל נשלח.'));
  },
};
