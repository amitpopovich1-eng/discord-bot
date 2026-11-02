const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// DB_PATH: נתיב לקובץ ה-DB (בפריסה: קובץ על volume קבוע). ':memory:' לבדיקות.
let file = process.env.DB_PATH;
if (!file) {
  file = path.join(__dirname, '..', 'data', 'bot.db');
}
if (file !== ':memory:') {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.accessSync(path.dirname(file), fs.constants.W_OK);
  } catch (e) {
    console.error(`❌ אי אפשר לכתוב ל-${path.dirname(file)} (${e.code}). הגדירו DB_PATH לתיקייה עם הרשאת כתיבה (volume קבוע).`);
    process.exit(1);
  }
}
const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');

/**
 * מיגרציות לפי PRAGMA user_version. כל מיגרציה רצה פעם אחת, בתוך טרנזקציה.
 * לעולם לא עורכים מיגרציה קיימת - רק מוסיפים חדשה בסוף המערך.
 */
const MIGRATIONS = [
  // 1: סכמה התחלתית
  `
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
  `,
  // 2: קודי אימות מתמידים (hash בלבד), הגבלת ניסיונות, אינדקסים
  `
  CREATE TABLE verify_codes (
    code_hash TEXT PRIMARY KEY, guild_id TEXT NOT NULL, uuid TEXT NOT NULL, ign TEXT NOT NULL,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_verify_codes_uuid ON verify_codes (guild_id, uuid);
  CREATE TABLE verify_attempts (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, failures INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX idx_tickets_channel ON tickets (channel_id);
  CREATE INDEX idx_tickets_user ON tickets (guild_id, user_id, status);
  CREATE INDEX idx_cases_tempban ON cases (type, active, expires_at);
  `,
  // 3: אימות דרך קישור Discord בפרופיל Hypixel (במקום קודים מפלאגין שרת)
  `
  DROP TABLE IF EXISTS verify_codes;
  ALTER TABLE mc_links ADD COLUMN method TEXT;
  ALTER TABLE mc_links ADD COLUMN matched_handle TEXT;
  `,
];

function migrate() {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      console.error(`❌ מיגרציה ${v + 1} נכשלה:`, e.message);
      process.exit(1);
    }
  }
}

/** מריץ fn בטרנזקציה אטומית (סינכרוני); זורק => rollback */
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}


migrate();

const q = {
  getSetting: db.prepare('SELECT value FROM settings WHERE guild_id = ? AND key = ?'),
  setSetting: db.prepare(
    'INSERT INTO settings (guild_id, key, value) VALUES (?, ?, ?) ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value'
  ),
  delSetting: db.prepare('DELETE FROM settings WHERE guild_id = ? AND key = ?'),
};

module.exports = {
  db,
  transaction,
  getSetting: (guildId, key) => q.getSetting.get(guildId, key)?.value ?? null,
  setSetting: (guildId, key, value) => q.setSetting.run(guildId, key, String(value)),
  delSetting: (guildId, key) => q.delSetting.run(guildId, key),
};
