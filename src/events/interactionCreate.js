const { Events, MessageFlags } = require('discord.js');
const { handleComponent } = require('../components');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
      } else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        await handleComponent(interaction);
      }
    } catch (err) {
      console.error('interaction error:', err);
      const msg = { content: '❌ משהו השתבש. נסו שוב.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
      else await interaction.reply(msg).catch(() => {});
    }
  },
};
