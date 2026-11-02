const { Events, EmbedBuilder } = require('discord.js');
const { getSetting } = require('../db');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const roleId = getSetting(member.guild.id, 'auto_role');
    if (roleId) await member.roles.add(roleId, 'רול אוטומטי למצטרפים').catch(() => {});

    const unverified = getSetting(member.guild.id, 'unverified_role');
    if (unverified) await member.roles.add(unverified, 'ממתין לאימות').catch(() => {});

    const channelId = getSetting(member.guild.id, 'welcome_channel');
    const channel = channelId && member.guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return;

    const custom = getSetting(member.guild.id, 'welcome_message');
    const text = (custom || 'ברוכים הבאים ל-**{server}**, {user}! 🎉\nאתם החבר/ה מספר **{count}**. ספרו לנו קצת על עצמכם!')
      .replaceAll('{user}', `${member}`)
      .replaceAll('{server}', member.guild.name)
      .replaceAll('{count}', String(member.guild.memberCount));

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(text)
      .setThumbnail(member.user.displayAvatarURL());
    await channel.send({ content: `${member}`, embeds: [embed] }).catch(() => {});
  },
};
