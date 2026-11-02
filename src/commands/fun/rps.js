const { SlashCommandBuilder } = require('discord.js');

const choices = { rock: '🪨 אבן', paper: '📄 נייר', scissors: '✂️ מספריים' };
const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

module.exports = {
  category: 'בידור',
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('אבן נייר ומספריים נגד הבוט')
    .addStringOption((o) =>
      o.setName('choice').setDescription('הבחירה שלך').setRequired(true).addChoices(
        { name: 'אבן', value: 'rock' },
        { name: 'נייר', value: 'paper' },
        { name: 'מספריים', value: 'scissors' },
      ),
    ),
  async execute(interaction) {
    const user = interaction.options.getString('choice');
    const bot = Object.keys(choices)[Math.floor(Math.random() * 3)];
    const result = user === bot ? 'תיקו! 🤝' : beats[user] === bot ? 'ניצחת! 🎉' : 'הפסדת! 😈';
    await interaction.reply(`אתה: ${choices[user]}\nהבוט: ${choices[bot]}\n**${result}**`);
  },
};
