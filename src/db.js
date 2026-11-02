const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'bot.db'));

db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS settings (
  guild_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT,
  PRIMARY KEY (guild_id, key)
);
CREATE TABLE IF NOT EXISTS users (
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0, weekly_xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0, messages INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0,
  last_daily TEXT,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS level_roles (
  guild_id TEXT NOT NULL, level INTEGER NOT NULL, role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, level)
);
CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
  mod_id TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
  message_id TEXT, prize TEXT NOT NULL, winners INTEGER NOT NULL DEFAULT 1,
  ends_at INTEGER NOT NULL, ended INTEGER NOT NULL DEFAULT 0, host_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS giveaway_entries (
  giveaway_id INTEGER NOT NULL, user_id TEXT NOT NULL,
  PRIMARY KEY (giveaway_id, user_id)
);
CREATE TABLE IF NOT EXISTS starboard (
  message_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, star_message_id TEXT
);
`);

const q = {
  getSetting: db.prepare('SELECT value FROM settings WHERE guild_id = ? AND key = ?'),
  setSetting: db.prepare(
    'INSERT INTO settings (guild_id, key, value) VALUES (?, ?, ?) ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value'
  ),
  delSetting: db.prepare('DELETE FROM settings WHERE guild_id = ? AND key = ?'),
};

module.exports = {
  db,
  getSetting: (guildId, key) => q.getSetting.get(guildId, key)?.value ?? null,
  setSetting: (guildId, key, value) => q.setSetting.run(guildId, key, String(value)),
  delSetting: (guildId, key) => q.delSetting.run(guildId, key),
};
