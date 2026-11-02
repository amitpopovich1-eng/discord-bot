/**
 * API פנימי שהפלאגין בשרת המיינקראפט קורא לו.
 *
 *   POST /api/link/start     גוף: {"uuid":"...","name":"...","onlineMode":true}
 *   GET  /health
 *
 * אימות בקשות: HMAC-SHA256 עם הסוד המשותף. הסוד עצמו אף פעם לא נשלח ברשת.
 *   X-Timestamp: מילישניות epoch
 *   X-Signature: hex( HMAC(secret, `${timestamp}.${METHOD}.${path}.${body}`) )
 * בקשה תקפה רק בחלון של ±60 שניות וניתנת לשימוש פעם אחת (הגנה מפני replay).
 * חשוב: התשובה מכילה קוד אימות, לכן יש להגיש את ה-API מעל HTTPS או רשת פרטית.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { issueCode } = require('./verify');

const MAX_SKEW_MS = 60_000;
const MAX_BODY = 2048;
const RATE_LIMIT = { windowMs: 60_000, max: 60 };

function sign(secret, timestamp, method, path, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${method}.${path}.${body}`).digest('hex');
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'utf8'); const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** שרת הנתיב הנבחר לאימות: GUILD_ID, או השרת היחיד שהבוט נמצא בו */
function targetGuildId(client) {
  if (process.env.GUILD_ID) return process.env.GUILD_ID;
  return client.guilds.cache.size === 1 ? client.guilds.cache.first().id : null;
}

function createApiServer(client, { secret = process.env.API_SECRET, now = () => Date.now() } = {}) {
  const seen = new Map(); // signature -> expiry (replay protection)
  const hits = new Map(); // ip -> [timestamps]

  const server = http.createServer((req, res) => {
    const send = (status, body, extra = {}) => {
      if (res.headersSent) return;
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra });
      res.end(JSON.stringify(body));
    };
    const ip = req.socket.remoteAddress ?? '?';
    const t = now();

    // rate limit לכל IP
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < RATE_LIMIT.windowMs);
    recent.push(t); hits.set(ip, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < RATE_LIMIT.windowMs)) hits.delete(k);
    if (recent.length > RATE_LIMIT.max) return send(429, { error: 'rate_limited' }, { 'retry-after': '60' });

    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && path === '/health') return send(200, { ok: true });
    if (req.method !== 'POST' || path !== '/api/link/start') return send(404, { error: 'not_found' });

    const chunks = []; let size = 0; let aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { aborted = true; send(413, { error: 'too_large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('error', () => {});
    req.on('end', () => {
      if (aborted) return;
      try {
        const body = Buffer.concat(chunks).toString('utf8');
        const ts = Number(req.headers['x-timestamp']);
        const sig = String(req.headers['x-signature'] ?? '');
        if (!Number.isFinite(ts) || Math.abs(t - ts) > MAX_SKEW_MS) return send(401, { error: 'bad_timestamp' });
        if (!safeEqualHex(sig, sign(secret, req.headers['x-timestamp'], 'POST', path, body))) return send(401, { error: 'bad_signature' });
        for (const [k, exp] of seen) if (exp < t) seen.delete(k);
        if (seen.has(sig)) return send(401, { error: 'replayed' });
        seen.set(sig, t + 2 * MAX_SKEW_MS);

        let data;
        try { data = JSON.parse(body); } catch { return send(400, { error: 'invalid_json' }); }
        if (!data || typeof data.uuid !== 'string' || typeof data.name !== 'string') return send(400, { error: 'uuid_and_name_required' });
        // UUID של שרת offline-mode נגזר מהשם ואינו מוכיח בעלות על חשבון מקורי
        if (data.onlineMode !== true) return send(403, { error: 'offline_uuid_not_trusted' });

        const guildId = targetGuildId(client);
        if (!guildId) return send(503, { error: 'guild_not_configured' });
        const r = issueCode({ guildId, uuid: data.uuid, name: data.name, now: t });
        const { status, retryAfter, ...rest } = r;
        send(status, rest, retryAfter ? { 'retry-after': String(retryAfter) } : {});
      } catch (e) {
        console.error('[api] internal error:', e.message); // לא מדפיסים גוף/כותרות (עלולים להכיל קוד)
        send(500, { error: 'internal' });
      }
    });
  });

  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.on('clientError', (_e, socket) => socket.destroy());
  return server;
}

function startApi(client) {
  const secret = process.env.API_SECRET;
  if (!secret) {
    console.warn('API_SECRET לא מוגדר: אימות מיינקראפט כבוי (אין אימות בלי הוכחת בעלות).');
    return null;
  }
  if (secret.length < 32) {
    console.error('API_SECRET קצר מ-32 תווים. ה-API לא הופעל. צרו סוד עם: openssl rand -hex 32');
    return null;
  }
  const server = createApiServer(client);
  const port = Number(process.env.API_PORT || process.env.PORT || 3000);
  server.on('error', (e) => console.error(`[api] שגיאת שרת (${e.code ?? e.message}). אימות מיינקראפט לא זמין.`));
  server.listen(port, () => console.log(`API לאימות מאזין על פורט ${port}`));
  return server;
}

module.exports = { createApiServer, startApi, sign, targetGuildId };
