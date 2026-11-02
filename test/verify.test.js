const h = require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const KEY = 'hypixel-key-' + 'k'.repeat(24);
process.env.HYPIXEL_API_KEY = KEY;
const { db } = require('../src/db');
const v = require('../src/verify');
const hyp = require('../src/hypixel');
const { handleComponent } = require('../src/components');

const G = 'g1';
const UUID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const UUID2 = '0123456789abcdef0123456789abcdef';
const clean = () => { db.exec('DELETE FROM mc_links; DELETE FROM verify_attempts; DELETE FROM settings'); hyp._resetForTests(); };
const user = (id = 'u1', username = 'bob_dc', extra = {}) => ({ id, username, discriminator: '0', createdTimestamp: Date.now() - 400 * 864e5, ...extra });
const res = (status, json) => ({ status, json: async () => { if (json === undefined) throw new Error('no body'); return json; } });

/** Mojang + Hypixel מדומים. מחזיר fetchImpl ויומן קריאות. */
function services(o = {}) {
  const calls = [];
  const cfg = {
    mojang: { slorpi: { id: UUID, name: 'Slorpi' } },
    hypixel: { [UUID]: { success: true, player: { uuid: UUID, displayname: 'Slorpi', socialMedia: { links: { DISCORD: 'bob_dc' } } } } },
    ...o,
  };
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (cfg.delay) await new Promise((r) => setTimeout(r, cfg.delay));
    if (url.startsWith('https://api.mojang.com/')) {
      if (cfg.mojangFn) return cfg.mojangFn(url, opts);
      const name = decodeURIComponent(url.split('/').pop()).toLowerCase();
      return cfg.mojang[name] ? res(200, cfg.mojang[name]) : res(404, { error: 'NOT_FOUND' });
    }
    if (url.startsWith('https://api.minecraftservices.com/')) {
      if (cfg.fallbackFn) return cfg.fallbackFn(url, opts);
      return res(404, {});
    }
    if (url.startsWith('https://api.hypixel.net/v2/player')) {
      if (cfg.hypixelFn) return cfg.hypixelFn(url, opts);
      const uuid = new URL(url).searchParams.get('uuid');
      return cfg.hypixel[uuid] ? res(200, cfg.hypixel[uuid]) : res(200, { success: true, player: null });
    }
    throw new Error('unexpected url ' + url);
  };
  return { fetchImpl, calls };
}
const verify = (u, ign, s, deps = {}) => v.verifyAccount({ guildId: G, user: u, ign }, { fetchImpl: s.fetchImpl, apiKey: KEY, ...deps });
const linkCount = () => db.prepare('SELECT COUNT(*) n FROM mc_links').get().n;

test('הצלחה: ה-Discord בפרופיל Hypixel תואם -> קישור נשמר עם השם הקנוני מ-Mojang', async () => {
  clean();
  const s = services();
  const r = await verify(user(), 'slorpi', s); // אותיות קטנות
  assert.deepStrictEqual([r.ok, r.ign, r.uuid], [true, 'Slorpi', UUID]);
  const row = db.prepare('SELECT * FROM mc_links').get();
  assert.deepStrictEqual([row.user_id, row.uuid, row.proven, row.method, row.matched_handle], ['u1', UUID, 1, 'hypixel_social', 'bob_dc']);
  const hy = s.calls.find((c) => c.url.includes('hypixel'));
  assert.strictEqual(hy.opts.headers['API-Key'], KEY, 'המפתח נשלח ב-header');
  assert.ok(!hy.url.includes(KEY), 'המפתח לא נשלח ב-URL');
  assert.ok(hy.opts.signal && hy.opts.redirect === 'error', 'timeout ואין redirect');
});

test('הזנת שם בלבד לא מאמתת: אין קישור בפרופיל / קישור לדיסקורד אחר / חשבון לא קיים ב-Hypixel', async () => {
  clean();
  const noLink = services({ hypixel: { [UUID]: { success: true, player: { uuid: UUID, socialMedia: { links: {} } } } } });
  assert.match((await verify(user(), 'Slorpi', noLink)).error, /לא מוגדר חשבון Discord/);
  const noSocial = services({ hypixel: { [UUID]: { success: true, player: { uuid: UUID } } } });
  assert.match((await verify(user(), 'Slorpi', noSocial)).error, /לא מוגדר חשבון Discord/);
  const other = services({ hypixel: { [UUID]: { success: true, player: { uuid: UUID, socialMedia: { links: { DISCORD: 'someone_else' } } } } } });
  const r = await verify(user(), 'Slorpi', other);
  assert.match(r.error, /Discord אחר/);
  assert.ok(r.error.includes('bob_dc'), 'מציג למשתמש מה להקליד');
  assert.ok(!r.error.includes('someone_else'), 'לא חושף את הערך שבפרופיל');
  const never = services({ hypixel: {} });
  assert.match((await verify(user(), 'Slorpi', never)).error, /לא נמצא ב-Hypixel/);
  assert.strictEqual(linkCount(), 0);
});

test('השוואת שם המשתמש: מנרמלת בבטחה ולא מקבלת התאמות חלקיות או שם תצוגה', () => {
  const m = (val, u) => hyp.discordHandleMatches(val, u);
  const U = { username: 'foo', discriminator: '0' };
  assert.ok(m('foo', U) && m('FOO', U) && m(' @Foo ', U) && m('foo#0', U) && m('foo#0000', U));
  assert.ok(!m('foo2', U) && !m('xfoo', U) && !m('foo bar', U) && !m('', U) && !m(null, U) && !m(undefined, U) && !m('foo#1234', U));
  assert.ok(m('foo#1234', { username: 'foo', discriminator: '1234' }), 'חשבון ישן שלא עבר מיגרציה');
  assert.ok(!m('foo#9999', { username: 'foo', discriminator: '1234' }));
  assert.ok(!m('foo', { username: '', discriminator: '0' }));
  // שם תצוגה (global name) לא משתתף בהשוואה בכלל: מי שקבע לעצמו שם תצוגה זהה לא עובר
  assert.ok(!m('victim_name', { username: 'attacker', globalName: 'victim_name', discriminator: '0' }));
});

test('מניעת התחזות: משתמש אחר לא יכול לתבוע חשבון שהפרופיל שלו מצביע על דיסקורד אחר', async () => {
  clean();
  const s = services();
  const r = await verify(user('attacker', 'attacker_dc'), 'Slorpi', s);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(linkCount(), 0);
});

test('בלי HYPIXEL_API_KEY: נכשל סגור, בלי קריאות רשת ובלי קישור', async () => {
  clean();
  const s = services();
  const r = await v.verifyAccount({ guildId: G, user: user(), ign: 'Slorpi' }, { fetchImpl: s.fetchImpl, apiKey: '' });
  assert.deepStrictEqual([r.ok, r.service], [false, true]);
  assert.strictEqual(s.calls.length, 0);
  assert.strictEqual(linkCount(), 0);
});

test('Mojang: 404 = לא נמצא (נספר); 429/5xx בראשי = מעבר לגיבוי; כשל בשניהם = כשל שירות (לא נספר)', async () => {
  clean();
  const s404 = services({ mojang: {} });
  assert.match((await verify(user(), 'Nobody1', s404)).error, /לא נמצא שחקן/);
  assert.strictEqual(db.prepare('SELECT failures FROM verify_attempts').get().failures, 1);

  clean(); hyp._resetForTests();
  const fb = services({ mojangFn: () => res(429, {}), fallbackFn: () => res(200, { id: UUID, name: 'Slorpi' }) });
  assert.strictEqual((await verify(user(), 'Slorpi', fb)).ok, true, 'הגיבוי הצליח');
  assert.ok(fb.calls[1].url.startsWith('https://api.minecraftservices.com/'));

  clean();
  const both = services({ mojangFn: () => res(503, {}), fallbackFn: () => res(500, {}) });
  const w = console.warn; console.warn = () => {};
  const r = await verify(user(), 'Slorpi', both);
  console.warn = w;
  assert.deepStrictEqual([r.ok, r.service], [false, true]);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM verify_attempts').get().n, 0, 'לא נספר נגד המשתמש');
});

test('Mojang: תשובה פגומה / שם שלא תואם / timeout / שגיאת רשת => כשל שירות, לא אימות', async () => {
  const w = console.warn; console.warn = () => {};
  const cases = {
    'id לא תקין': { mojangFn: () => res(200, { id: 'zzz', name: 'Slorpi' }), fallbackFn: () => res(200, { id: 'zzz', name: 'Slorpi' }) },
    'שם שונה': { mojangFn: () => res(200, { id: UUID, name: 'SomeoneElse' }), fallbackFn: () => res(200, { id: UUID, name: 'SomeoneElse' }) },
    'JSON פגום': { mojangFn: () => res(200, undefined), fallbackFn: () => res(200, undefined) },
    'רשת': { mojangFn: () => { throw new Error('ECONNRESET'); }, fallbackFn: () => { throw new Error('ECONNRESET'); } },
    'timeout': { mojangFn: () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }, fallbackFn: () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); } },
  };
  for (const [name, cfg] of Object.entries(cases)) {
    clean();
    const r = await verify(user(), 'Slorpi', services(cfg));
    assert.deepStrictEqual([r.ok, r.service], [false, true], name);
    assert.strictEqual(linkCount(), 0, name);
  }
  console.warn = w;
});

test('Mojang: תוצאות נשמרות בזיכרון (חיסכון בקריאות)', async () => {
  clean();
  const s = services();
  await verify(user('a', 'x1'), 'Slorpi', s);
  await verify(user('b', 'x2'), 'Slorpi', s);
  assert.strictEqual(s.calls.filter((c) => c.url.includes('mojang.com')).length, 1);
});

test('Hypixel: 403/429/5xx/success=false/JSON פגום/UUID לא תואם => כשל שירות, בלי אימות', async () => {
  const w = console.warn; console.warn = () => {};
  const bad = {
    '403 מפתח נדחה': () => res(403, { success: false, cause: 'Invalid API key' }),
    '429': () => res(429, { success: false }),
    '500': () => res(500, {}),
    'success=false': () => res(200, { success: false }),
    'JSON פגום': () => res(200, undefined),
    'UUID לא תואם': () => res(200, { success: true, player: { uuid: UUID2, socialMedia: { links: { DISCORD: 'bob_dc' } } } }),
    'רשת': () => { throw new Error('ECONNRESET'); },
  };
  for (const [name, hypixelFn] of Object.entries(bad)) {
    clean();
    const r = await verify(user(), 'Slorpi', services({ hypixelFn }));
    assert.deepStrictEqual([r.ok, r.service], [false, true], name);
    assert.strictEqual(linkCount(), 0, name);
    assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM verify_attempts').get().n, 0, `${name}: לא נספר`);
  }
  // DISCORD שאינו מחרוזת = כאילו לא הוגדר
  clean();
  const weird = services({ hypixel: { [UUID]: { success: true, player: { uuid: UUID, socialMedia: { links: { DISCORD: { x: 1 } } } } } } });
  assert.match((await verify(user(), 'Slorpi', weird)).error, /לא מוגדר/);
  console.warn = w;
});

test('מפתח שנדחה: מדווח לצוות פעם אחת, והמפתח לא מופיע בשום לוג', async () => {
  clean();
  const logs = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.map(String).join(' '));
  let kinds = [];
  try {
    await verify(user(), 'Slorpi', services({ hypixelFn: () => res(403, { success: false }) }), { onServiceError: (e) => kinds.push(e.kind) });
    await verify(user(), 'Slorpi', services({ hypixelFn: () => { throw new Error(`fetch failed for key ${'x'}`); } }));
  } finally { Object.assign(console, orig); }
  assert.deepStrictEqual(kinds, ['auth']);
  assert.ok(!logs.join('\n').includes(KEY));
  assert.ok(logs.some((l) => l.includes('[verify]')), 'כן נרשם אירוע (ללא סוד)');
});

test('מגבלה מקומית על קריאות ל-Hypixel מגינה על המפתח (20 לדקה) ואינה נספרת כניסיון', async () => {
  clean();
  const s = services({ hypixel: {} });
  let limited = 0; const w = console.warn; console.warn = () => {};
  for (let n = 0; n < 25; n++) {
    const r = await verify(user(`u${n}`, `n${n}`), 'Slorpi', s);
    if (r.service) limited++;
  }
  console.warn = w;
  assert.strictEqual(s.calls.filter((c) => c.url.includes('hypixel.net')).length, 20);
  assert.strictEqual(limited, 5);
});

test('נעילת ניסיונות: 5 כשלונות נועלים גם כשהכל תקין אחר כך; הנעילה פגה; כשלי שירות לא נספרים', async () => {
  clean();
  const mismatch = services({ hypixel: { [UUID]: { success: true, player: { uuid: UUID, socialMedia: { links: { DISCORD: 'other' } } } } } });
  const t0 = 1_000_000;
  for (let n = 0; n < 5; n++) assert.strictEqual((await verify(user(), 'Slorpi', mismatch, { now: t0 + n })).ok, false);
  const good = services();
  const locked = await verify(user(), 'Slorpi', good, { now: t0 + 10 });
  assert.match(locked.error, /יותר מדי ניסיונות/);
  assert.strictEqual(good.calls.length, 0, 'נעילה נבדקת לפני כל קריאה חיצונית');
  hyp._resetForTests();
  assert.strictEqual((await verify(user(), 'Slorpi', services(), { now: t0 + v.FAIL_WINDOW_MS + 100 })).ok, true);

  clean();
  const w = console.warn; console.warn = () => {};
  for (let n = 0; n < 8; n++) await verify(user(), 'Slorpi', services({ hypixelFn: () => res(500, {}) }), { now: t0 + n });
  console.warn = w;
  hyp._resetForTests();
  assert.strictEqual((await verify(user(), 'Slorpi', services(), { now: t0 + 20 })).ok, true, 'כשלי שירות לא נועלים');
});

test('קישור מתחרה: חשבון שכבר מקושר למשתמש אחר / משתמש שכבר מקושר לחשבון אחר', async () => {
  clean();
  const s = services({ mojang: { slorpi: { id: UUID, name: 'Slorpi' }, jeb_: { id: UUID2, name: 'jeb_' } },
    hypixel: { [UUID]: { success: true, player: { uuid: UUID, socialMedia: { links: { DISCORD: 'bob_dc' } } } },
               [UUID2]: { success: true, player: { uuid: UUID2, socialMedia: { links: { DISCORD: 'bob_dc' } } } } } });
  assert.strictEqual((await verify(user('u1'), 'Slorpi', s)).ok, true);
  const hypixelCallsBefore = s.calls.filter((c) => c.url.includes('hypixel.net')).length;
  // אותו חשבון, משתמש אחר: נדחה לפני פנייה ל-Hypixel
  const stolen = await verify(user('u2', 'bob_dc'), 'Slorpi', s);
  assert.match(stolen.error, /כבר מקושר למשתמש אחר/);
  assert.strictEqual(s.calls.filter((c) => c.url.includes('hypixel.net')).length, hypixelCallsBefore);
  // אותו משתמש, חשבון שני
  assert.match((await verify(user('u1'), 'jeb_', s)).error, /כבר מקושר אליך/);
  assert.strictEqual(linkCount(), 1);
});

test('מרוץ: שני ניסיונות מקבילים לאותו חשבון - בדיוק אחד מצליח', async () => {
  clean();
  const s = services({ delay: 25 });
  const [a, b] = await Promise.all([verify(user('u1'), 'Slorpi', s), verify(user('u2'), 'Slorpi', s)]);
  assert.deepStrictEqual([a.ok, b.ok].sort(), [false, true]);
  assert.strictEqual(linkCount(), 1);
  // אותו משתמש פעמיים במקביל
  clean(); hyp._resetForTests();
  const s2 = services({ delay: 25, mojang: { slorpi: { id: UUID, name: 'Slorpi' }, jeb_: { id: UUID2, name: 'jeb_' } },
    hypixel: { [UUID]: { success: true, player: { uuid: UUID, socialMedia: { links: { DISCORD: 'bob_dc' } } } }, [UUID2]: { success: true, player: { uuid: UUID2, socialMedia: { links: { DISCORD: 'bob_dc' } } } } } });
  const [c, d] = await Promise.all([verify(user('u1'), 'Slorpi', s2), verify(user('u1'), 'jeb_', s2)]);
  assert.deepStrictEqual([c.ok, d.ok].sort(), [false, true]);
  assert.strictEqual(linkCount(), 1);
});

test('שם משתמש לא תקין / גיל חשבון מינימלי', async () => {
  clean();
  const s = services();
  let n = 0;
  for (const bad of ['', 'ab', 'a'.repeat(17), 'bad name', 'x;DROP', '<script>']) {
    assert.match((await verify(user(`bad${n++}`), bad, s)).error, /לא תקין/, JSON.stringify(bad));
  }
  assert.strictEqual(s.calls.length, 0, 'אין קריאות רשת לשם לא תקין');
  clean();
  db.prepare("INSERT INTO settings VALUES (?, 'min_account_age_days', '30')").run(G);
  assert.match((await verify(user('u1', 'bob_dc', { createdTimestamp: Date.now() - 5 * 864e5 }), 'Slorpi', services())).error, /30 ימים/);
  assert.strictEqual((await verify(user('u1', 'bob_dc', { createdTimestamp: Date.now() - 40 * 864e5 }), 'Slorpi', services())).ok, true);
});

test('הפעלה מחדש אמיתית: קישור ונעילת ניסיונות שורדים בתהליך חדש', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vtest-')), 'bot.db');
  const run = (script) => execFileSync(process.execPath, ['--no-warnings', '-e', script], {
    env: { ...process.env, DB_PATH: file, HYPIXEL_API_KEY: KEY }, cwd: path.join(__dirname, '..'), encoding: 'utf8',
  }).trim();
  const mock = `const U='${UUID}';const mk=(s,j)=>({status:s,json:async()=>j});
    const f=(disc)=>async(url)=>url.includes('mojang.com')?mk(200,{id:U,name:'Slorpi'}):mk(200,{success:true,player:{uuid:U,socialMedia:{links:{DISCORD:disc}}}});
    const v=require('./src/verify');const u=(id)=>({id,username:'bob_dc',discriminator:'0'});`;
  // תהליך 1: 5 כשלונות של משתמש אחד, וקישור מוצלח של משתמש אחר
  run(`${mock}(async()=>{for(let n=0;n<5;n++)await v.verifyAccount({guildId:'g1',user:u('bad'),ign:'Slorpi'},{fetchImpl:f('nope'),apiKey:'k'});
    const r=await v.verifyAccount({guildId:'g1',user:u('good'),ign:'Slorpi'},{fetchImpl:f('bob_dc'),apiKey:'k'});console.log(r.ok)})()`);
  // תהליך 2 (אחרי "הפעלה מחדש")
  const out = JSON.parse(run(`${mock}(async()=>{const hyp=require('./src/hypixel');hyp._resetForTests();
    const locked=await v.verifyAccount({guildId:'g1',user:u('bad'),ign:'Slorpi'},{fetchImpl:f('bob_dc'),apiKey:'k'});
    const dup=await v.verifyAccount({guildId:'g1',user:u('other'),ign:'Slorpi'},{fetchImpl:f('bob_dc'),apiKey:'k'});
    console.log(JSON.stringify({locked:locked.error,dup:dup.error,links:require('./src/db').db.prepare('SELECT user_id FROM mc_links').all()}))})()`));
  assert.match(out.locked, /יותר מדי ניסיונות/);
  assert.match(out.dup, /כבר מקושר למשתמש אחר/);
  assert.deepStrictEqual(out.links, [{ user_id: 'good' }]);
});

test('applyVerifiedState: כשל ברולים לא נבלע - מדווח ללוג והקישור נשמר; reconcile משלים', async () => {
  clean();
  const guild = h.fakeGuild();
  const log = h.fakeTextChannel('log'); guild.channels.cache.set('log', log);
  db.prepare("INSERT INTO settings VALUES (?, 'verified_role', 'VR'), (?, 'modlog_channel', 'log')").run(G, G);
  const m = h.fakeMember('u1', { guild }); m.failRoles = true;
  const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(a.join(' '));
  const failures = await v.applyVerifiedState(m, 'Slorpi');
  console.warn = warn;
  assert.ok(failures.length >= 1 && warned.some((w) => w.includes('[verify]')));
  assert.ok(log.messages.length === 1 && JSON.stringify(log.messages[0]).includes('נכשלו'));
  m.failRoles = false;
  db.prepare("INSERT INTO mc_links (guild_id, user_id, uuid, ign, verified_at, proven) VALUES (?, 'u1', ?, 'Slorpi', 0, 1)").run(G, UUID);
  await v.reconcileMember(m);
  assert.ok(m._roles.has('VR'));
  assert.strictEqual(m.nickname, 'Slorpi');
});

test('משתמש מקושר שחזר לשרת מקבל מחדש את מצב המאומת', async () => {
  clean();
  const guild = h.fakeGuild();
  db.prepare("INSERT INTO settings VALUES (?, 'verified_role', 'VR'), (?, 'unverified_role', 'UR')").run(G, G);
  db.prepare("INSERT INTO mc_links (guild_id, user_id, uuid, ign, verified_at, proven) VALUES (?, 'u1', ?, 'Slorpi', 0, 1)").run(G, UUID);
  const m = h.fakeMember('u1', { guild, roles: ['UR'] });
  assert.ok(await v.reconcileMember(m));
  assert.ok(m._roles.has('VR') && !m._roles.has('UR'));
  assert.strictEqual(await v.reconcileMember(h.fakeMember('stranger', { guild })), null);
});

test('כפתור/מודל האימות עובדים רק מה-DB ומה-customId (שורדים הפעלה מחדש) ומעניקים רול רק בהצלחה', async () => {
  clean();
  const realFetch = global.fetch;
  const guild = h.fakeGuild();
  db.prepare("INSERT INTO settings VALUES (?, 'verified_role', 'VR'), (?, 'unverified_role', 'UR')").run(G, G);
  const mk = (customId, ign, username = 'bob_dc') => {
    const member = h.fakeMember('u1', { guild, roles: ['UR'] });
    member.user.username = username; member.user.discriminator = '0';
    const i = h.fakeInteraction({ guild, user: member.user, member, fields: { ign } });
    i.customId = customId; i.showModal = async (m) => { i.modal = m; };
    return i;
  };
  try {
    // לחיצה על הכפתור פותחת מודל
    const click = mk('verify_start'); await handleComponent(click);
    assert.ok(click.modal, 'נפתח מודל');
    // שם בלבד, בלי קישור בפרופיל => אין רול
    global.fetch = services({ hypixel: { [UUID]: { success: true, player: { uuid: UUID, socialMedia: { links: {} } } } } }).fetchImpl;
    const no = mk('verify_modal', 'Slorpi'); await handleComponent(no);
    assert.match(h.allText(no), /לא מוגדר חשבון Discord/);
    assert.ok(!no.member._roles.has('VR') && no.member._roles.has('UR'));
    // התאמה => רול
    hyp._resetForTests();
    global.fetch = services().fetchImpl;
    const yes = mk('verify_modal', 'Slorpi'); await handleComponent(yes);
    assert.match(h.allText(yes), /קושר בהצלחה/);
    assert.ok(yes.member._roles.has('VR') && !yes.member._roles.has('UR'));
    // לחיצה חוזרת אחרי קישור: מסנכרנת רולים ולא פותחת מודל
    const again = mk('verify_start'); await handleComponent(again);
    assert.match(h.allText(again), /כבר אומת/);
    assert.ok(!again.modal);
  } finally { global.fetch = realFetch; }
});
