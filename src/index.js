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

client.on('error', (e) => console.error('[discord] client error:', e.message));
client.on('warn', (m) => console.warn('[discord]', m));
client.on('shardDisconnect', (ev, id) => console.warn(`[discord] shard ${id} disconnected (${ev.code}); discord.js will reconnect`));
client.on('shardReconnecting', (id) => console.log(`[discord] shard ${id} reconnecting`));

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e));

// סגירה מסודרת (deploy / הפעלה מחדש): סוגרים חיבור ל-Discord ול-DB כדי שה-WAL ייכתב
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: סוגר...`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await client.destroy();
    require('./db').db.close();
  } catch (e) {
    console.error('שגיאה בסגירה:', e.message);
  }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error(`❌ התחברות ל-Discord נכשלה: ${e.message}. בדקו את DISCORD_TOKEN ואת ה-Intents ב-Developer Portal.`);
  process.exit(1);
});
