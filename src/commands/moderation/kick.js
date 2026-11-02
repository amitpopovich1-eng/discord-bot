const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('הרחקת משתמש מהשרת')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('סיבה')),
  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'לא צוינה סיבה';

    if (!target) return interaction.reply({ content: 'המשתמש לא נמצא בשרת.', flags: MessageFlags.Ephemeral });
    if (!target.kickable) return interaction.reply({ content: 'אין לי הרשאה להרחיק את המשתמש הזה.', flags: MessageFlags.Ephemeral });
    if (target.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: 'אי אפשר להרחיק מישהו עם רול גבוה או שווה לשלך.', flags: MessageFlags.Ephemeral });

    await target.kick(`${interaction.user.tag}: ${reason}`);
    await interaction.reply(`👢 **${target.user.tag}** הורחק. סיבה: ${reason}`);
  },
};
