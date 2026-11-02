const { Events } = require('discord.js');
const { markChannelDeleted } = require('../tickets');

module.exports = {
  name: Events.ChannelDelete,
  execute(channel) {
    markChannelDeleted(channel.id);
  },
};
