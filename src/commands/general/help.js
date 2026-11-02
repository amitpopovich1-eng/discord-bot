const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('רשימת כל הפקודות'),
  async execute(interaction) {
    const groups = {};
    for (const cmd of interaction.client.commands.values()) {
      const category = cmd.category ?? 'כללי';
      (groups[category] ??= []).push(`**/${cmd.data.name}** — ${cmd.data.description}`);
    }

    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('📖 פקודות הבוט');
    for (const [name, lines] of Object.entries(groups)) embed.addFields({ name, value: lines.join('\n') });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
