const {
  MessageFlags, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { db, getSetting } = require('./db');
const { giveawayMessage } = require('./giveaways');

const eph = (content) => ({ content, flags: MessageFlags.Ephemeral });

async function handleButton(i) {
  const [action, arg] = i.customId.split(':');

  if (action === 'gw_join') {
    const g = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(Number(arg));
    if (!g || g.ended) return i.reply(eph('ההגרלה הסתיימה.'));
    const had = db.prepare('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?').get(g.id, i.user.id);
    if (had) {
      db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?').run(g.id, i.user.id);
    } else {
      db.prepare('INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)').run(g.id, i.user.id);
    }
    await i.message.edit(giveawayMessage(g)).catch(() => {});
    return i.reply(eph(had ? 'ההשתתפות בוטלה.' : '✅ נרשמת להגרלה, בהצלחה!'));
  }

  if (action === 'ticket_open') {
    const existing = i.guild.channels.cache.find((c) => c.topic === `ticket:${i.user.id}`);
    if (existing) return i.reply(eph(`כבר יש לך טיקט פתוח: ${existing}`));
    const modRole = getSetting(i.guild.id, 'mod_role');
    const overwrites = [
      { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: i.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ];
    if (modRole) overwrites.push({ id: modRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    const ch = await i.guild.channels.create({
      name: `ticket-${i.user.username}`.slice(0, 90),
      type: ChannelType.GuildText,
      topic: `ticket:${i.user.id}`,
      parent: getSetting(i.guild.id, 'ticket_category') || null,
      permissionOverwrites: overwrites,
    });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 סגירת טיקט').setStyle(ButtonStyle.Danger)
    );
    await ch.send({ content: `${i.user}${modRole ? ` <@&${modRole}>` : ''} תארו את הנושא ונחזור אליכם בהקדם.`, components: [row] });
    return i.reply(eph(`הטיקט נפתח: ${ch}`));
  }

  if (action === 'ticket_close') {
    const ownerId = i.channel.topic?.startsWith('ticket:') ? i.channel.topic.slice(7) : null;
    if (!ownerId) return i.reply(eph('זה לא ערוץ טיקט.'));
    const modRole = getSetting(i.guild.id, 'mod_role');
    const allowed = i.user.id === ownerId || i.member.permissions.has(PermissionFlagsBits.ManageChannels) || (modRole && i.member.roles.cache.has(modRole));
    if (!allowed) return i.reply(eph('אין לך הרשאה לסגור את הטיקט.'));
    await i.reply('הטיקט ייסגר בעוד 5 שניות...');
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
  }
}

module.exports = { handleButton };
