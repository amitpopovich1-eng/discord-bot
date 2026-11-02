const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('lock').setDescription('נעילה/שחרור של הערוץ הנוכחי ל-@everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).setContexts(0)
    .addBooleanOption((o) => o.setName('locked').setDescription('נעול? (ברירת מחדל: כן)')),
  async execute(i) {
    const lock = i.options.getBoolean('locked') ?? true;
    await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: lock ? false : null }, { reason: i.user.tag });
    await i.reply(lock ? '🔒 הערוץ ננעל.' : '🔓 הערוץ שוחרר.');
  },
};
