const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const { db } = require('../src/db');
const mod = require('../src/mod');

const G = 'g1';
const reset = () => db.exec('DELETE FROM cases; DELETE FROM settings');
const clientOf = (guild) => ({ user: { id: 'bot' }, guilds: { cache: new Map([[G, guild]]) } });
const row = (type) => db.prepare('SELECT * FROM cases WHERE type = ? ORDER BY id').all(type);

test('מספור Cases לפי שרת, ורישום בלוג המודרציה', async () => {
  reset();
  const g = h.fakeGuild(); const log = h.fakeTextChannel('log'); g.channels.cache.set('log', log);
  db.prepare("INSERT INTO settings VALUES (?, 'modlog_channel', 'log')").run(G);
  const a = await mod.createCase(g, { type: 'warn', userId: 'x', modId: 'm', reason: 'a' });
  const b = await mod.createCase(g, { type: 'warn', userId: 'x', modId: 'm', reason: 'b' });
  const other = await mod.createCase(h.fakeGuild('g2'), { type: 'warn', userId: 'x', modId: 'm' });
  assert.deepStrictEqual([a.case_no, b.case_no, other.case_no], [1, 2, 1]);
  assert.strictEqual(log.messages.length, 2);
});

test('באן זמני ישן לא מבטל באן קבוע שבא אחריו', async () => {
  reset();
  const g = h.fakeGuild(); const unbanned = []; g.members.unban = async (id) => unbanned.push(id);
  await mod.createCase(g, { type: 'tempban', userId: 'bad', modId: 'm', expiresAt: Date.now() - 1000 });
  await mod.createCase(g, { type: 'ban', userId: 'bad', modId: 'm', reason: 'permanent' });
  await mod.expireTempBans(clientOf(g));
  assert.deepStrictEqual(unbanned, []);
  assert.strictEqual(row('tempban')[0].active, 0);
});

test('באן זמני חדש מחליף ישן; המשימה הישנה לא משחררת מוקדם', async () => {
  reset();
  const g = h.fakeGuild(); const unbanned = []; g.members.unban = async (id) => unbanned.push(id);
  await mod.createCase(g, { type: 'tempban', userId: 'u', modId: 'm', expiresAt: Date.now() - 1000 });
  await mod.createCase(g, { type: 'tempban', userId: 'u', modId: 'm', expiresAt: Date.now() + 7 * 864e5 });
  await mod.expireTempBans(clientOf(g));
  assert.deepStrictEqual(unbanned, []);
  assert.deepStrictEqual(row('tempban').map((c) => c.active), [0, 1]);
});

test('באן ידני (/unban) מבטל את המשימה הזמנית', async () => {
  reset();
  const g = h.fakeGuild(); const unbanned = []; g.members.unban = async (id) => unbanned.push(id);
  await mod.createCase(g, { type: 'tempban', userId: 'u', modId: 'm', expiresAt: Date.now() - 1000 });
  await mod.createCase(g, { type: 'unban', userId: 'u', modId: 'm', action: async () => {} });
  await mod.expireTempBans(clientOf(g));
  assert.deepStrictEqual(unbanned, [], 'לא משחררים פעמיים');
});

test('באן זמני שפג: משוחרר פעם אחת, גם בשתי ריצות מקבילות', async () => {
  reset();
  const g = h.fakeGuild(); let n = 0; g.members.unban = async () => { n++; await new Promise((r) => setTimeout(r, 20)); };
  await mod.createCase(g, { type: 'tempban', userId: 'u', modId: 'm', expiresAt: Date.now() - 1000 });
  await Promise.all([mod.expireTempBans(clientOf(g)), mod.expireTempBans(clientOf(g))]);
  assert.strictEqual(n, 1);
  assert.strictEqual(row('unban').length, 1);
});

test('כשל זמני ב-unban: המשימה חוזרת לתור ומצליחה בניסיון הבא', async () => {
  reset();
  const g = h.fakeGuild(); let calls = 0;
  g.members.unban = async () => { calls++; if (calls === 1) throw Object.assign(new Error('Discord 500'), { code: 0 }); };
  await mod.createCase(g, { type: 'tempban', userId: 'u', modId: 'm', expiresAt: Date.now() - 1000 });
  const err = console.error; console.error = () => {};
  await mod.expireTempBans(clientOf(g));
  console.error = err;
  assert.strictEqual(row('tempban')[0].active, 1, 'נשארת לניסיון חוזר');
  await mod.expireTempBans(clientOf(g));
  assert.strictEqual(row('tempban')[0].active, 0);
  assert.strictEqual(calls, 2);
});

test('משתמש שכבר לא חסום (Unknown Ban) נחשב כמשוחרר', async () => {
  reset();
  const g = h.fakeGuild(); g.members.unban = async () => { throw Object.assign(new Error('Unknown Ban'), { code: 10026 }); };
  await mod.createCase(g, { type: 'tempban', userId: 'u', modId: 'm', expiresAt: Date.now() - 1000 });
  await mod.expireTempBans(clientOf(g));
  assert.strictEqual(row('tempban')[0].active, 0);
});

test('הפעלה מחדש: באן שפג בזמן שהבוט כבוי משוחרר מיד בעלייה (מה-DB)', async () => {
  reset();
  const g = h.fakeGuild(); const unbanned = []; g.members.unban = async (id) => unbanned.push(id);
  db.prepare("INSERT INTO cases (guild_id, case_no, type, user_id, mod_id, reason, created_at, expires_at, active) VALUES (?, 1, 'tempban', 'u', 'm', 'x', 0, 1, 1)").run(G);
  const { every } = require('../src/scheduler');
  let ran = 0;
  const timer = every('t', 3_600_000, async () => { ran++; await mod.expireTempBans(clientOf(g)); });
  await new Promise((r) => setTimeout(r, 30));
  clearInterval(timer);
  assert.strictEqual(ran, 1, 'רץ מיד, בלי לחכות לאינטרוול');
  assert.deepStrictEqual(unbanned, ['u']);
});

test('פעולה שנכשלה (ban) מוחקת את ה-Case ולא מבטלת באן זמני קיים', async () => {
  reset();
  const g = h.fakeGuild();
  await mod.createCase(g, { type: 'tempban', userId: 'u', modId: 'm', expiresAt: Date.now() + 1e6 });
  await assert.rejects(mod.createCase(g, { type: 'ban', userId: 'u', modId: 'm', action: async () => { throw new Error('Missing Permissions'); } }), /Missing Permissions/);
  assert.strictEqual(row('ban').length, 0);
  assert.strictEqual(row('tempban')[0].active, 1);
});

test('כשלון בשליחת DM ובלוג המודרציה לא מכשיל את הפעולה', async () => {
  reset();
  const g = h.fakeGuild();
  g.client.users.fetch = async () => ({ send: async () => { throw new Error('Cannot send messages to this user'); } });
  const log = h.fakeTextChannel('log', { fail: true }); g.channels.cache.set('log', log);
  db.prepare("INSERT INTO settings VALUES (?, 'modlog_channel', 'log')").run(G);
  const warn = console.warn; console.warn = () => {};
  const c = await mod.createCase(g, { type: 'warn', userId: 'x', modId: 'm', reason: 'r' });
  console.warn = warn;
  assert.strictEqual(c.dmOk, false);
  assert.strictEqual(row('warn').length, 1);
});

test('אזהרות מקבילות: סף הענישה מופעל פעם אחת בלבד', async () => {
  reset();
  const g = h.fakeGuild(); const m = h.fakeMember('v', { guild: g });
  await Promise.all([1, 2, 3].map(async () => {
    const c = await mod.createCase(g, { type: 'warn', userId: 'v', modId: 'm', reason: 'r' });
    await mod.applyAutoPunish(g, m, 'v', c.warnCount);
  }));
  assert.strictEqual(m.timeouts, 1);
  assert.strictEqual(m.timedOutFor, 36e5);
  assert.strictEqual(row('timeout').length, 1);
});

test('ענישה מדורגת: 3 -> שעה, 5 -> יממה, 7 -> חסימה; כבויה כשמבוטלת', async () => {
  reset();
  const g = h.fakeGuild(); const banned = []; g.members.ban = async (id) => banned.push(id);
  const m = h.fakeMember('v', { guild: g });
  const results = [];
  for (let n = 1; n <= 7; n++) {
    const c = await mod.createCase(g, { type: 'warn', userId: 'v', modId: 'm', reason: `w${n}` });
    results.push(await mod.applyAutoPunish(g, m, 'v', c.warnCount));
  }
  assert.deepStrictEqual(results.map((r) => r && r.slice(0, 2)), [null, null, '🔇', null, '🔇', null, '🔨']);
  assert.strictEqual(m.timedOutFor, 24 * 36e5);
  assert.deepStrictEqual(banned, ['v']);
  db.prepare("INSERT INTO settings VALUES (?, 'auto_punish', '0')").run(G);
  assert.strictEqual(await mod.applyAutoPunish(g, m, 'v', 3), null);
});

test('ענישה אוטומטית שנכשלה מחזירה הסבר ולא יוצרת Case מזויף', async () => {
  reset();
  const g = h.fakeGuild(); const m = h.fakeMember('v', { guild: g });
  m.moderatable = false;
  assert.match(await mod.applyAutoPunish(g, m, 'v', 3), /אין לי הרשאה/);
  m.moderatable = true; m.timeout = async () => { throw new Error('boom'); };
  const err = console.error; console.error = () => {};
  assert.match(await mod.applyAutoPunish(g, m, 'v', 3), /נכשלה/);
  console.error = err;
  assert.strictEqual(row('timeout').length, 0);
  assert.match(await mod.applyAutoPunish(g, null, 'gone', 3), /לא בשרת/);
});

test('אזהרות ישנות (מעל 30 יום) לא נספרות', async () => {
  reset();
  const g = h.fakeGuild();
  for (let n = 0; n < 4; n++) {
    db.prepare("INSERT INTO cases (guild_id, case_no, type, user_id, mod_id, reason, created_at) VALUES (?, ?, 'warn', 'v', 'm', 'old', ?)").run(G, n + 1, Date.now() - 40 * 864e5);
  }
  const c = await mod.createCase(g, { type: 'warn', userId: 'v', modId: 'm', reason: 'new' });
  assert.strictEqual(c.warnCount, 1);
});
