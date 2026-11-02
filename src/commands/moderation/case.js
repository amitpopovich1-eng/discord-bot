const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../../db');
const { caseEmbed } = require('../../mod');
const { ephemeral } = require('../../ui');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('case').setDescription('הצגת Case לפי מספר')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).setContexts(0)
    .addIntegerOption((o) => o.setName('number').setDescription('מספר Case').setRequired(true).setMinValue(1)),
  async execute(i) {
    const c = db.prepare('SELECT * FROM cases WHERE guild_id = ? AND case_no = ?').get(i.guild.id, i.options.getInteger('number'));
    if (!c) return i.reply(ephemeral('Case לא נמצא.'));
    await i.reply({ embeds: [caseEmbed(i.guild, c)], flags: 64, allowedMentions: { parse: [] } });
  },
};
