const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  category: 'בידור',
  data: new SlashCommandBuilder().setName('coinflip').setDescription('הטלת מטבע'),
  async execute(interaction) {
    await interaction.reply(Math.random() < 0.5 ? '🪙 עץ!' : '🪙 פלי!');
  },
};
