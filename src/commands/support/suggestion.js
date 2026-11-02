const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db, getSetting } = require('../../db');
const { suggestionMessage } = require('../../suggestions');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'תמיכה',
  data: new SlashCommandBuilder()
    .setName('suggestion').setDescription('טיפול בהצעה (צוות)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).setContexts(0)
    .addIntegerOption((o) => o.setName('number').setDescription('מספר הצעה').setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName('status').setDescription('סטטוס').setRequired(true).addChoices(
      { name: 'אושרה', value: 'approved' }, { name: 'נדחתה', value: 'denied' }, { name: 'בבחינה', value: 'considered' }))
    .addStringOption((o) => o.setName('response').setDescription('הסבר לקהילה').setMaxLength(800)),
  async execute(i) {
    const s = db.prepare('SELECT * FROM suggestions WHERE guild_id = ? AND number = ?').get(i.guild.id, i.options.getInteger('number'));
    if (!s) return i.reply(ephemeral('הצעה לא נמצאה.'));
    const status = i.options.getString('status');
    db.prepare('UPDATE suggestions SET status = ?, response = ? WHERE id = ?').run(status, i.options.getString('response'), s.id);
    const updated = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(s.id);
    const ch = i.guild.channels.cache.get(getSetting(i.guild.id, 'suggestion_channel'));
    const msg = await ch?.messages.fetch(s.message_id).catch(() => null);
    const author = await i.client.users.fetch(s.user_id).catch(() => null);
    if (msg) await msg.edit(suggestionMessage(i.guild, updated, author));
    await i.reply(ephemeral(`✅ הצעה #${s.number} עודכנה.`));
  },
};
