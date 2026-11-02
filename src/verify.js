const http = require('node:http');
const crypto = require('node:crypto');
const { db, getSetting } = require('./db');
const { brand, COLORS } = require('./ui');

const IGN_RE = /^\w{3,16}$/;
const CODE_TTL = 10 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // בלי תווים מבלבלים (0/O, 1/I)

/** code -> { guildId, userId, uuid, ign, expires } */
const pending = new Map();

const normUuid = (u) => String(u).replace(/-/g, '').toLowerCase();

/** האם מוגדר מצב הוכחה (פלאגין בשרת המיינקראפט) */
const proofMode = () => Boolean(process.env.API_SECRET);

async function lookupMojang(ign, fetchImpl = fetch) {
  if (!IGN_RE.test(ign)) return { error: 'שם משתמש לא תקין (3-16 תווים: אותיות, מספרים וקו תחתון).' };
  let res;
  try {
    res = await fetchImpl(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(ign)}`, { signal: AbortSignal.timeout(8000) });
  } catch {
    return { error: 'לא הצלחתי להתחבר ל-Mojang כרגע. נסו שוב עוד רגע.' };
  }
  if (res.status === 404 || res.status === 204) return { error: `לא נמצא שחקן בשם **${ign}**.` };
  if (!res.ok) return { error: 'שגיאה מול Mojang. נסו שוב מאוחר יותר.' };
  const data = await res.json();
  return { uuid: normUuid(data.id), ign: data.name };
}

function makeCode() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  } while (pending.has(code));
  return code;
}

function prune() {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
}

/** מתחיל תהליך אימות. מחזיר { error } | { done:true } | { code } */
async function startVerification(member, ign, fetchImpl) {
  const guild = member.guild;
  const minAge = Number(getSetting(guild.id, 'min_account_age_days') ?? 0);
  if (minAge && Date.now() - member.user.createdTimestamp < minAge * 864e5) {
    return { error: `החשבון בדיסקורד חייב להיות בן ${minAge} ימים לפחות.` };
  }
  const already = db.prepare('SELECT ign FROM mc_links WHERE guild_id = ? AND user_id = ?').get(guild.id, member.id);
  if (already) return { error: `כבר מקושר אליך החשבון **${already.ign}**. פנו לצוות כדי לשנות.` };

  const p = await lookupMojang(ign, fetchImpl);
  if (p.error) return p;
  const taken = db.prepare('SELECT user_id FROM mc_links WHERE guild_id = ? AND uuid = ?').get(guild.id, p.uuid);
  if (taken) return { error: `החשבון **${p.ign}** כבר מקושר למשתמש אחר.` };

  if (!proofMode()) {
    await completeLink(guild, member, p, false);
    return { done: true, ign: p.ign, proven: false };
  }
  prune();
  for (const [k, v] of pending) if (v.guildId === guild.id && v.userId === member.id) pending.delete(k); // קוד אחד לכל משתמש
  const code = makeCode();
  pending.set(code, { guildId: guild.id, userId: member.id, uuid: p.uuid, ign: p.ign, expires: Date.now() + CODE_TTL });
  return { code, ign: p.ign, expiresAt: Date.now() + CODE_TTL };
}

async function completeLink(guild, member, p, proven) {
  db.prepare('INSERT INTO mc_links (guild_id, user_id, uuid, ign, verified_at, proven) VALUES (?, ?, ?, ?, ?, ?)')
    .run(guild.id, member.id, p.uuid, p.ign, Date.now(), proven ? 1 : 0);
  const verified = getSetting(guild.id, 'verified_role');
  const unverified = getSetting(guild.id, 'unverified_role');
  if (verified) await member.roles.add(verified, 'אימות מיינקראפט').catch(() => {});
  if (unverified) await member.roles.remove(unverified, 'אימות מיינקראפט').catch(() => {});
  if (member.manageable && getSetting(guild.id, 'verify_nickname') !== '0') await member.setNickname(p.ign.slice(0, 32), 'אימות מיינקראפט').catch(() => {});

  const logId = getSetting(guild.id, 'modlog_channel');
  const log = logId && guild.channels.cache.get(logId);
  if (log?.isTextBased()) {
    await log.send({
      embeds: [brand(guild, COLORS.success).setTitle('✅ אימות מיינקראפט')
        .setDescription(`${member} ← **${p.ign}**\n\`${p.uuid}\`\n${proven ? 'הוכחת בעלות דרך השרת' : '⚠️ ללא הוכחת בעלות'}`)],
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }
}

/** נקרא ע"י ה-API כשהפלאגין מאשר קוד */
async function confirmCode(client, code, uuid) {
  prune();
  const entry = pending.get(String(code).toUpperCase());
  if (!entry) return { status: 404, error: 'unknown or expired code' };
  if (normUuid(uuid) !== entry.uuid) return { status: 403, error: 'code belongs to a different account' };
  const guild = client.guilds.cache.get(entry.guildId);
  const member = guild && await guild.members.fetch(entry.userId).catch(() => null);
  if (!member) { pending.delete(code.toUpperCase()); return { status: 410, error: 'member left the server' }; }
  pending.delete(code.toUpperCase());
  try {
    await completeLink(guild, member, entry, true);
  } catch (e) {
    return { status: 409, error: 'already linked' };
  }
  await member.send(`✅ החשבון **${entry.ign}** אומת ב-**${guild.name}**!`).catch(() => {});
  return { status: 200, discordId: entry.userId, ign: entry.ign };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * API קטן שהפלאגין בשרת המיינקראפט קורא לו:
 *   POST /api/verify   Authorization: Bearer <API_SECRET>   {"code":"ABC123","uuid":"..."}
 */
function startApi(client) {
  const secret = process.env.API_SECRET;
  if (!secret) return null;
  const server = http.createServer((req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/api/verify') return send(404, { error: 'not found' });
    const auth = req.headers.authorization ?? '';
    if (!safeEqual(auth, `Bearer ${secret}`)) return send(401, { error: 'unauthorized' });

    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on('end', async () => {
      let data;
      try { data = JSON.parse(body); } catch { return send(400, { error: 'invalid json' }); }
      if (typeof data.code !== 'string' || typeof data.uuid !== 'string') return send(400, { error: 'code and uuid required' });
      const r = await confirmCode(client, data.code, data.uuid).catch((e) => { console.error(e); return { status: 500, error: 'internal' }; });
      const { status, ...rest } = r;
      send(status, rest);
    });
  });
  const port = Number(process.env.API_PORT || process.env.PORT || 3000);
  server.listen(port, () => console.log(`API לאימות מאזין על פורט ${port}`));
  return server;
}

module.exports = { startVerification, confirmCode, lookupMojang, startApi, pending, proofMode, normUuid };
