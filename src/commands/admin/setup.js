const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { getSetting, setSetting, delSetting } = require('../../db');

const text = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const CHANNELS = {
  welcome: ['welcome_channel', 'ערוץ ברוכים הבאים'],
  levelup: ['levelup_channel', 'ערוץ הודעות עליית רמה'],
  question: ['question_channel', 'ערוץ שאלת היום (18:00)'],
  leaderboard: ['leaderboard_channel', 'ערוץ טבלת מובילים שבועית (ראשון 20:00)'],
  starboard: ['starboard_channel', 'ערוץ ה-Starboard (⭐)'],
};

module.exports = {
  category: 'ניהול',
  data: new SlashCommandBuilder()
    .setName('setup').setDescription('הגדרות הבוט לשרת')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setContexts(0)
    .addSubcommand((s) => s.setName('channel').setDescription('קביעת ערוץ לפיצ׳ר')
      .addStringOption((o) => o.setName('feature').setDescription('פיצ׳ר').setRequired(true)
        .addChoices(...Object.entries(CHANNELS).map(([value, [, name]]) => ({ name, value }))))
      .addChannelOption((o) => o.setName('channel').setDescription('הערוץ (ריק = ביטול)').addChannelTypes(...text)))
    .addSubcommand((s) => s.setName('autorole').setDescription('רול אוטומטי למצטרפים חדשים')
      .addRoleOption((o) => o.setName('role').setDescription('הרול (ריק = ביטול)')))
    .addSubcommand((s) => s.setName('modrole').setDescription('רול צוות לטיקטים')
      .addRoleOption((o) => o.setName('role').setDescription('הרול (ריק = ביטול)')))
    .addSubcommand((s) => s.setName('automod').setDescription('הפעלה/כיבוי של AutoMod (ספאם, הזמנות, תיוגים)')
      .addBooleanOption((o) => o.setName('enabled').setDescription('פעיל?').setRequired(true)))
    .addSubcommand((s) => s.setName('stars').setDescription('כמה ⭐ נדרשים ל-Starboard')
      .addIntegerOption((o) => o.setName('count').setDescription('כמות').setRequired(true).setMinValue(1).setMaxValue(50)))
    .addSubcommand((s) => s.setName('welcome_text').setDescription('טקסט ברוכים הבאים: {user} {server} {count}')
      .addStringOption((o) => o.setName('text').setDescription('הטקסט (ריק = ברירת מחדל)').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('show').setDescription('הצגת ההגדרות הנוכחיות')),
  async execute(i) {
    const g = i.guild.id;
    const sub = i.options.getSubcommand();
    const reply = (c) => i.reply({ content: c, flags: MessageFlags.Ephemeral });

    if (sub === 'channel') {
      const [key, label] = CHANNELS[i.options.getString('feature')];
      const ch = i.options.getChannel('channel');
      if (!ch) { delSetting(g, key); return reply(`${label}: בוטל.`); }
      setSetting(g, key, ch.id);
      return reply(`✅ ${label}: ${ch}`);
    }
    if (sub === 'autorole' || sub === 'modrole') {
      const key = sub === 'autorole' ? 'auto_role' : 'mod_role';
      const role = i.options.getRole('role');
      if (!role) { delSetting(g, key); return reply('בוטל.'); }
      if (sub === 'autorole' && (role.managed || role.position >= i.guild.members.me.roles.highest.position))
        return reply('הרול של הבוט צריך להיות **מעל** הרול הזה (וגם הוא לא יכול להיות רול של בוט).');
      setSetting(g, key, role.id);
      return reply(`✅ נשמר: ${role}`);
    }
    if (sub === 'automod') { setSetting(g, 'automod', i.options.getBoolean('enabled') ? '1' : '0'); return reply('✅ עודכן.'); }
    if (sub === 'stars') { setSetting(g, 'starboard_threshold', i.options.getInteger('count')); return reply('✅ עודכן.'); }
    if (sub === 'welcome_text') {
      const t = i.options.getString('text');
      if (!t) { delSetting(g, 'welcome_message'); return reply('חזר לברירת מחדל.'); }
      setSetting(g, 'welcome_message', t); return reply('✅ נשמר.');
    }
    const lines = Object.values(CHANNELS).map(([key, label]) => `${label}: ${getSetting(g, key) ? `<#${getSetting(g, key)}>` : '—'}`);
    lines.push(`רול אוטומטי: ${getSetting(g, 'auto_role') ? `<@&${getSetting(g, 'auto_role')}>` : '—'}`);
    lines.push(`רול צוות: ${getSetting(g, 'mod_role') ? `<@&${getSetting(g, 'mod_role')}>` : '—'}`);
    lines.push(`AutoMod: ${getSetting(g, 'automod') === '1' ? 'פעיל' : 'כבוי'}`);
    lines.push(`⭐ נדרשים: ${getSetting(g, 'starboard_threshold') ?? 3}`);
    return i.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  },
};
