const { SlashCommandBuilder, EmbedBuilder, time } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('מידע על משתמש')
    .addUserOption((o) => o.setName('user').setDescription('המשתמש (ברירת מחדל: אתה)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || 0x5865f2)
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'הצטרף לדיסקורד', value: time(user.createdAt, 'D'), inline: true },
      );
    if (member?.joinedAt) embed.addFields({ name: 'הצטרף לשרת', value: time(member.joinedAt, 'D'), inline: true });

    await interaction.reply({ embeds: [embed] });
  },
};
