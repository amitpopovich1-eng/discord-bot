const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  category: 'מודרציה',
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('השתקה זמנית של משתמש (0 = הסרה)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(0)
    .addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))
    .addIntegerOption((o) =>
      o.setName('minutes').setDescription('כמה דקות (עד 40320 = 28 ימים)').setRequired(true).setMinValue(0).setMaxValue(40320),
    )
    .addStringOption((o) => o.setName('reason').setDescription('סיבה')),
  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') ?? 'לא צוינה סיבה';

    if (!target) return interaction.reply({ content: 'המשתמש לא נמצא בשרת.', flags: MessageFlags.Ephemeral });
    if (!target.moderatable) return interaction.reply({ content: 'אין לי הרשאה להשתיק את המשתמש הזה.', flags: MessageFlags.Ephemeral });

    await target.timeout(minutes === 0 ? null : minutes * 60_000, `${interaction.user.tag}: ${reason}`);
    await interaction.reply(
      minutes === 0 ? `🔊 ההשתקה של **${target.user.tag}** הוסרה.` : `🔇 **${target.user.tag}** הושתק ל-${minutes} דקות. סיבה: ${reason}`,
    );
  },
};
