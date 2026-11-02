const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('./db');
const { brand, COLORS, ephemeral } = require('./ui');

const STATUS = {
  open: { label: '🗳️ פתוחה להצבעה', color: COLORS.brand },
  approved: { label: '✅ אושרה', color: COLORS.success },
  denied: { label: '❌ נדחתה', color: COLORS.danger },
  considered: { label: '🤔 בבחינה', color: COLORS.warn },
};

const counts = (id) => db.prepare(
  'SELECT COALESCE(SUM(vote = 1), 0) AS up, COALESCE(SUM(vote = -1), 0) AS down FROM suggestion_votes WHERE suggestion_id = ?'
).get(id);

function suggestionMessage(guild, s, author) {
  const { up, down } = counts(s.id);
  const st = STATUS[s.status];
  const e = brand(guild, st.color).setTitle(`💡 הצעה #${s.number}`).setDescription(s.content)
    .addFields({ name: 'סטטוס', value: st.label, inline: true }, { name: 'הצבעות', value: `👍 ${up} · 👎 ${down}`, inline: true });
  if (author) e.setAuthor({ name: author.username, iconURL: author.displayAvatarURL() });
  if (s.response) e.addFields({ name: 'תגובת הצוות', value: s.response.slice(0, 1000) });
  const closed = s.status !== 'open';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sugg_up:${s.id}`).setLabel(`👍 ${up}`).setStyle(ButtonStyle.Success).setDisabled(closed),
    new ButtonBuilder().setCustomId(`sugg_down:${s.id}`).setLabel(`👎 ${down}`).setStyle(ButtonStyle.Danger).setDisabled(closed),
  );
  return { embeds: [e], components: [row] };
}

async function vote(i, id, value) {
  const s = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(Number(id));
  if (!s || s.status !== 'open') return i.reply(ephemeral('ההצבעה על ההצעה הזו נסגרה.'));
  const prev = db.prepare('SELECT vote FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?').get(s.id, i.user.id);
  if (prev?.vote === value) db.prepare('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?').run(s.id, i.user.id);
  else db.prepare('INSERT INTO suggestion_votes (suggestion_id, user_id, vote) VALUES (?, ?, ?) ON CONFLICT(suggestion_id, user_id) DO UPDATE SET vote = excluded.vote').run(s.id, i.user.id, value);
  const author = await i.client.users.fetch(s.user_id).catch(() => null);
  await i.update(suggestionMessage(i.guild, s, author));
}

module.exports = { suggestionMessage, vote, STATUS };
