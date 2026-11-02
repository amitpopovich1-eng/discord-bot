const { PermissionFlagsBits } = require('discord.js');
const { getSetting } = require('./db');

/** איש צוות = יש לו הרול שהוגדר כ-staff, או הרשאת Manage Messages */
function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  const roleId = getSetting(member.guild.id, 'mod_role');
  return Boolean(roleId && member.roles.cache.has(roleId));
}

/** האם `actor` רשאי לבצע פעולה על `target` (היררכיית רולים) */
function canActOn(actor, target) {
  if (!target) return true;
  if (actor.id === actor.guild.ownerId) return true;
  return target.id !== actor.guild.ownerId && target.roles.highest.position < actor.roles.highest.position;
}

module.exports = { isStaff, canActOn };
