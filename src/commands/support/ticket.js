const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../../db');
const { ephemeral } = require('../../ui');
const { isStaff } = require('../../perms');

const PERMS = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true };

module.exports = {
  category: 'תמיכה',
  data: new SlashCommandBuilder()
    .setName('ticket').setDescription('ניהול טיקט (בתוך ערוץ הטיקט)').setContexts(0)
    .addSubcommand((s) => s.setName('add').setDescription('הוספת משתמש לטיקט').addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('הסרת משתמש מהטיקט').addUserOption((o) => o.setName('user').setDescription('המשתמש').setRequired(true))),
  async execute(i) {
    const t = db.prepare("SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'").get(i.channel.id);
    if (!t) return i.reply(ephemeral('הפקודה עובדת רק בתוך ערוץ טיקט פתוח.'));
    if (!isStaff(i.member)) return i.reply(ephemeral('רק הצוות יכול לנהל משתתפים בטיקט.'));
    const user = i.options.getUser('user');
    if (i.options.getSubcommand() === 'add') {
      await i.channel.permissionOverwrites.edit(user, PERMS);
      return i.reply({ content: `✅ ${user} נוסף/ה לטיקט.`, allowedMentions: { users: [user.id] } });
    }
    if (user.id === t.user_id) return i.reply(ephemeral('אי אפשר להסיר את פותח הטיקט.'));
    await i.channel.permissionOverwrites.delete(user);
    await i.reply({ content: `✅ ${user} הוסר/ה מהטיקט.`, allowedMentions: { parse: [] } });
  },
};
