const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { db } = require('../../db');
const { giveawayMessage, endGiveaway } = require('../../giveaways');
const { parseDuration } = require('../../util');

module.exports = {
  category: 'קהילה',
  data: new SlashCommandBuilder()
    .setName('giveaway').setDescription('ניהול הגרלות')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setContexts(0)
    .addSubcommand((s) => s.setName('start').setDescription('התחלת הגרלה')
      .addStringOption((o) => o.setName('prize').setDescription('הפרס').setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName('duration').setDescription('משך: 30m, 2h, 3d').setRequired(true))
      .addIntegerOption((o) => o.setName('winners').setDescription('מספר זוכים').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('end').setDescription('סיום מיידי')
      .addIntegerOption((o) => o.setName('id').setDescription('מספר הגרלה').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('הגרלה מחדש')
      .addIntegerOption((o) => o.setName('id').setDescription('מספר הגרלה').setRequired(true))),
  async execute(i) {
    const sub = i.options.getSubcommand();
    if (sub === 'start') {
      const ms = parseDuration(i.options.getString('duration'));
      if (!ms || ms < 10_000 || ms > 30 * 864e5) return i.reply({ content: 'משך לא תקין. דוגמאות: `30m`, `2h`, `3d` (עד 30 יום).', flags: MessageFlags.Ephemeral });
      const info = db.prepare('INSERT INTO giveaways (guild_id, channel_id, prize, winners, ends_at, host_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(i.guild.id, i.channel.id, i.options.getString('prize'), i.options.getInteger('winners') ?? 1, Date.now() + ms, i.user.id);
      const g = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(Number(info.lastInsertRowid));
      const msg = await i.channel.send(giveawayMessage(g));
      db.prepare('UPDATE giveaways SET message_id = ? WHERE id = ?').run(msg.id, g.id);
      return i.reply({ content: `✅ ההגרלה #${g.id} התחילה.`, flags: MessageFlags.Ephemeral });
    }
    const g = db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(i.options.getInteger('id'), i.guild.id);
    if (!g) return i.reply({ content: 'הגרלה לא נמצאה.', flags: MessageFlags.Ephemeral });
    if (sub === 'end') {
      if (g.ended) return i.reply({ content: 'ההגרלה כבר הסתיימה.', flags: MessageFlags.Ephemeral });
      await endGiveaway(i.client, g);
      return i.reply({ content: '✅ ההגרלה הסתיימה.', flags: MessageFlags.Ephemeral });
    }
    if (!g.ended) return i.reply({ content: 'ההגרלה עדיין פעילה.', flags: MessageFlags.Ephemeral });
    const { pickWinners } = require('../../giveaways');
    const w = pickWinners(g.id, g.winners);
    await i.reply(w.length ? `🔁 זוכים חדשים ל-**${g.prize}**: ${w.map((id) => `<@${id}>`).join(', ')}` : 'אין משתתפים.');
  },
};
