const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('חסימת משתמש מהשרת')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('סיבה'))
    .addIntegerOption((o) =>
      o.setName('delete_days').setDescription('מחיקת הודעות מהימים האחרונים (0-7)').setMinValue(0).setMaxValue(7),
    ),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'לא צוינה סיבה';
    const days = interaction.options.getInteger('delete_days') ?? 0;

    if (member) {
      if (!member.bannable) return interaction.reply({ content: 'אין לי הרשאה לחסום את המשתמש הזה.', flags: MessageFlags.Ephemeral });
      if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId)
        return interaction.reply({ content: 'אי אפשר לחסום מישהו עם רול גבוה או שווה לשלך.', flags: MessageFlags.Ephemeral });
    }

    await interaction.guild.members.ban(user, { reason: `${interaction.user.tag}: ${reason}`, deleteMessageSeconds: days * 86400 });
    await interaction.reply(`🔨 **${user.tag}** נחסם. סיבה: ${reason}`);
  },
};
