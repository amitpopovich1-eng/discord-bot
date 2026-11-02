/**
 * שירותים חיצוניים לאימות חשבון מיינקראפט:
 *  - Mojang: שם משתמש -> UUID (ללא מפתח, מוגבל קצב)
 *  - Hypixel Public API: קריאת הקישור ל-Discord מפרופיל השחקן (דורש מפתח מפורטל המפתחים)
 *
 * עקרונות: כל כשל/חוסר ודאות => "נכשל סגור" (אף פעם לא מעניקים אימות), הודעות שגיאה
 * לא כוללות את המפתח, וכל בקשה עם timeout.
 */
const UUID_RE = /^[0-9a-f]{32}$/;
const IGN_RE = /^[A-Za-z0-9_]{3,16}$/;

const HYPIXEL_PLAYER_URL = 'https://api.hypixel.net/v2/player';
const MOJANG_URLS = [
  (n) => `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(n)}`,
  (n) => `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(n)}`,
];

/** kind: unavailable | rate_limited | auth | malformed */
class ServiceError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

const normUuid = (u) => String(u ?? '').replace(/-/g, '').toLowerCase();

async function request(url, { headers, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  let res;
  try {
    res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
  } catch (e) {
    throw new ServiceError('unavailable', e.name === 'TimeoutError' ? 'timeout' : 'network error');
  }
  let json = null;
  if (res.status !== 204) {
    try { json = await res.json(); } catch { json = null; }
  }
  return { status: res.status, json };
}

// ---------- Mojang ----------
const nameCache = new Map(); // lower(name) -> { uuid, name, exp }
const NAME_CACHE_MS = 10 * 60_000;
const NOT_FOUND_CACHE_MS = 60_000;

/** @returns {Promise<{uuid:string,name:string}|null>} null = השם לא קיים. זורק ServiceError בכשל שירות. */
async function resolveUuid(ign, { fetchImpl, now = Date.now(), useCache = true } = {}) {
  if (!IGN_RE.test(ign)) return null;
  const key = ign.toLowerCase();
  const hit = nameCache.get(key);
  if (useCache && hit && hit.exp > now) return hit.uuid ? { uuid: hit.uuid, name: hit.name } : null;

  let lastErr = new ServiceError('unavailable', 'no response');
  for (const build of MOJANG_URLS) {
    let r;
    try {
      r = await request(build(ign), { fetchImpl });
    } catch (e) { lastErr = e; continue; }
    if (r.status === 200) {
      const id = normUuid(r.json?.id);
      if (!UUID_RE.test(id) || typeof r.json?.name !== 'string') { lastErr = new ServiceError('malformed', 'bad mojang payload'); continue; }
      // הגנה: Mojang חייב להחזיר את אותו שם (ללא תלות באותיות)
      if (r.json.name.toLowerCase() !== key) { lastErr = new ServiceError('malformed', 'mojang name mismatch'); continue; }
      if (nameCache.size > 500) nameCache.clear();
      nameCache.set(key, { uuid: id, name: r.json.name, exp: now + NAME_CACHE_MS });
      return { uuid: id, name: r.json.name };
    }
    if (r.status === 404 || r.status === 204) { // תשובה סופית: אין שחקן כזה
      if (nameCache.size > 500) nameCache.clear();
      nameCache.set(key, { uuid: null, exp: now + NOT_FOUND_CACHE_MS });
      return null;
    }
    lastErr = new ServiceError(r.status === 429 ? 'rate_limited' : 'unavailable', `mojang status ${r.status}`);
  }
  throw lastErr;
}

// ---------- Hypixel ----------
// הגנה על המפתח מפני חריגה ממגבלת הקצב: מגבלה מקומית לכל הבוט
const HYPIXEL_LOCAL_LIMIT = { windowMs: 60_000, max: 20 };
const hypixelCalls = [];

function takeHypixelSlot(now) {
  while (hypixelCalls.length && now - hypixelCalls[0] > HYPIXEL_LOCAL_LIMIT.windowMs) hypixelCalls.shift();
  if (hypixelCalls.length >= HYPIXEL_LOCAL_LIMIT.max) return false;
  hypixelCalls.push(now);
  return true;
}

/**
 * @returns {Promise<{found:boolean, discord:string|null}>}
 * discord = הטקסט שהשחקן הקליד בפרופיל Hypixel שלו (חופשי, לא מאומת ע"י Discord) או null אם לא הוגדר.
 */
async function getHypixelDiscord(uuid, { apiKey, fetchImpl, now = Date.now() } = {}) {
  if (!apiKey) throw new ServiceError('auth', 'missing api key');
  if (!UUID_RE.test(uuid)) throw new ServiceError('malformed', 'bad uuid');
  if (!takeHypixelSlot(now)) throw new ServiceError('rate_limited', 'local rate limit');

  const r = await request(`${HYPIXEL_PLAYER_URL}?uuid=${uuid}`, { headers: { 'API-Key': apiKey }, fetchImpl });
  if (r.status === 403) throw new ServiceError('auth', 'hypixel rejected the api key');
  if (r.status === 429) throw new ServiceError('rate_limited', 'hypixel rate limit');
  if (r.status !== 200) throw new ServiceError('unavailable', `hypixel status ${r.status}`);
  const j = r.json;
  if (!j || j.success !== true) throw new ServiceError('malformed', 'hypixel success!=true');
  if (j.player === null || j.player === undefined) return { found: false, discord: null };
  if (typeof j.player !== 'object') throw new ServiceError('malformed', 'bad player');
  // הגנה: התשובה חייבת להיות על אותו חשבון שביקשנו
  if (j.player.uuid && normUuid(j.player.uuid) !== uuid) throw new ServiceError('malformed', 'uuid mismatch');
  const d = j.player.socialMedia?.links?.DISCORD;
  return { found: true, discord: typeof d === 'string' && d.trim() ? d : null };
}

/**
 * השוואת הערך מפרופיל Hypixel לשם המשתמש (username) בדיסקורד.
 * חשוב: משווים רק ל-username הייחודי. לא לשם התצוגה (global name), כי אותו כל אחד יכול לקבוע לעצמו.
 */
function discordHandleMatches(value, user) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/^@/, '');
  const h = norm(value); const u = norm(user?.username);
  if (!h || !u) return false;
  if (h === u || h === `${u}#0` || h === `${u}#0000`) return true;
  const d = user.discriminator;
  return Boolean(d && d !== '0' && d !== '0000' && h === `${u}#${d}`); // חשבונות ישנים שלא עברו מיגרציה
}

function _resetForTests() { nameCache.clear(); hypixelCalls.length = 0; }

module.exports = {
  ServiceError, resolveUuid, getHypixelDiscord, discordHandleMatches, normUuid, IGN_RE, UUID_RE,
  _resetForTests, HYPIXEL_LOCAL_LIMIT,
};
