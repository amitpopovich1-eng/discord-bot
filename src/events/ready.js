const { Events, ActivityType } = require('discord.js');
const { startScheduler } = require('../scheduler');
const { reconcileTickets } = require('../tickets');
const { registerCommands } = require('../deploy-commands');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`מחובר כ-${client.user.tag} ב-${client.guilds.cache.size} שרתים`);
    client.user.setActivity('/help', { type: ActivityType.Listening });
    await registerCommands().catch((e) => console.error('רישום פקודות נכשל:', e.message));
    await reconcileTickets(client).catch((e) => console.error('ticket reconcile:', e.message));
    startScheduler(client);
  },
};
