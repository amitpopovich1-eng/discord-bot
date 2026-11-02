const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

module.exports = {
  category: 'קהילה',
  data: new SlashCommandBuilder()
    .setName('poll').setDescription('יצירת סקר').setContexts(0)
    .addStringOption((o) => o.setName('question').setDescription('השאלה').setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName('option1').setDescription('אפשרות 1').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('option2').setDescription('אפשרות 2').setRequired(true).setMaxLength(100))
    .addStringOption((o) => o.setName('option3').setDescription('אפשרות 3').setMaxLength(100))
    .addStringOption((o) => o.setName('option4').setDescription('אפשרות 4').setMaxLength(100))
    .addStringOption((o) => o.setName('option5').setDescription('אפשרות 5').setMaxLength(100)),
  async execute(i) {
    const opts = [1, 2, 3, 4, 5].map((n) => i.options.getString(`option${n}`)).filter(Boolean);
    const embed = new EmbedBuilder().setColor(0x3498db).setTitle(`📊 ${i.options.getString('question')}`)
      .setDescription(opts.map((o, n) => `${EMOJI[n]} ${o}`).join('\n')).setFooter({ text: `סקר של ${i.user.username}` });
    const msg = await i.reply({ embeds: [embed], withResponse: true }).then((r) => r.resource.message);
    for (let n = 0; n < opts.length; n++) await msg.react(EMOJI[n]).catch(() => {});
  },
};
