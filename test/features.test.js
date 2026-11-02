process.env.DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.API_SECRET = 'test-secret';
const { db } = require('../src/db');
const verify = require('../src/verify');
const mod = require('../src/mod');

const UUID = '069a79f444e94726a5befca90e38aaf5';
const okFetch = async () => ({ status: 200, ok: true, json: async () => ({ id: UUID, name: 'Notch' }) });
const notFound = async () => ({ status: 404, ok: false });

function fakeMember(id = 'u1') {
  const roles = new Set();
  return {
    id, roles, user: { createdTimestamp: Date.now() - 400 * 864e5, id },
    guild: null, manageable: true,
    send: async () => {},
    roles2: roles,
  };
}
function fakeGuild(m, extra = {}) {
  const g = {
    id: 'g1', name: 'Test', iconURL: () => null, channels: { cache: new Map() },
    client: { user: { id: 'bot' }, users: { fetch: async () => ({ send: async () => {} }) } },
    members: { fetch: async () => m, unban: async () => {} },
    ...extra,
  };
  m.guild = g;
  m.roles = { add: async (r) => m.roles2.add(r), remove: async (r) => m.roles2.delete(r) };
  m.setNickname = async (n) => { m.nick = n; };
  return g;
}

test('אימות: שם לא קיים / לא תקין נדחה', async () => {
  const m = fakeMember(); fakeGuild(m);
  assert.match((await verify.startVerification(m, 'x', notFound)).error, /לא תקין/);
  assert.match((await verify.startVerification(m, 'NoSuchPlayer', notFound)).error, /לא נמצא/);
});

test('אימות עם הוכחה: קוד, UUID שגוי נדחה, UUID נכון מאמת ומעניק רול', async () => {
  db.exec('DELETE FROM mc_links; DELETE FROM settings');
  db.prepare("INSERT INTO settings VALUES ('g1','verified_role','vr'),('g1','unverified_role','ur')").run();
  const m = fakeMember(); const g = fakeGuild(m); m.roles2.add('ur');
  const client = { guilds: { cache: new Map([['g1', g]]) } };

  const r = await verify.startVerification(m, 'Notch', okFetch);
  assert.match(r.code, /^[A-Z2-9]{6}$/);

  // מישהו אחר (UUID אחר) מנסה להשתמש בקוד -> נדחה
  const bad = await verify.confirmCode(client, r.code, 'ffffffffffffffffffffffffffffffff');
  assert.strictEqual(bad.status, 403);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM mc_links').get().n, 0);

  // UUID נכון, גם בפורמט עם מקפים
  const dashed = UUID.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  const ok = await verify.confirmCode(client, r.code, dashed);
  assert.strictEqual(ok.status, 200);
  assert.ok(m.roles2.has('vr') && !m.roles2.has('ur'));
  assert.strictEqual(m.nick, 'Notch');
  assert.strictEqual(db.prepare('SELECT proven FROM mc_links').get().proven, 1);

  // קוד חד-פעמי
  assert.strictEqual((await verify.confirmCode(client, r.code, UUID)).status, 404);
  // אותו חשבון לא יקושר למשתמש נוסף
  const m2 = fakeMember('u2'); fakeGuild(m2);
  assert.match((await verify.startVerification(m2, 'Notch', okFetch)).error, /כבר מקושר/);
});

test('API: דורש סודי, מאמת קלט', async () => {
  db.exec('DELETE FROM mc_links');
  const m = fakeMember('u3'); const g = fakeGuild(m);
  const server = verify.startApi({ guilds: { cache: new Map([['g1', g]]) } });
  await new Promise((r) => server.on('listening', r));
  const port = server.address().port;
  const call = (headers, body) => new Promise((resolve) => {
    const req = http.request({ port, method: 'POST', path: '/api/verify', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.end(body);
  });
  assert.strictEqual((await call({}, '{}')).status, 401);
  assert.strictEqual((await call({ authorization: 'Bearer wrong' }, '{}')).status, 401);
  assert.strictEqual((await call({ authorization: 'Bearer test-secret' }, 'not json')).status, 400);
  assert.strictEqual((await call({ authorization: 'Bearer test-secret' }, '{"code":1}')).status, 400);
  assert.strictEqual((await call({ authorization: 'Bearer test-secret' }, '{"code":"NOPE00","uuid":"a"}')).status, 404);
  server.close();
});

test('מודרציה: מספור Cases לפי שרת, וענישה אוטומטית ב-3 אזהרות', async () => {
  db.exec('DELETE FROM cases; DELETE FROM settings');
  const m = fakeMember('victim'); const g = fakeGuild(m);
  let timeoutMs = null;
  m.moderatable = true; m.timeout = async (ms) => { timeoutMs = ms; };
  const c1 = await mod.createCase(g, { type: 'warn', userId: 'victim', modId: 'mod', reason: 'a' });
  const c2 = await mod.createCase(g, { type: 'warn', userId: 'victim', modId: 'mod', reason: 'b' });
  assert.deepStrictEqual([c1.case_no, c2.case_no], [1, 2]);
  assert.strictEqual(await mod.applyAutoPunish(g, m, 'victim'), null);
  await mod.createCase(g, { type: 'warn', userId: 'victim', modId: 'mod', reason: 'c' });
  const res = await mod.applyAutoPunish(g, m, 'victim');
  assert.match(res, /הושתק/);
  assert.strictEqual(timeoutMs, 36e5);
  // שרת אחר מתחיל מ-1
  assert.strictEqual((await mod.createCase({ ...g, id: 'g2' }, { type: 'warn', userId: 'x', modId: 'mod' })).case_no, 1);
});

test('באן זמני שפג נשחרר', async () => {
  db.exec('DELETE FROM cases');
  const m = fakeMember(); const g = fakeGuild(m);
  let unbanned = null; g.members.unban = async (id) => { unbanned = id; };
  await mod.createCase(g, { type: 'tempban', userId: 'bad', modId: 'mod', reason: 'x', expiresAt: Date.now() - 1000 });
  await mod.expireTempBans({ user: { id: 'bot' }, guilds: { cache: new Map([['g1', g]]) } });
  assert.strictEqual(unbanned, 'bad');
  assert.strictEqual(db.prepare("SELECT active FROM cases WHERE type='tempban'").get().active, 0);
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM cases WHERE type='unban'").get().n, 1);
});
