const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { db } = require('./db');
const { giveawayMessage } = require('./giveaways');
const tickets = require('./tickets');
const suggestions = require('./suggestions');
const { startVerification, proofMode } = require('./verify');
const { ephemeral, brand, COLORS } = require('./ui');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

const DANGEROUS = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageRoles
  | PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ModerateMembers;

/** מנתב כפתורים / תפריטי בחירה / מודלים לפי הקידומת של ה-customId */
async function handleComponent(i) {
  const [action, arg] = i.customId.split(':');

  if (action === 'gw_join') {
    const g = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(Number(arg));
    if (!g || g.ended) return i.reply(ephemeral('ההגרלה הסתיימה.'));
    const had = db.prepare('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?').get(g.id, i.user.id);
    if (had) db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?').run(g.id, i.user.id);
    else db.prepare('INSERT INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)').run(g.id, i.user.id);
    await i.message.edit(giveawayMessage(g)).catch(() => {});
    return i.reply(ephemeral(had ? 'ההשתתפות בוטלה.' : '✅ נרשמת להגרלה, בהצלחה!'));
  }

  if (action === 'ticket_select') {
    await i.showModal(tickets.modalFor(i.values[0]));
    // מאפס את הבחירה בתפריט כדי שאפשר יהיה לבחור שוב את אותה אפשרות
    i.message.edit(tickets.panelMessage(i.guild)).catch(() => {});
    return;
  }
  if (action === 'ticket_modal') return tickets.openTicket(i, arg);
  if (action === 'ticket_claim') return tickets.claimTicket(i);
  if (action === 'ticket_close') return tickets.closeTicket(i);

  if (action === 'sugg_up') return suggestions.vote(i, arg, 1);
  if (action === 'sugg_down') return suggestions.vote(i, arg, -1);

  if (action === 'verify_start') {
    const linked = db.prepare('SELECT ign FROM mc_links WHERE guild_id = ? AND user_id = ?').get(i.guild.id, i.user.id);
    if (linked) return i.reply(ephemeral(`כבר אומת החשבון **${linked.ign}** ✅`));
    return i.showModal(new ModalBuilder().setCustomId('verify_modal').setTitle('אימות חשבון מיינקראפט').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ign').setLabel('שם המשתמש שלך במיינקראפט').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(16).setRequired(true)),
    ));
  }
  if (action === 'verify_modal') {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const r = await startVerification(i.member, i.fields.getTextInputValue('ign').trim());
    if (r.error) return i.editReply(r.error);
    if (r.done) return i.editReply(`✅ החשבון **${r.ign}** קושר בהצלחה!`);
    return i.editReply({
      embeds: [brand(i.guild, COLORS.info).setTitle('כמעט שם! 🎮').setDescription(
        `היכנסו לשרת המיינקראפט עם **${r.ign}** והקלידו:\n\`\`\`/discord verify ${r.code}\`\`\`הקוד תקף עד <t:${Math.floor(r.expiresAt / 1000)}:R>.`)],
    });
  }

  if (action === 'role') {
    const role = i.guild.roles.cache.get(arg);
    if (!role) return i.reply(ephemeral('הרול כבר לא קיים.'));
    if (role.managed || role.position >= i.guild.members.me.roles.highest.position || role.permissions.has(DANGEROUS)) {
      return i.reply(ephemeral('אי אפשר לתת את הרול הזה.'));
    }
    const has = i.member.roles.cache.has(role.id);
    await (has ? i.member.roles.remove(role) : i.member.roles.add(role));
    return i.reply(ephemeral(has ? `הרול **${role.name}** הוסר.` : `קיבלת את הרול **${role.name}** ✅`));
  }
}

module.exports = { handleComponent, DANGEROUS };
