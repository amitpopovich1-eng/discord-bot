const {
  ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, AttachmentBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const { db, getSetting } = require('./db');
const { brand, COLORS, ephemeral } = require('./ui');
const { isStaff } = require('./perms');

const CATEGORIES = {
  support: { label: 'תמיכה כללית', emoji: '🛠️', description: 'שאלות ובעיות כלליות' },
  report: { label: 'דיווח על שחקן', emoji: '🚩', description: 'צ׳יטרים, הטרדה, הפרת חוקים' },
  appeal: { label: 'ערעור על עונש', emoji: '⚖️', description: 'ערעור על חסימה או השתקה' },
  bug: { label: 'דיווח על באג', emoji: '🐞', description: 'משהו לא עובד בשרת' },
  other: { label: 'אחר', emoji: '💬', description: 'כל דבר אחר' },
};
const MAX_OPEN_PER_USER = 3;

function panelMessage(guild) {
  const menu = new StringSelectMenuBuilder().setCustomId('ticket_select').setPlaceholder('בחרו סוג פנייה...')
    .addOptions(Object.entries(CATEGORIES).map(([value, c]) => ({ value, label: c.label, description: c.description, emoji: c.emoji })));
  return {
    embeds: [brand(guild, COLORS.success).setTitle('🎫 מרכז תמיכה')
      .setDescription('צריכים עזרה? רוצים לדווח על שחקן או לערער על עונש?\nבחרו סוג פנייה מהתפריט ונפתח עבורכם ערוץ פרטי עם הצוות.')],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

function modalFor(category) {
  const c = CATEGORIES[category];
  return new ModalBuilder().setCustomId(`ticket_modal:${category}`).setTitle(`${c.emoji} ${c.label}`).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('נושא').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(80).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('פרטים').setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1000).setRequired(true)
      .setPlaceholder(category === 'report' ? 'שם השחקן, מה קרה, ראיות...' : category === 'appeal' ? 'שם במשחק, סיבת העונש, למה לדעתכם צריך להסיר...' : '')),
  );
}

const controls = (t, claimed = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('ticket_claim').setLabel(claimed ? 'נתפס' : '🙋 תפיסת טיקט').setStyle(ButtonStyle.Primary).setDisabled(claimed),
  new ButtonBuilder().setCustomId('ticket_close').setLabel('🔒 סגירה').setStyle(ButtonStyle.Danger),
);

function ticketEmbed(guild, t, user) {
  const c = CATEGORIES[t.category];
  return brand(guild, t.claimed_by ? COLORS.info : COLORS.success)
    .setTitle(`${c.emoji} טיקט #${String(t.number).padStart(4, '0')} · ${c.label}`)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .addFields(
      { name: 'נושא', value: t.subject },
      { name: 'פרטים', value: t.details?.slice(0, 1000) || '—' },
      { name: 'סטטוס', value: t.claimed_by ? `🙋 בטיפול: <@${t.claimed_by}>` : '⏳ ממתין לצוות' },
    );
}

async function openTicket(i, category) {
  if (!CATEGORIES[category]) return i.reply(ephemeral('סוג פנייה לא מוכר.'));
  const open = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'").get(i.guild.id, i.user.id).n;
  if (open >= MAX_OPEN_PER_USER) return i.reply(ephemeral(`יש לך כבר ${open} טיקטים פתוחים. סגרו אחד לפני שתפתחו חדש.`));
  await i.deferReply({ flags: 64 });

  const staffRole = getSetting(i.guild.id, 'mod_role');
  const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
  const overwrites = [
    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: i.user.id, allow },
    { id: i.client.user.id, allow: [...allow, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] },
  ];
  if (staffRole) overwrites.push({ id: staffRole, allow });

  const number = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM tickets WHERE guild_id = ?').get(i.guild.id).n;
  const t = {
    number, category, subject: i.fields.getTextInputValue('subject'), details: i.fields.getTextInputValue('details'), claimed_by: null,
  };
  const ch = await i.guild.channels.create({
    name: `${CATEGORIES[category].emoji}┃${category}-${String(number).padStart(4, '0')}`,
    type: ChannelType.GuildText,
    topic: `Ticket #${number} · ${i.user.tag} · ${i.user.id}`,
    parent: getSetting(i.guild.id, 'ticket_category') || null,
    permissionOverwrites: overwrites,
  });
  db.prepare('INSERT INTO tickets (guild_id, number, channel_id, user_id, category, subject, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(i.guild.id, number, ch.id, i.user.id, category, t.subject, Date.now());
  await ch.send({
    content: `${i.user}${staffRole ? ` <@&${staffRole}>` : ''}`,
    embeds: [ticketEmbed(i.guild, t, i.user)], components: [controls(t)],
    allowedMentions: { users: [i.user.id], roles: staffRole ? [staffRole] : [] },
  });
  await i.editReply(`✅ הטיקט נפתח: ${ch}`);
}

const byChannel = db.prepare("SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'");

async function claimTicket(i) {
  const t = byChannel.get(i.channel.id);
  if (!t) return i.reply(ephemeral('זה לא טיקט פתוח.'));
  if (!isStaff(i.member)) return i.reply(ephemeral('רק הצוות יכול לתפוס טיקטים.'));
  if (t.claimed_by) return i.reply(ephemeral(`הטיקט כבר בטיפול של <@${t.claimed_by}>.`));
  db.prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?').run(i.user.id, t.id);
  const opener = await i.client.users.fetch(t.user_id).catch(() => i.user);
  const old = i.message.embeds[0];
  const embed = ticketEmbed(i.guild, { ...t, claimed_by: i.user.id, details: old?.fields?.find((f) => f.name === 'פרטים')?.value }, opener);
  await i.update({ embeds: [embed], components: [controls(t, true)] });
  await i.followUp({ content: `🙋 ${i.user} ייקח/תיקח את הפנייה. <@${t.user_id}>`, allowedMentions: { users: [t.user_id] } });
}

async function buildTranscript(channel) {
  const all = [];
  let before;
  for (let n = 0; n < 10; n++) { // עד 1000 הודעות
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  return all.map((m) => {
    const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const extras = [...m.attachments.values()].map((a) => `\n   [קובץ] ${a.url}`).join('');
    return `[${time}] ${m.author.tag}: ${m.content}${m.embeds.length ? ' [embed]' : ''}${extras}`;
  }).join('\n');
}

async function closeTicket(i) {
  const t = byChannel.get(i.channel.id);
  if (!t) return i.reply(ephemeral('זה לא טיקט פתוח.'));
  if (!(i.user.id === t.user_id || isStaff(i.member))) return i.reply(ephemeral('אין לך הרשאה לסגור את הטיקט.'));
  await i.reply('🔒 סוגר ומייצר תמלול... הערוץ יימחק בעוד כמה שניות.');
  db.prepare("UPDATE tickets SET status = 'closed' WHERE id = ?").run(t.id);

  const text = await buildTranscript(i.channel).catch(() => '(לא ניתן היה לייצר תמלול)');
  const name = `ticket-${String(t.number).padStart(4, '0')}.txt`;
  const file = () => new AttachmentBuilder(Buffer.from(text || '(ריק)', 'utf8'), { name });
  const summary = brand(i.guild, COLORS.muted).setTitle(`📁 טיקט #${String(t.number).padStart(4, '0')} נסגר`).addFields(
    { name: 'נפתח ע"י', value: `<@${t.user_id}>`, inline: true },
    { name: 'נסגר ע"י', value: `${i.user}`, inline: true },
    { name: 'נתפס ע"י', value: t.claimed_by ? `<@${t.claimed_by}>` : '—', inline: true },
    { name: 'קטגוריה', value: CATEGORIES[t.category]?.label ?? t.category, inline: true },
    { name: 'נושא', value: t.subject ?? '—' },
  );
  const logId = getSetting(i.guild.id, 'ticket_log_channel');
  const log = logId && i.guild.channels.cache.get(logId);
  if (log?.isTextBased()) await log.send({ embeds: [summary], files: [file()], allowedMentions: { parse: [] } }).catch(() => {});
  const opener = await i.client.users.fetch(t.user_id).catch(() => null);
  await opener?.send({ embeds: [summary], files: [file()] }).catch(() => {});
  setTimeout(() => i.channel.delete(`Ticket #${t.number} closed`).catch(() => {}), 5000);
}

module.exports = { CATEGORIES, panelMessage, modalFor, openTicket, claimTicket, closeTicket, buildTranscript };
