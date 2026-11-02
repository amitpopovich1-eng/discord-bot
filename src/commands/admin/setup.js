const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getSetting, setSetting, delSetting } = require('../../db');
const { ephemeral, brand } = require('../../ui');

const text = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const CHANNELS = {
  welcome: ['welcome_channel', 'ברוכים הבאים'],
  levelup: ['levelup_channel', 'עליית רמה'],
  question: ['question_channel', 'שאלת היום (18:00)'],
  leaderboard: ['leaderboard_channel', 'טבלה שבועית (ראשון 20:00)'],
  starboard: ['starboard_channel', 'Starboard ⭐'],
  modlog: ['modlog_channel', 'לוג מודרציה ואימותים'],
  ticketlog: ['ticket_log_channel', 'לוג וטרנסקריפטים של טיקטים'],
  suggestions: ['suggestion_channel', 'הצעות'],
};
const ROLES = {
  staff: ['mod_role', 'רול צוות (טיקטים, תפיסה, ניהול)'],
  auto: ['auto_role', 'רול אוטומטי למצטרפים'],
  verified: ['verified_role', 'רול מאומת'],
  unverified: ['unverified_role', 'רול לא מאומת (יוסר באימות)'],
};
const choices = (o) => Object.entries(o).map(([value, [, name]]) => ({ name, value }));

module.exports = {
  category: 'ניהול',
  data: new SlashCommandBuilder()
    .setName('setup').setDescription('הגדרות הבוט לשרת')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setContexts(0)
    .addSubcommand((s) => s.setName('channel').setDescription('קביעת ערוץ לפיצ׳ר')
      .addStringOption((o) => o.setName('feature').setDescription('פיצ׳ר').setRequired(true).addChoices(...choices(CHANNELS)))
      .addChannelOption((o) => o.setName('channel').setDescription('הערוץ (ריק = ביטול)').addChannelTypes(...text)))
    .addSubcommand((s) => s.setName('role').setDescription('קביעת רול')
      .addStringOption((o) => o.setName('feature').setDescription('סוג').setRequired(true).addChoices(...choices(ROLES)))
      .addRoleOption((o) => o.setName('role').setDescription('הרול (ריק = ביטול)')))
    .addSubcommand((s) => s.setName('automod').setDescription('AutoMod: ספאם, הזמנות, תיוגים, מילים אסורות')
      .addBooleanOption((o) => o.setName('enabled').setDescription('פעיל?').setRequired(true)))
    .addSubcommand((s) => s.setName('autopunish').setDescription('ענישה אוטומטית: 3/5/7 אזהרות ב-30 יום')
      .addBooleanOption((o) => o.setName('enabled').setDescription('פעיל?').setRequired(true)))
    .addSubcommand((s) => s.setName('mcaddress').setDescription('כתובת שרת המיינקראפט (ל-/status)')
      .addStringOption((o) => o.setName('address').setDescription('למשל play.example.com').setRequired(true).setMaxLength(100)))
    .addSubcommand((s) => s.setName('verify').setDescription('הגדרות אימות')
      .addIntegerOption((o) => o.setName('min_account_age').setDescription('גיל מינימלי של חשבון דיסקורד בימים (0 = כבוי)').setMinValue(0).setMaxValue(365))
      .addBooleanOption((o) => o.setName('nickname').setDescription('לשנות כינוי לשם במיינקראפט?')))
    .addSubcommand((s) => s.setName('stars').setDescription('כמה ⭐ נדרשים ל-Starboard')
      .addIntegerOption((o) => o.setName('count').setDescription('כמות').setRequired(true).setMinValue(1).setMaxValue(50)))
    .addSubcommand((s) => s.setName('welcome_text').setDescription('טקסט ברוכים הבאים: {user} {server} {count}')
      .addStringOption((o) => o.setName('text').setDescription('הטקסט (ריק = ברירת מחדל)').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('show').setDescription('הצגת ההגדרות הנוכחיות')),
  async execute(i) {
    const g = i.guild.id;
    const sub = i.options.getSubcommand();
    const reply = (c) => i.reply(ephemeral(c));

    if (sub === 'channel') {
      const [key, label] = CHANNELS[i.options.getString('feature')];
      const ch = i.options.getChannel('channel');
      if (!ch) { delSetting(g, key); return reply(`${label}: בוטל.`); }
      setSetting(g, key, ch.id);
      return reply(`✅ ${label}: ${ch}`);
    }
    if (sub === 'role') {
      const feature = i.options.getString('feature');
      const [key, label] = ROLES[feature];
      const role = i.options.getRole('role');
      if (!role) { delSetting(g, key); return reply(`${label}: בוטל.`); }
      if (feature !== 'staff' && (role.managed || role.position >= i.guild.members.me.roles.highest.position)) {
        return reply('הרול של הבוט צריך להיות **מעל** הרול הזה (וגם הוא לא יכול להיות רול של בוט).');
      }
      setSetting(g, key, role.id);
      return reply(`✅ ${label}: ${role}`);
    }
    if (sub === 'automod' || sub === 'autopunish') { setSetting(g, sub === 'automod' ? 'automod' : 'auto_punish', i.options.getBoolean('enabled') ? '1' : '0'); return reply('✅ עודכן.'); }
    if (sub === 'mcaddress') { setSetting(g, 'mc_address', i.options.getString('address').trim()); return reply('✅ נשמר.'); }
    if (sub === 'verify') {
      const age = i.options.getInteger('min_account_age'); const nick = i.options.getBoolean('nickname');
      if (age !== null) setSetting(g, 'min_account_age_days', age);
      if (nick !== null) setSetting(g, 'verify_nickname', nick ? '1' : '0');
      return reply('✅ עודכן.');
    }
    if (sub === 'stars') { setSetting(g, 'starboard_threshold', i.options.getInteger('count')); return reply('✅ עודכן.'); }
    if (sub === 'welcome_text') {
      const t = i.options.getString('text');
      if (!t) { delSetting(g, 'welcome_message'); return reply('חזר לברירת מחדל.'); }
      setSetting(g, 'welcome_message', t); return reply('✅ נשמר.');
    }
    const ch = (k) => (getSetting(g, k) ? `<#${getSetting(g, k)}>` : '—');
    const ro = (k) => (getSetting(g, k) ? `<@&${getSetting(g, k)}>` : '—');
    const e = brand(i.guild).setTitle('⚙️ הגדרות')
      .addFields(
        { name: 'ערוצים', value: Object.values(CHANNELS).map(([k, l]) => `${l}: ${ch(k)}`).join('\n') },
        { name: 'רולים', value: Object.values(ROLES).map(([k, l]) => `${l}: ${ro(k)}`).join('\n') },
        { name: 'כללי', value: [
          `AutoMod: ${getSetting(g, 'automod') === '1' ? 'פעיל' : 'כבוי'}`,
          `ענישה אוטומטית: ${getSetting(g, 'auto_punish') === '0' ? 'כבויה' : 'פעילה'}`,
          `שרת מיינקראפט: ${getSetting(g, 'mc_address') ?? '—'}`,
          `גיל חשבון מינימלי: ${getSetting(g, 'min_account_age_days') ?? 0} ימים`,
          `⭐ נדרשים: ${getSetting(g, 'starboard_threshold') ?? 3}`,
          `אימות מיינקראפט: ${process.env.HYPIXEL_API_KEY ? 'פעיל (דרך Hypixel)' : '⚠️ כבוי - חסר HYPIXEL_API_KEY'}`,
        ].join('\n') },
      );
    return i.reply({ embeds: [e], flags: 64, allowedMentions: { parse: [] } });
  },
};
