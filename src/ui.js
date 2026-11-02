const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType, MessageFlags,
} = require('discord.js');

const COLORS = {
  brand: 0x5865f2, success: 0x57f287, danger: 0xed4245, warn: 0xfee75c,
  info: 0x3498db, muted: 0x747f8d, gold: 0xf1c40f,
};

/** Embed אחיד עם פוטר של השרת */
function brand(guild, color = COLORS.brand) {
  const e = new EmbedBuilder().setColor(color).setTimestamp();
  if (guild) e.setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined });
  return e;
}

/** הודעות שיש להן collector פעיל (דפדוף/עזרה); נמחק בסיום או בהפעלה מחדש */
const activeCollectors = new Set();
const trackCollector = (msg, collector) => {
  activeCollectors.add(msg.id);
  collector.on('end', () => activeCollectors.delete(msg.id));
};
const isCollectorActive = (id) => activeCollectors.has(id);

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

/**
 * ממפה מערך עמודים (Embeds) לתצוגה עם כפתורי ניווט.
 * ה-collector חי על ההודעה עצמה, לכן אין צורך ב-customId גלובלי.
 */
async function paginate(interaction, pages, { ephemeralReply = false, idleMs = 120_000 } = {}) {
  if (pages.length === 0) return;
  let page = 0;
  const withFooter = (n) => EmbedBuilder.from(pages[n]).setFooter({
    text: `${pages[n].data.footer?.text ? `${pages[n].data.footer.text} · ` : ''}עמוד ${n + 1}/${pages.length}`,
    iconURL: pages[n].data.footer?.icon_url,
  });
  const row = (n, disabled = false) => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pg_first').setLabel('⏮').setStyle(ButtonStyle.Secondary).setDisabled(disabled || n === 0),
    new ButtonBuilder().setCustomId('pg_prev').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(disabled || n === 0),
    new ButtonBuilder().setCustomId('pg_next').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(disabled || n === pages.length - 1),
    new ButtonBuilder().setCustomId('pg_last').setLabel('⏭').setStyle(ButtonStyle.Secondary).setDisabled(disabled || n === pages.length - 1),
  );
  const payload = (n, disabled) => ({
    embeds: [withFooter(n)], components: pages.length > 1 ? [row(n, disabled)] : [], allowedMentions: { parse: [] },
  });
  const flags = ephemeralReply ? MessageFlags.Ephemeral : undefined;
  const msg = await interaction.reply({ ...payload(0), flags, withResponse: true }).then((r) => r.resource.message);
  if (pages.length === 1) return;

  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, idle: idleMs });
  trackCollector(msg, collector);
  collector.on('collect', async (b) => {
    if (b.user.id !== interaction.user.id) return b.reply(ephemeral('רק מי שהריץ את הפקודה יכול לדפדף.'));
    page = { pg_first: 0, pg_prev: page - 1, pg_next: page + 1, pg_last: pages.length - 1 }[b.customId] ?? page;
    page = Math.max(0, Math.min(pages.length - 1, page));
    await b.update(payload(page));
  });
  collector.on('end', () => interaction.editReply(payload(page, true)).catch(() => {}));
}

/** מחלק רשימת שורות לעמודי Embed */
function linePages(guild, title, lines, perPage = 10, color = COLORS.brand) {
  const pages = [];
  for (let i = 0; i < lines.length; i += perPage) {
    pages.push(brand(guild, color).setTitle(title).setDescription(lines.slice(i, i + perPage).join('\n')));
  }
  return pages;
}

module.exports = { COLORS, brand, ephemeral, trackCollector, isCollectorActive, paginate, linePages, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle };
