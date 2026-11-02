const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// DB_PATH=':memory:' משמש בבדיקות כדי שלא ישתפו קובץ
let file = process.env.DB_PATH;
if (!file) {
  const dir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'bot.db');
}
const db = new DatabaseSync(file);

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
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, case_no INTEGER NOT NULL,
  type TEXT NOT NULL, user_id TEXT NOT NULL, mod_id TEXT NOT NULL, reason TEXT,
  created_at INTEGER NOT NULL, expires_at INTEGER, active INTEGER NOT NULL DEFAULT 0,
  UNIQUE (guild_id, case_no)
);
CREATE INDEX IF NOT EXISTS idx_cases_user ON cases (guild_id, user_id);
CREATE TABLE IF NOT EXISTS filter_words (
  guild_id TEXT NOT NULL, word TEXT NOT NULL, PRIMARY KEY (guild_id, word)
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, number INTEGER NOT NULL,
  channel_id TEXT NOT NULL, user_id TEXT NOT NULL, category TEXT NOT NULL, subject TEXT,
  claimed_by TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL,
  UNIQUE (guild_id, number)
);
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, number INTEGER NOT NULL,
  message_id TEXT, user_id TEXT NOT NULL, content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', response TEXT, UNIQUE (guild_id, number)
);
CREATE TABLE IF NOT EXISTS suggestion_votes (
  suggestion_id INTEGER NOT NULL, user_id TEXT NOT NULL, vote INTEGER NOT NULL,
  PRIMARY KEY (suggestion_id, user_id)
);
CREATE TABLE IF NOT EXISTS mc_links (
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL, uuid TEXT NOT NULL, ign TEXT NOT NULL,
  verified_at INTEGER NOT NULL, proven INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id), UNIQUE (guild_id, uuid)
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
