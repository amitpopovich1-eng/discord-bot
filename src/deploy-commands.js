require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { loadCommands } = require('./loadCommands');

/** Registers all slash commands. Guild commands update instantly; global ones can take up to an hour. */
async function registerCommands() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) throw new Error('Missing DISCORD_TOKEN or CLIENT_ID');

  const body = [...loadCommands().values()].map((c) => c.data.toJSON());
  const rest = new REST().setToken(DISCORD_TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  const result = await rest.put(route, { body });
  console.log(`Registered ${result.length} commands ${GUILD_ID ? `to guild ${GUILD_ID}` : 'globally'}.`);
}

module.exports = { registerCommands };

if (require.main === module) {
  registerCommands().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
