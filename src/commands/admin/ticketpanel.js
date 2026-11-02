const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { setSetting } = require('../../db');

module.exports = {
  category: 'ניהול',
  data: new SlashCommandBuilder()
    .setName('ticketpanel').setDescription('שליחת פאנל פתיחת טיקטים לערוץ הנוכחי')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).setContexts(0)
    .addChannelOption((o) => o.setName('category').setDescription('קטגוריה שבה ייווצרו הטיקטים').addChannelTypes(4)),
  async execute(i) {
    const cat = i.options.getChannel('category');
    if (cat) setSetting(i.guild.id, 'ticket_category', cat.id);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_open').setLabel('🎫 פתיחת טיקט').setStyle(ButtonStyle.Success)
    );
    await i.channel.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('צריכים עזרה?').setDescription('לחצו על הכפתור כדי לפתוח פנייה פרטית עם הצוות.')], components: [row] });
    await i.reply({ content: '✅ הפאנל נשלח.', flags: MessageFlags.Ephemeral });
  },
};
