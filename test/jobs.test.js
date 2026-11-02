const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { db } = require('../src/db');
const gw = require('../src/giveaways');
const { every } = require('../src/scheduler');

test('הגרלה מסתיימת פעם אחת בלבד גם כשהפקודה והתזמון רצים במקביל', async () => {
  db.exec('DELETE FROM giveaways; DELETE FROM giveaway_entries');
  const id = Number(db.prepare("INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winners, ends_at, host_id) VALUES ('g1','c','m','פרס',1,0,'h')").run().lastInsertRowid);
  db.prepare("INSERT INTO giveaway_entries VALUES (?, 'winner')").run(id);
  const g = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
  let announced = 0;
  const ch = { messages: { fetch: async () => null }, send: async () => { announced++; } };
  const client = { channels: { fetch: async () => ch } };
  const [a, b] = await Promise.all([gw.endGiveaway(client, g), gw.endGiveaway(client, g)]);
  assert.strictEqual(announced, 1);
  assert.deepStrictEqual([a, b].filter((x) => x === null).length, 1);
  assert.strictEqual(await gw.endGiveaway(client, g), null);
});

test('הגרלה שפג תוקפה בזמן שהבוט כבוי מסוכמת מיד בעלייה', async () => {
  db.exec('DELETE FROM giveaways; DELETE FROM giveaway_entries');
  db.prepare("INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winners, ends_at, host_id) VALUES ('g1','c','m','פרס',1,1,'h')").run();
  let announced = 0;
  const client = { channels: { fetch: async () => ({ messages: { fetch: async () => null }, send: async () => { announced++; } }) } };
  const { db: d } = require('../src/db');
  const timer = every('g', 3_600_000, async () => {
    for (const g of d.prepare('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(Date.now())) await gw.endGiveaway(client, g);
  });
  await new Promise((r) => setTimeout(r, 30));
  clearInterval(timer);
  assert.strictEqual(announced, 1);
});

test('every(): אין חפיפה בין ריצות, וחריגה לא עוצרת את התזמון', async () => {
  let concurrent = 0; let max = 0; let calls = 0;
  const err = console.error; console.error = () => {};
  const timer = every('x', 5, async () => {
    calls++; concurrent++; max = Math.max(max, concurrent);
    await new Promise((r) => setTimeout(r, 20));
    concurrent--;
    if (calls === 1) throw new Error('boom');
  });
  await new Promise((r) => setTimeout(r, 120));
  clearInterval(timer); console.error = err;
  assert.strictEqual(max, 1);
  assert.ok(calls >= 2, 'ממשיך אחרי חריגה');
});

test('נתונים נשמרים אחרי הפעלה מחדש אמיתית (קובץ DB, תהליכים נפרדים)', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'persist-')), 'sub', 'bot.db');
  const run = (script) => execFileSync(process.execPath, ['--no-warnings', '-e', script], {
    env: { ...process.env, DB_PATH: file }, cwd: path.join(__dirname, '..'), encoding: 'utf8',
  }).trim();
  run(`const {db,setSetting}=require('./src/db');setSetting('g1','automod','1');
    db.prepare("INSERT INTO cases (guild_id,case_no,type,user_id,mod_id,reason,created_at,expires_at,active) VALUES ('g1',1,'tempban','u','m','x',0,9999999999999,1)").run();
    db.prepare("INSERT INTO mc_links VALUES ('g1','u1','abc','Notch',0,1)").run();
    db.prepare("INSERT INTO giveaways (guild_id,channel_id,prize,winners,ends_at,host_id) VALUES ('g1','c','p',1,9999999999999,'h')").run();`);
  const out = JSON.parse(run(`const {db,getSetting}=require('./src/db');console.log(JSON.stringify({
    setting:getSetting('g1','automod'),
    tempban:db.prepare("SELECT active FROM cases").get().active,
    link:db.prepare("SELECT ign FROM mc_links").get().ign,
    gw:db.prepare("SELECT ended FROM giveaways").get().ended,
    version:db.prepare('PRAGMA user_version').get().user_version}))`));
  assert.deepStrictEqual(out, { setting: '1', tempban: 1, link: 'Notch', gw: 0, version: 2 });
});

test('מיגרציה: DB ישן (גרסה 0, סכמה מלפני המיגרציות) משודרג בלי אובדן נתונים', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mig-')), 'old.db');
  const { DatabaseSync } = require('node:sqlite');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE settings (guild_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY (guild_id, key));
    INSERT INTO settings VALUES ('g1','automod','1');`);
  old.close();
  const out = execFileSync(process.execPath, ['--no-warnings', '-e',
    `const {db,getSetting}=require('./src/db');console.log(getSetting('g1','automod'),db.prepare('PRAGMA user_version').get().user_version,db.prepare("SELECT name FROM sqlite_master WHERE name='verify_codes'").all().length)`],
  { env: { ...process.env, DB_PATH: file }, cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  assert.strictEqual(out, '1 2 1');
});

test('DB_PATH לא כתיב: יציאה עם הודעה ברורה, לא קריסה סתומה', () => {
  let msg = '';
  // "תיקיית" ה-DB היא בעצם קובץ רגיל => ENOTDIR
  const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ro-')), 'iamafile');
  fs.writeFileSync(blocker, 'x');
  try {
    execFileSync(process.execPath, ['--no-warnings', '-e', "require('./src/db')"], {
      timeout: 15000, env: { ...process.env, DB_PATH: path.join(blocker, 'bot.db') }, cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: 'pipe',
    });
  } catch (e) { msg = String(e.stderr); }
  assert.match(msg, /DB_PATH/);
});
