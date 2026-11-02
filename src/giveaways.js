const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('./db');

const entries = db.prepare('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?');
const count = db.prepare('SELECT COUNT(*) AS n FROM giveaway_entries WHERE giveaway_id = ?');

function giveawayMessage(g, ended = false, winners = []) {
  const n = count.get(g.id).n;
  const embed = new EmbedBuilder()
    .setColor(ended ? 0x747f8d : 0xeb459e)
    .setTitle(`🎁 ${g.prize}`)
    .setDescription(
      ended
        ? winners.length ? `🏆 הזוכים: ${winners.map((id) => `<@${id}>`).join(', ')}` : 'אין מספיק משתתפים 😕'
        : `לחצו על הכפתור כדי להשתתף!\nמסתיים <t:${Math.floor(g.ends_at / 1000)}:R>\nזוכים: **${g.winners}**\nנוצר ע"י <@${g.host_id}>`
    )
    .setFooter({ text: `${n} משתתפים` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gw_join:${g.id}`).setLabel('🎉 השתתפות').setStyle(ButtonStyle.Primary).setDisabled(ended)
  );
  return { embeds: [embed], components: [row] };
}

function pickWinners(giveawayId, n) {
  const ids = entries.all(giveawayId).map((r) => r.user_id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

async function endGiveaway(client, g) {
  db.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?').run(g.id);
  const winners = pickWinners(g.id, g.winners);
  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel) return winners;
  const msg = await channel.messages.fetch(g.message_id).catch(() => null);
  if (msg) await msg.edit(giveawayMessage(g, true, winners)).catch(() => {});
  await channel.send(
    winners.length ? `🎊 מזל טוב ${winners.map((id) => `<@${id}>`).join(', ')}! זכיתם ב-**${g.prize}**` : `לא היו משתתפים בהגרלה על **${g.prize}**.`
  ).catch(() => {});
  return winners;
}

module.exports = { giveawayMessage, endGiveaway, pickWinners };
