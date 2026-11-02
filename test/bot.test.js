const test = require('node:test');
const assert = require('node:assert');
const { loadCommands } = require('../src/loadCommands');
const { levelFromXp, xpForNext, prevDay, parseDuration, progressBar, nowParts } = require('../src/util');

test('כל הפקודות נטענות והסכמה תקינה', () => {
  const cmds = loadCommands();
  assert.ok(cmds.size >= 20, `נטענו ${cmds.size}`);
  for (const c of cmds.values()) {
    const json = c.data.toJSON();
    assert.ok(json.description.length <= 100, `${json.name} תיאור ארוך מדי`);
  }
});

test('חישוב רמות', () => {
  assert.deepStrictEqual(levelFromXp(0), { level: 0, current: 0, needed: xpForNext(0) });
  assert.strictEqual(levelFromXp(xpForNext(0)).level, 1);
  assert.strictEqual(levelFromXp(xpForNext(0) + xpForNext(1) - 1).level, 1);
  assert.strictEqual(levelFromXp(xpForNext(0) + xpForNext(1)).level, 2);
});

test('פונקציות עזר', () => {
  assert.strictEqual(prevDay('2026-03-01'), '2026-02-28');
  assert.strictEqual(prevDay('2026-01-01'), '2025-12-31');
  assert.strictEqual(parseDuration('2h'), 7_200_000);
  assert.strictEqual(parseDuration('abc'), null);
  assert.strictEqual(progressBar(5, 10, 10), '█████░░░░░');
  assert.match(nowParts().date, /^\d{4}-\d{2}-\d{2}$/);
});

test('xp ו-DB: עלייה ברמה ורול', async () => {
  process.env.TZ = 'UTC';
  const { db } = require('../src/db');
  const { addXp } = require('../src/xp');
  db.exec("DELETE FROM users; DELETE FROM level_roles;");
  db.prepare('INSERT INTO level_roles VALUES (?, ?, ?)').run('g1', 1, 'r1');
  const added = [];
  const member = {
    id: 'u1',
    guild: { id: 'g1', roles: { cache: new Map([['r1', { id: 'r1' }]]) }, channels: { cache: new Map() } },
    roles: { cache: new Map(), add: async (r) => added.push(r.id) },
  };
  const r = await addXp(member, 150, { message: true });
  assert.strictEqual(r.level, 1);
  assert.deepStrictEqual(added, ['r1']);
  assert.strictEqual(db.prepare('SELECT messages FROM users WHERE user_id = ?').get('u1').messages, 1);
  db.exec("DELETE FROM users; DELETE FROM level_roles;");
});
