const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setSetting } = require('../../db');
const { panelMessage } = require('../../tickets');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'תמיכה',
  data: new SlashCommandBuilder()
    .setName('ticketpanel').setDescription('שליחת פאנל טיקטים לערוץ הנוכחי')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).setContexts(0)
    .addChannelOption((o) => o.setName('category').setDescription('קטגוריית דיסקורד שבה ייווצרו הטיקטים').addChannelTypes(4)),
  async execute(i) {
    const cat = i.options.getChannel('category');
    if (cat) setSetting(i.guild.id, 'ticket_category', cat.id);
    await i.channel.send(panelMessage(i.guild));
    await i.reply(ephemeral('✅ הפאנל נשלח.'));
  },
};
