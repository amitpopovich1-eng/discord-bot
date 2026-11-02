const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const { db } = require('../src/db');
const v = require('../src/verify');
const { createApiServer, sign } = require('../src/api');

const G = 'g1';
const UUID = '069a79f444e94726a5befca90e38aaf5';
const UUID2 = 'f84c6a790a4e45e0879bcd49ebd4c4e2';
const clean = () => db.exec('DELETE FROM mc_links; DELETE FROM verify_codes; DELETE FROM verify_attempts; DELETE FROM settings');
const issue = (over = {}) => v.issueCode({ guildId: G, uuid: UUID, name: 'Notch', ...over });

test('הנפקת קוד: פורמט, אקראיות, ותוקף קצר', () => {
  clean();
  const r = issue({ now: 1_000_000 });
  assert.strictEqual(r.status, 200);
  assert.match(r.code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.strictEqual(r.expiresAt - 1_000_000, 5 * 60_000);
  // 200 קודים מחשבונות שונים - כולם שונים (אקראיות סבירה)
  const codes = new Set();
  for (let n = 0; n < 200; n++) codes.add(issue({ uuid: n.toString(16).padStart(32, '0'), now: 0 }).code);
  assert.strictEqual(codes.size, 200);
});

test('הקוד לא נשמר בטקסט גלוי ב-DB (רק HMAC)', () => {
  clean();
  const { code } = issue();
  const raw = v.normCode(code);
  const rows = JSON.stringify(db.prepare('SELECT * FROM verify_codes').all());
  assert.ok(!rows.includes(raw) && !rows.includes(code));
});

test('קלט לא תקין / חשבון מקושר / cooldown / קוד פעיל אחד לכל חשבון', () => {
  clean();
  assert.strictEqual(issue({ uuid: 'zzz' }).status, 400);
  assert.strictEqual(issue({ name: 'bad name!' }).status, 400);
  assert.strictEqual(issue({ name: '' }).status, 400);

  const a = issue({ now: 0 });
  const cool = issue({ now: 10_000 });
  assert.strictEqual(cool.status, 429);
  assert.strictEqual(cool.retryAfter, 20);

  const b = issue({ now: 31_000 }); // אחרי ה-cooldown: קוד חדש מבטל את הישן
  assert.strictEqual(b.status, 200);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM verify_codes').get().n, 1);
  assert.match(v.redeemCode(G, 'u1', a.code, { now: 32_000 }).error, /שגוי|נוצל/);
  assert.strictEqual(v.redeemCode(G, 'u1', b.code, { now: 32_000 }).ok, true);

  assert.strictEqual(issue({ now: 99_000 }).status, 409); // כבר מקושר
});

test('מימוש תקין: קישור נוצר, הקוד חד-פעמי, UUID מנורמל', () => {
  clean();
  const { code } = issue();
  const r = v.redeemCode(G, 'u1', code.toLowerCase().replace('-', ' '));
  assert.deepStrictEqual([r.ok, r.ign, r.uuid], [true, 'Notch', UUID]);
  const link = db.prepare('SELECT * FROM mc_links').get();
  assert.deepStrictEqual([link.user_id, link.uuid, link.proven], ['u1', UUID, 1]);
  // שימוש חוזר בקוד ע"י משתמש אחר
  assert.match(v.redeemCode(G, 'u2', code).error, /שגוי|נוצל/);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM mc_links').get().n, 1);
});

test('קוד שגוי / קצר / פג תוקף', () => {
  clean();
  const { code } = issue({ now: 0 });
  assert.match(v.redeemCode(G, 'u1', 'ZZZZ-ZZZZ', { now: 1000 }).error, /שגוי/);
  assert.match(v.redeemCode(G, 'u1', 'ab', { now: 1000 }).error, /לא תקין/);
  assert.match(v.redeemCode(G, 'u1', code, { now: 5 * 60_000 + 1 }).error, /פג תוקף/);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM mc_links').get().n, 0);
});

test('הגבלת ניסיונות: 5 כשלונות נועלים גם קוד נכון, והנעילה פגה בחלון הבא', () => {
  clean();
  const { code } = issue({ now: 0 });
  for (let n = 0; n < 5; n++) assert.strictEqual(v.redeemCode(G, 'u1', 'ZZZZ-ZZZZ', { now: 1000 + n }).ok, false);
  const locked = v.redeemCode(G, 'u1', code, { now: 2000 });
  assert.match(locked.error, /יותר מדי ניסיונות/);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM mc_links').get().n, 0);
  // משתמש אחר לא מושפע
  const other = v.redeemCode(G, 'u2', code, { now: 2000 });
  assert.strictEqual(other.ok, true);
  // הנעילה פגה אחרי החלון
  clean();
  const c2 = issue({ now: 0 });
  for (let n = 0; n < 5; n++) v.redeemCode(G, 'u1', 'ZZZZ-ZZZZ', { now: 1000 });
  assert.strictEqual(v.redeemCode(G, 'u1', c2.code, { now: 1000 + v.FAIL_WINDOW_MS + 1 }).error?.includes('פג תוקף'), true);
});

test('קישור מתחרה: אותו חשבון לשני משתמשים / משתמש אחד לשני חשבונות', () => {
  clean();
  const a = issue({ uuid: UUID, name: 'Notch' });
  const b = issue({ uuid: UUID2, name: 'Jeb_' });
  // שני משתמשים מנסים את אותו קוד: רק אחד מצליח
  const results = [v.redeemCode(G, 'u1', a.code), v.redeemCode(G, 'u2', a.code)];
  assert.deepStrictEqual(results.map((r) => r.ok), [true, false]);
  // u1 כבר מקושר ולא יכול לקשר חשבון שני; הקוד של Jeb_ לא נצרך
  const second = v.redeemCode(G, 'u1', b.code);
  assert.match(second.error, /כבר מקושר/);
  assert.strictEqual(db.prepare('SELECT used FROM verify_codes WHERE uuid = ?').get(UUID2).used, 0);
  // u2 מממש את הקוד של Jeb_ בהצלחה
  assert.strictEqual(v.redeemCode(G, 'u2', b.code).ok, true);
});

test('קישור מתחרה באמצע: ה-UUID נתפס בין ההנפקה למימוש -> שום דבר לא נצרך', () => {
  clean();
  const { code } = issue();
  db.prepare("INSERT INTO mc_links VALUES (?, 'someone', ?, 'Notch', 0, 1)").run(G, UUID); // נכנס "במקביל"
  const r = v.redeemCode(G, 'u1', code);
  assert.match(r.error, /כבר מקושר למשתמש אחר/);
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM mc_links WHERE user_id = 'u1'").get().n, 0);
  assert.strictEqual(db.prepare('SELECT used FROM verify_codes').get().used, 0, 'הטרנזקציה בוטלה במלואה');
});

test('גיל חשבון דיסקורד מינימלי', () => {
  clean();
  db.prepare("INSERT INTO settings VALUES (?, 'min_account_age_days', '30')").run(G);
  const { code } = issue();
  assert.match(v.redeemCode(G, 'u1', code, { accountCreatedAt: Date.now() - 5 * 864e5 }).error, /30 ימים/);
  assert.strictEqual(v.redeemCode(G, 'u1', code, { accountCreatedAt: Date.now() - 40 * 864e5 }).ok, true);
});

test('קוד משרת אחר לא תקף', () => {
  clean();
  const { code } = issue({ guildId: 'other' });
  assert.match(v.redeemCode(G, 'u1', code).error, /שגוי/);
});

test('הפעלה מחדש אמיתית: קוד שהונפק בתהליך אחד ממומש בתהליך חדש', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vtest-')), 'bot.db');
  const run = (script) => execFileSync(process.execPath, ['--no-warnings', '-e', script], {
    env: { ...process.env, DB_PATH: file, API_SECRET: h.SECRET }, cwd: path.join(__dirname, '..'), encoding: 'utf8',
  }).trim();
  const code = run(`console.log(require('./src/verify').issueCode({guildId:'g1',uuid:'${UUID}',name:'Notch'}).code)`);
  const out = run(`const r=require('./src/verify').redeemCode('g1','u1','${code}');console.log(JSON.stringify(r))`);
  assert.strictEqual(JSON.parse(out).ok, true);
  // ותהליך שלישי רואה את הקישור ואת הקוד כנוצל
  const out2 = run(`const v=require('./src/verify');console.log(JSON.stringify([v.redeemCode('g1','u2','${code}').ok, require('./src/db').db.prepare('SELECT COUNT(*) n FROM mc_links').get().n]))`);
  assert.deepStrictEqual(JSON.parse(out2), [false, 1]);
});

test('applyVerifiedState: כשל ברולים לא נבלע - מדווח ללוג והקישור נשמר', async () => {
  clean();
  const guild = h.fakeGuild();
  const log = h.fakeTextChannel('log');
  guild.channels.cache.set('log', log);
  db.prepare("INSERT INTO settings VALUES (?, 'verified_role', 'VR'), (?, 'modlog_channel', 'log')").run(G, G);
  const m = h.fakeMember('u1', { guild }); m.failRoles = true;
  const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(a.join(' '));
  const failures = await v.applyVerifiedState(m, 'Notch');
  console.warn = warn;
  assert.ok(failures.length >= 1);
  assert.ok(warned.some((w) => w.includes('[verify]')));
  assert.ok(log.messages.length === 1 && JSON.stringify(log.messages[0]).includes('נכשלו'));
  // תיקון: אחרי שההרשאות חזרו, reconcile משלים
  m.failRoles = false;
  db.prepare("INSERT INTO mc_links VALUES (?, 'u1', ?, 'Notch', 0, 1)").run(G, UUID);
  await v.reconcileMember(m);
  assert.ok(m._roles.has('VR'));
  assert.strictEqual(m.nickname, 'Notch');
});

test('משתמש מקושר שחזר לשרת מקבל מחדש את מצב המאומת', async () => {
  clean();
  const guild = h.fakeGuild();
  db.prepare("INSERT INTO settings VALUES (?, 'verified_role', 'VR'), (?, 'unverified_role', 'UR')").run(G, G);
  db.prepare("INSERT INTO mc_links VALUES (?, 'u1', ?, 'Notch', 0, 1)").run(G, UUID);
  const m = h.fakeMember('u1', { guild, roles: ['UR'] });
  assert.ok(await v.reconcileMember(m));
  assert.ok(m._roles.has('VR') && !m._roles.has('UR'));
  assert.strictEqual(await v.reconcileMember(h.fakeMember('stranger', { guild })), null);
});

// ---------- API ----------
async function withApi(fn, { client, now } = {}) {
  const c = client ?? { guilds: { cache: Object.assign(new Map([['g1', {}]]), { first: () => ({ id: 'g1' }) }) } };
  const t = { now: Date.now() };
  const server = createApiServer(c, { secret: h.SECRET, now: now ?? (() => t.now) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const call = (method, p, { body = '', headers = {}, signed = true, ts = t.now, secret = h.SECRET } = {}) => new Promise((resolve, reject) => {
    const hdr = { 'content-type': 'application/json', ...headers };
    if (signed) { hdr['x-timestamp'] = String(ts); hdr['x-signature'] = sign(secret, String(ts), method, p, body); }
    const req = http.request({ port, host: '127.0.0.1', method, path: p, headers: hdr }, (res) => {
      let d = ''; res.on('data', (x) => (d += x)); res.on('end', () => { let j; try { j = JSON.parse(d); } catch { j = d; } resolve({ status: res.statusCode, body: j, headers: res.headers }); });
    });
    req.on('error', reject); req.end(body);
  });
  try { await fn({ call, t }); } finally { server.close(); server.closeAllConnections?.(); }
}
const body = (o) => JSON.stringify({ uuid: UUID, name: 'Notch', onlineMode: true, ...o });

test('API: בקשה חתומה מנפיקה קוד שאפשר לממש', async () => {
  clean();
  await withApi(async ({ call }) => {
    const r = await call('POST', '/api/link/start', { body: body() });
    assert.strictEqual(r.status, 200);
    assert.match(r.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.strictEqual(v.redeemCode('g1', 'u1', r.body.code).ok, true);
    assert.strictEqual((await call('GET', '/health', { signed: false })).status, 200);
  });
});

test('API: חתימה/חותמת זמן שגויות, replay, offline-mode, קלט פגום', async () => {
  clean();
  await withApi(async ({ call, t }) => {
    assert.strictEqual((await call('POST', '/api/link/start', { body: body(), signed: false })).status, 401);
    assert.strictEqual((await call('POST', '/api/link/start', { body: body(), secret: 'x'.repeat(40) })).status, 401);
    assert.strictEqual((await call('POST', '/api/link/start', { body: body(), ts: t.now - 120_000 })).status, 401);
    assert.strictEqual((await call('POST', '/api/link/start', { body: body(), ts: t.now + 120_000 })).status, 401);
    // גוף שונה מהחתום
    const hdr = { 'x-timestamp': String(t.now), 'x-signature': sign(h.SECRET, String(t.now), 'POST', '/api/link/start', body()) };
    assert.strictEqual((await call('POST', '/api/link/start', { body: body({ name: 'Evil' }), signed: false, headers: hdr })).status, 401);
    // replay של אותה בקשה חתומה
    const ok = await call('POST', '/api/link/start', { body: body({ uuid: UUID2, name: 'Jeb_' }), ts: t.now });
    assert.strictEqual(ok.status, 200);
    const replay = await call('POST', '/api/link/start', { body: body({ uuid: UUID2, name: 'Jeb_' }), ts: t.now });
    assert.deepStrictEqual([replay.status, replay.body.error], [401, 'replayed']);
    // UUID מ-offline-mode לא נחשב הוכחה
    const off = await call('POST', '/api/link/start', { body: body({ onlineMode: false }), ts: t.now + 1 });
    assert.deepStrictEqual([off.status, off.body.error], [403, 'offline_uuid_not_trusted']);
    const missing = await call('POST', '/api/link/start', { body: JSON.stringify({ uuid: UUID, name: 'Notch' }), ts: t.now + 2 });
    assert.strictEqual(missing.status, 403);
    assert.strictEqual((await call('POST', '/api/link/start', { body: 'not json', ts: t.now + 3 })).status, 400);
    assert.strictEqual((await call('POST', '/api/link/start', { body: JSON.stringify({ uuid: 5 }), ts: t.now + 4 })).status, 400);
    assert.strictEqual((await call('POST', '/api/link/start', { body: body({ uuid: 'nothex' }), ts: t.now + 5 })).status, 400);
    assert.strictEqual((await call('GET', '/api/link/start', { ts: t.now + 6 })).status, 404);
    assert.strictEqual((await call('POST', '/api/other', { signed: false })).status, 404);
  });
});

test('API: cooldown מחזיר 429 עם Retry-After; גוף ענק נדחה; rate limit לפי IP', async () => {
  clean();
  await withApi(async ({ call, t }) => {
    assert.strictEqual((await call('POST', '/api/link/start', { body: body(), ts: t.now })).status, 200);
    const again = await call('POST', '/api/link/start', { body: body(), ts: t.now + 1 });
    assert.strictEqual(again.status, 429);
    assert.ok(Number(again.headers['retry-after']) > 0);
    const big = await call('POST', '/api/link/start', { body: 'x'.repeat(5000), ts: t.now + 2 }).catch((e) => ({ status: e.code }));
    assert.ok([413, 'ECONNRESET', 'EPIPE'].includes(big.status), `got ${big.status}`);
    let last;
    for (let n = 0; n < 70; n++) last = await call('GET', '/health', { signed: false });
    assert.strictEqual(last.status, 429);
  });
});

test('API: חשבון מקושר -> 409; שרת לא מוגדר -> 503', async () => {
  clean();
  db.prepare("INSERT INTO mc_links VALUES ('g1', 'u1', ?, 'Notch', 0, 1)").run(UUID);
  await withApi(async ({ call, t }) => {
    assert.strictEqual((await call('POST', '/api/link/start', { body: body(), ts: t.now })).status, 409);
  });
  const prev = process.env.GUILD_ID; delete process.env.GUILD_ID;
  await withApi(async ({ call, t }) => {
    assert.strictEqual((await call('POST', '/api/link/start', { body: body(), ts: t.now })).status, 503);
  }, { client: { guilds: { cache: Object.assign(new Map(), { first: () => undefined }) } } });
  if (prev) process.env.GUILD_ID = prev;
});

test('סודות וקודים לא נכתבים ללוג, גם בנתיבי שגיאה', async () => {
  clean();
  const logs = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.map(String).join(' '));
  let code;
  try {
    await withApi(async ({ call, t }) => {
      code = (await call('POST', '/api/link/start', { body: body(), ts: t.now })).body.code;
      await call('POST', '/api/link/start', { body: 'garbage', ts: t.now + 1, secret: 'y'.repeat(40) });
      await call('POST', '/api/link/start', { body: body(), ts: t.now + 2 });
    });
  } finally { Object.assign(console, orig); }
  const joined = logs.join('\n');
  assert.ok(!joined.includes(h.SECRET) && !joined.includes(code) && !joined.includes(v.normCode(code)));
});

test('API לא עולה בלי סוד או עם סוד קצר', () => {
  const { startApi } = require('../src/api');
  const prev = process.env.API_SECRET;
  const errs = []; const orig = { e: console.error, w: console.warn }; console.error = (...a) => errs.push(a.join(' ')); console.warn = (...a) => errs.push(a.join(' '));
  try {
    delete process.env.API_SECRET;
    assert.strictEqual(startApi({}), null);
    process.env.API_SECRET = 'short';
    assert.strictEqual(startApi({}), null);
  } finally { process.env.API_SECRET = prev; console.error = orig.e; console.warn = orig.w; }
  assert.ok(errs.some((e) => e.includes('32')));
});
