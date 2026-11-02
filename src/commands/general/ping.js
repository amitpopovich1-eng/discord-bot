const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('בדיקת זמן תגובה של הבוט'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: 'Pong...', withResponse: true });
    const latency = sent.resource.message.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 Pong! השהיה: **${latency}ms** | API: **${Math.round(interaction.client.ws.ping)}ms**`);
  },
};
