require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands } = require('./loadCommands');

if (!process.env.DISCORD_TOKEN) {
  console.error('חסר DISCORD_TOKEN בקובץ .env (ראה .env.example)');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,        // privileged
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,      // privileged
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = loadCommands();

for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter((f) => f.endsWith('.js'))) {
  const evt = require(`./events/${file}`);
  client[evt.once ? 'once' : 'on'](evt.name, (...args) =>
    Promise.resolve(evt.execute(...args, client)).catch((e) => console.error(`[${evt.name}]`, e))
  );
}

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));
client.login(process.env.DISCORD_TOKEN);
