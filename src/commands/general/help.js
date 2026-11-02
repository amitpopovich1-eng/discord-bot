const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');
const { brand, trackCollector } = require('../../ui');

const ICONS = { 'קהילה': '🏆', 'מודרציה': '🛡️', 'ניהול': '⚙️', 'מיינקראפט': '⛏️', 'תמיכה': '🎫', 'בידור': '🎲', 'כללי': '📖' };

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('רשימת כל הפקודות'),
  async execute(i) {
    const groups = {};
    for (const cmd of i.client.commands.values()) {
      // לא מציגים פקודות שהמשתמש לא יכול להריץ
      const need = cmd.data.default_member_permissions;
      if (need && !i.memberPermissions?.has(BigInt(need))) continue;
      (groups[cmd.category ?? 'כללי'] ??= []).push(cmd);
    }
    const names = Object.keys(groups);
    const embedFor = (name) => brand(i.guild).setTitle(`${ICONS[name] ?? '📌'} ${name}`)
      .setDescription(groups[name].map((c) => `**/${c.data.name}** — ${c.data.description}`).join('\n'));
    const menu = (selected) => new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('help_select').setPlaceholder('בחרו קטגוריה')
        .addOptions(names.map((n) => ({ label: n, value: n, emoji: ICONS[n] ?? '📌', default: n === selected }))));

    const first = names[0];
    const msg = await i.reply({ embeds: [embedFor(first)], components: [menu(first)], flags: MessageFlags.Ephemeral, withResponse: true }).then((r) => r.resource.message);
    const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, idle: 120_000 });
    trackCollector(msg, col);
    col.on('collect', (s) => s.update({ embeds: [embedFor(s.values[0])], components: [menu(s.values[0])] }));
    col.on('end', () => i.editReply({ components: [] }).catch(() => {}));
  },
};
