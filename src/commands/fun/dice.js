const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  category: 'בידור',
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('הטלת קוביה')
    .addIntegerOption((o) => o.setName('sides').setDescription('מספר פאות (ברירת מחדל 6)').setMinValue(2).setMaxValue(1000)),
  async execute(interaction) {
    const sides = interaction.options.getInteger('sides') ?? 6;
    await interaction.reply(`🎲 יצא **${1 + Math.floor(Math.random() * sides)}** (מתוך ${sides})`);
  },
};
