const { SlashCommandBuilder } = require('discord.js');
const { getSetting } = require('../../db');
const { brand, COLORS, ephemeral } = require('../../ui');

module.exports = {
  category: 'מיינקראפט',
  data: new SlashCommandBuilder().setName('status').setDescription('סטטוס שרת המיינקראפט (שחקנים, גרסה)').setContexts(0),
  async execute(i) {
    const address = getSetting(i.guild.id, 'mc_address');
    if (!address) return i.reply(ephemeral('כתובת השרת לא הוגדרה. מנהל: `/setup mcaddress`'));
    await i.deferReply();
    let d;
    try {
      const res = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(8000) });
      d = await res.json();
    } catch {
      return i.editReply('לא הצלחתי לבדוק את הסטטוס כרגע.');
    }
    const e = brand(i.guild, d.online ? COLORS.success : COLORS.danger).setTitle(`${d.online ? '🟢' : '🔴'} ${address}`);
    if (d.online) {
      e.addFields(
        { name: 'שחקנים', value: `${d.players?.online ?? 0}/${d.players?.max ?? '?'}`, inline: true },
        { name: 'גרסה', value: d.version ?? '—', inline: true },
      );
      if (d.motd?.clean?.length) e.setDescription(d.motd.clean.join('\n').slice(0, 300));
      if (d.icon) e.setThumbnail(`https://api.mcsrvstat.us/icon/${encodeURIComponent(address)}`);
    } else e.setDescription('השרת כבוי או לא זמין.');
    await i.editReply({ embeds: [e] });
  },
};
