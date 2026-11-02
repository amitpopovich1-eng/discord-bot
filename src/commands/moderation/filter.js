const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../../db');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('filter').setDescription('ניהול מילים אסורות (AutoMod)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setContexts(0)
    .addSubcommand((s) => s.setName('add').setDescription('הוספת מילה').addStringOption((o) => o.setName('word').setDescription('מילה').setRequired(true).setMaxLength(50)))
    .addSubcommand((s) => s.setName('remove').setDescription('הסרת מילה').addStringOption((o) => o.setName('word').setDescription('מילה').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('רשימה')),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const g = i.guild.id;
    if (sub === 'list') {
      const words = db.prepare('SELECT word FROM filter_words WHERE guild_id = ? ORDER BY word').all(g).map((r) => `\`${r.word}\``);
      return i.reply(ephemeral(words.length ? words.join(', ') : 'הרשימה ריקה.'));
    }
    const word = i.options.getString('word').trim().toLowerCase();
    if (!word) return i.reply(ephemeral('מילה ריקה.'));
    if (sub === 'add') db.prepare('INSERT OR IGNORE INTO filter_words (guild_id, word) VALUES (?, ?)').run(g, word);
    else db.prepare('DELETE FROM filter_words WHERE guild_id = ? AND word = ?').run(g, word);
    await i.reply(ephemeral(sub === 'add' ? `✅ \`${word}\` נוספה. (ודאו ש-/setup automod פעיל)` : `✅ \`${word}\` הוסרה.`));
  },
};
