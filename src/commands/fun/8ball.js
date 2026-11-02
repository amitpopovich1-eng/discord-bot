const { SlashCommandBuilder } = require('discord.js');

const answers = ['בהחלט כן', 'ללא ספק', 'כל הסימנים מצביעים על כן', 'כנראה שכן', 'לא ברור, נסה שוב', 'כדאי שלא אספר לך עכשיו', 'אל תסמוך על זה', 'התשובה שלי היא לא', 'מאוד מפוקפק'];

module.exports = {
  category: 'בידור',
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('שאל את כדור הקסמים')
    .addStringOption((o) => o.setName('question').setDescription('השאלה שלך').setRequired(true)),
  async execute(interaction) {
    const q = interaction.options.getString('question');
    await interaction.reply(`🎱 **${q}**\n${answers[Math.floor(Math.random() * answers.length)]}`);
  },
};
