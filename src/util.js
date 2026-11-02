const TZ = process.env.TZ || 'Asia/Jerusalem';

/** XP הדרוש כדי לעבור מרמה n לרמה n+1 */
const xpForNext = (n) => 5 * n * n + 50 * n + 100;

/** מחשב רמה והתקדמות מתוך XP כולל */
function levelFromXp(totalXp) {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpForNext(level)) {
    remaining -= xpForNext(level);
    level++;
  }
  return { level, current: remaining, needed: xpForNext(level) };
}

/** חלקי תאריך/שעה באזור הזמן של הבוט */
function nowParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday, // Sun, Mon...
  };
}

/** היום שלפני תאריך YYYY-MM-DD */
function prevDay(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function progressBar(current, total, size = 12) {
  const filled = Math.max(0, Math.min(size, Math.round((current / total) * size)));
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

/** "10m", "2h", "3d" -> מילישניות. מחזיר null אם לא תקין */
function parseDuration(str) {
  const m = /^(\d+)\s*(s|m|h|d|w)$/i.exec(str.trim());
  if (!m) return null;
  const mult = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[m[2].toLowerCase()];
  return Number(m[1]) * mult;
}

module.exports = { xpForNext, levelFromXp, nowParts, prevDay, progressBar, parseDuration, TZ };
