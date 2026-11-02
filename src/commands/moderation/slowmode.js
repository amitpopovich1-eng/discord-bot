const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('slowmode').setDescription('מצב איטי בערוץ הנוכחי')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).setContexts(0)
    .addIntegerOption((o) => o.setName('seconds').setDescription('שניות (0 = כיבוי)').setRequired(true).setMinValue(0).setMaxValue(21600)),
  async execute(i) {
    const s = i.options.getInteger('seconds');
    await i.channel.setRateLimitPerUser(s, i.user.tag);
    await i.reply(s ? `🐢 מצב איטי: ${s} שניות.` : '⚡ מצב איטי כובה.');
  },
};
