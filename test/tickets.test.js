const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const { db } = require('../src/db');
const tickets = require('../src/tickets');
const { handleComponent } = require('../src/components');

const G = 'g1';
const reset = () => db.exec('DELETE FROM tickets; DELETE FROM settings');
const STAFF = 'STAFFROLE';

function env({ createDelay = 0, failCreate = false } = {}) {
  const guild = h.fakeGuild();
  guild.roles.cache.set(STAFF, { id: STAFF });
  let n = 0; const created = [];
  guild.channels.create = async (opts) => {
    if (createDelay) await new Promise((r) => setTimeout(r, createDelay));
    if (failCreate) throw new Error('Missing Permissions');
    const ch = h.fakeTextChannel(`c${++n}`); ch.opts = opts; ch.history = [];
    guild.channels.cache.set(ch.id, ch); created.push(ch); return ch;
  };
  db.prepare("INSERT INTO settings VALUES (?, 'mod_role', ?)").run(G, STAFF);
  return { guild, created };
}
const open = (guild, userId, fields = { subject: 'בעיה', details: 'פירוט של הבעיה כאן' }) => {
  const member = h.fakeMember(userId, { guild });
  const i = h.fakeInteraction({ guild, user: member.user, member, fields });
  return tickets.openTicket(i, 'support').then(() => i);
};

test('פתיחת טיקט: הרשאות הערוץ - נסתר מ-everyone, פתוח רק לפותח/צוות/בוט', async () => {
  reset();
  const { guild, created } = env();
  const i = await open(guild, 'u1');
  assert.match(h.allText(i), /הטיקט נפתח/);
  const ow = created[0].opts.permissionOverwrites;
  const byId = Object.fromEntries(ow.map((o) => [o.id, o]));
  assert.ok(byId[G].deny.length === 1 && !byId[G].allow, 'everyone לא רואה');
  assert.deepStrictEqual(Object.keys(byId).sort(), [G, STAFF, 'bot', 'u1'].sort());
  const row = db.prepare('SELECT * FROM tickets').get();
  assert.deepStrictEqual([row.status, row.channel_id, row.user_id], ['open', created[0].id, 'u1']);
});

test('לחיצות מקבילות: המכסה (3) נאכפת, אין ערוצים יתומים ואין מספרים כפולים', async () => {
  reset();
  const { guild, created } = env({ createDelay: 15 });
  const results = await Promise.all([1, 2, 3, 4, 5, 6].map(() => open(guild, 'u1')));
  const ok = results.filter((i) => /הטיקט נפתח/.test(h.allText(i))).length;
  assert.strictEqual(ok, 3);
  assert.strictEqual(created.length, 3, 'לא נוצרו ערוצים מעבר למכסה');
  const rows = db.prepare("SELECT * FROM tickets WHERE status = 'open'").all();
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(new Set(rows.map((r) => r.number)).size, 3);
  assert.deepStrictEqual(new Set(rows.map((r) => r.channel_id)), new Set(created.map((c) => c.id)));
});

test('משתמשים שונים במקביל מקבלים מספרים שונים', async () => {
  reset();
  const { guild } = env({ createDelay: 10 });
  await Promise.all(['a', 'b', 'c', 'd'].map((u) => open(guild, u)));
  const nums = db.prepare('SELECT number FROM tickets').all().map((r) => r.number).sort();
  assert.deepStrictEqual(nums, [1, 2, 3, 4]);
});

test('כשל ביצירת ערוץ: אין שורה תקועה, המכסה משתחררת והמשתמש מקבל הסבר', async () => {
  reset();
  const { guild } = env({ failCreate: true });
  const err = console.error; console.error = () => {};
  const i = await open(guild, 'u1');
  console.error = err;
  assert.match(h.allText(i), /לא הצלחתי לפתוח/);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM tickets').get().n, 0);
});

function ticketCtx(guild, ch, userId, { perms = [], roles = [] } = {}) {
  const member = h.fakeMember(userId, { guild, perms, roles });
  const i = h.fakeInteraction({ guild, user: member.user, member, channel: ch, message: { embeds: [{ fields: [{ name: 'פרטים', value: 'x' }] }], edit: async () => {} } });
  i.client.users.fetch = async () => ({ username: 'opener', displayAvatarURL: () => 'https://cdn.example.com/a.png', send: async () => { i.dmSent = true; } });
  return i;
}

test('הרשאות: רק צוות תופס; רק פותח/צוות סוגרים; תפיסה כפולה נדחית', async () => {
  reset();
  const { guild, created } = env();
  await open(guild, 'owner1');
  const ch = created[0];
  const stranger = ticketCtx(guild, ch, 'stranger');
  await tickets.claimTicket(stranger);
  assert.match(h.allText(stranger), /רק הצוות/);
  const sClose = ticketCtx(guild, ch, 'stranger');
  await tickets.closeTicket(sClose);
  assert.match(h.allText(sClose), /אין לך הרשאה/);
  assert.strictEqual(db.prepare('SELECT status FROM tickets').get().status, 'open');

  const s1 = ticketCtx(guild, ch, 's1', { roles: [STAFF] });
  await tickets.claimTicket(s1);
  assert.strictEqual(db.prepare('SELECT claimed_by FROM tickets').get().claimed_by, 's1');
  const s2 = ticketCtx(guild, ch, 's2', { roles: [STAFF] });
  await tickets.claimTicket(s2);
  assert.match(h.allText(s2), /כבר בטיפול|כבר תפס/);
  assert.strictEqual(db.prepare('SELECT claimed_by FROM tickets').get().claimed_by, 's1');
});

test('כפתור בערוץ שאינו טיקט / טיקט סגור לא עושה כלום', async () => {
  reset();
  const { guild } = env();
  const rnd = h.fakeTextChannel('random');
  const i = ticketCtx(guild, rnd, 'u1', { roles: [STAFF] });
  await tickets.closeTicket(i);
  assert.match(h.allText(i), /לא טיקט פתוח/);
});

test('סגירה: תמלול נשמר בלוג, הערוץ נמחק רק אחר כך, ולחיצה כפולה נדחית', async (t) => {
  reset();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { guild, created } = env();
  const log = h.fakeTextChannel('log'); guild.channels.cache.set('log', log);
  db.prepare("INSERT INTO settings VALUES (?, 'ticket_log_channel', 'log')").run(G);
  await open(guild, 'owner1');
  const ch = created[0];
  ch.history = [{ createdTimestamp: 1e12, author: { tag: 'a#1' }, content: 'שלום', embeds: [], attachments: new Map() }];
  ch.messages.fetch = async ({ before }) => (before ? h.collection([]) : h.collection(ch.history));

  const i1 = ticketCtx(guild, ch, 'owner1');
  const i2 = ticketCtx(guild, ch, 'owner1');
  await Promise.all([tickets.closeTicket(i1), tickets.closeTicket(i2)]);
  const texts = [h.allText(i1), h.allText(i2)].join('|');
  assert.match(texts, /לא טיקט פתוח|כבר נסגר/); // הסגירה השנייה נדחית
  assert.strictEqual((texts.match(/הטיקט נסגר/g) ?? []).length, 1, 'נסגר פעם אחת בלבד');
  assert.strictEqual(log.messages.length, 1);
  assert.ok(log.messages[0].files[0].attachment.toString().includes('שלום'));
  assert.strictEqual(db.prepare('SELECT status FROM tickets').get().status, 'closed');
  assert.strictEqual(ch.deleted, false, 'עוד לא נמחק לפני ההשהיה');
  t.mock.timers.tick(5000);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(ch.deleted, true);
});

test('סגירה בלי לאן לשמור תמלול (אין לוג, DM חסום): הטיקט נשאר פתוח ולא נמחק', async (t) => {
  reset();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { guild, created } = env();
  await open(guild, 'owner1');
  const ch = created[0];
  const i = ticketCtx(guild, ch, 'owner1');
  i.client.users.fetch = async () => ({ send: async () => { throw new Error('Cannot send messages to this user'); } });
  await tickets.closeTicket(i);
  assert.match(h.allText(i), /לא סגר|לא\*\* נסגר|לא נסגר/);
  assert.strictEqual(db.prepare('SELECT status FROM tickets').get().status, 'open');
  t.mock.timers.tick(10_000);
  assert.strictEqual(ch.deleted, false);
});

test('סגירה כשלא ניתן לייצר תמלול: הטיקט נשאר פתוח', async () => {
  reset();
  const { guild, created } = env();
  await open(guild, 'owner1');
  const ch = created[0];
  ch.messages.fetch = async () => { throw new Error('Missing Access'); };
  const i = ticketCtx(guild, ch, 'owner1');
  const err = console.error; console.error = () => {};
  await tickets.closeTicket(i);
  console.error = err;
  assert.match(h.allText(i), /תמלול/);
  assert.strictEqual(db.prepare('SELECT status FROM tickets').get().status, 'open');
});

test('ערוץ שנמחק ידנית משחרר את המכסה; reconcile בהפעלה סוגר יתומים ושורות תקועות', async () => {
  reset();
  const { guild, created } = env();
  for (let n = 0; n < 3; n++) await open(guild, 'u1');
  assert.match(h.allText(await open(guild, 'u1')), /כבר 3 טיקטים/);
  tickets.markChannelDeleted(created[0].id);
  assert.match(h.allText(await open(guild, 'u1')), /הטיקט נפתח/);

  // הפעלה מחדש: ערוץ אחד נמחק בזמן שהבוט כבוי + שורת creating ישנה + closing שנקטע
  guild.channels.cache.delete(created[1].id);
  db.prepare("INSERT INTO tickets (guild_id, number, channel_id, user_id, category, status, created_at) VALUES (?, 99, 'pending', 'x', 'support', 'creating', 0)").run(G);
  db.prepare("UPDATE tickets SET status = 'closing' WHERE channel_id = ?").run(created[2].id);
  await tickets.reconcileTickets({ guilds: { cache: new Map([[G, guild]]) } });
  const status = (cid) => db.prepare('SELECT status FROM tickets WHERE channel_id = ?').get(cid)?.status;
  assert.strictEqual(status(created[1].id), 'closed');
  assert.strictEqual(status(created[2].id), 'open', 'סגירה שנקטעה חוזרת להיות פתוחה');
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM tickets WHERE number = 99').get().n, 0);
});

test('הפעלה מחדש: כפתורי טיקט נשענים על ה-DM ולא על זיכרון; כפתורים לא מוכרים מקבלים הסבר', async () => {
  reset();
  const { guild, created } = env();
  await open(guild, 'owner1');
  // "אחרי restart": אין שום מצב בזיכרון, רק customId + DB
  const i = ticketCtx(guild, created[0], 'owner1'); i.customId = 'ticket_close';
  i.isButton = () => true;
  await handleComponent(i);
  assert.strictEqual(db.prepare('SELECT status FROM tickets').get().status === 'open', false);

  const stale = ticketCtx(guild, created[0], 'u'); stale.customId = 'pg_next'; stale.message = { id: 'dead-message' };
  await handleComponent(stale);
  assert.match(h.allText(stale), /התצוגה פגה/);
  const unknown = ticketCtx(guild, created[0], 'u'); unknown.customId = 'legacy_button:1';
  await handleComponent(unknown);
  assert.match(h.allText(unknown), /כבר לא פעיל/);
});
