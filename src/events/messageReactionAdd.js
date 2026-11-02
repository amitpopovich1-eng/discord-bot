const { Events, EmbedBuilder } = require('discord.js');
const { db, getSetting } = require('../db');

const get = db.prepare('SELECT * FROM starboard WHERE message_id = ?');
const insert = db.prepare('INSERT INTO starboard (message_id, guild_id, star_message_id) VALUES (?, ?, ?)');

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
    const msg = reaction.message;
    if (!msg.guild || reaction.emoji.name !== '⭐') return;

    const channelId = getSetting(msg.guild.id, 'starboard_channel');
    if (!channelId || msg.channel.id === channelId) return;
    const threshold = Number(getSetting(msg.guild.id, 'starboard_threshold') ?? 3);
    if (reaction.count < threshold || get.get(msg.id)) return;

    const target = msg.guild.channels.cache.get(channelId);
    if (!target?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0xffac33)
      .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
      .setDescription(msg.content || '*(ללא טקסט)*')
      .addFields({ name: 'מקור', value: `[קפיצה להודעה](${msg.url})` })
      .setTimestamp(msg.createdAt);
    const img = msg.attachments.find((a) => a.contentType?.startsWith('image/'));
    if (img) embed.setImage(img.url);

    const sent = await target.send({ content: `⭐ **${reaction.count}** | ${msg.channel}`, embeds: [embed] });
    insert.run(msg.id, msg.guild.id, sent.id);
  },
};
