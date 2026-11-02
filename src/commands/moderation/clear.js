const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('מחיקת הודעות בערוץ')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setContexts(0)
    .addIntegerOption((o) => o.setName('amount').setDescription('כמה הודעות (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    // bulkDelete can't remove messages older than 14 days; "true" filters them out
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `🧹 נמחקו ${deleted.size} הודעות.`, flags: MessageFlags.Ephemeral });
  },
};
