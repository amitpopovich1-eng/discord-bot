const { EmbedBuilder } = require('discord.js');
const { db, getSetting, setSetting } = require('./db');
const { endGiveaway } = require('./giveaways');
const { addXp } = require('./xp');
const { expireTempBans } = require('./mod');
const { nowParts } = require('./util');
const questions = require('./questions');
const { pruneCodes } = require('./verify');

const VOICE_XP = 10;

async function tickGiveaways(client) {
  const due = db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(Date.now());
  for (const g of due) await endGiveaway(client, g).catch((e) => console.error('giveaway end:', e));
}

async function tickVoice(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const vs of guild.voiceStates.cache.values()) {
      const m = vs.member;
      if (!m || m.user.bot || !vs.channelId || vs.selfMute || vs.selfDeaf || vs.serverMute || vs.serverDeaf) continue;
      if (vs.channel.members.filter((x) => !x.user.bot).size < 2) continue; // לא מתגמלים ישיבה לבד
      await addXp(m, VOICE_XP).catch(() => {});
    }
  }
}

async function tickScheduled(client) {
  const { date, hour, minute, weekday } = nowParts();
  for (const guild of client.guilds.cache.values()) {
    // שאלת היום ב-18:00 (מסומנת כבוצעה רק אחרי שליחה מוצלחת; בכשל ננסה שוב בדקה הבאה בתוך חלון 5 הדקות)
    const qCh = getSetting(guild.id, 'question_channel');
    if (qCh && hour === 18 && minute < 5 && getSetting(guild.id, 'last_question') !== date) {
      const ch = guild.channels.cache.get(qCh);
      if (ch?.isTextBased()) {
        const q = questions[Math.floor(Math.random() * questions.length)];
        const msg = await ch.send({
          embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle('💬 שאלת היום').setDescription(q).setFooter({ text: 'עונים בצ׳אט ומקבלים XP!' })],
        }).catch((e) => { console.warn(`[question] שליחה נכשלה (${guild.id}): ${e.message}`); return null; });
        if (msg) {
          setSetting(guild.id, 'last_question', date);
          await msg.startThread({ name: 'דיון: שאלת היום' }).catch(() => {});
        }
      }
    }
    // טבלת מובילים שבועית: יום ראשון 20:00
    const lbCh = getSetting(guild.id, 'leaderboard_channel');
    if (lbCh && weekday === 'Sun' && hour === 20 && minute < 5 && getSetting(guild.id, 'last_weekly') !== date) {
      setSetting(guild.id, 'last_weekly', date);
      const top = db.prepare('SELECT user_id, weekly_xp FROM users WHERE guild_id = ? AND weekly_xp > 0 ORDER BY weekly_xp DESC LIMIT 10').all(guild.id);
      const ch = guild.channels.cache.get(lbCh);
      let posted = !top.length; // אין מה לפרסם = אפשר לאפס
      if (ch?.isTextBased() && top.length) {
        const medals = ['🥇', '🥈', '🥉'];
        const lines = top.map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.user_id}> — ${r.weekly_xp} XP`);
        posted = await ch.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('🏆 הכי פעילים השבוע').setDescription(lines.join('\n'))] })
          .then(() => true, (e) => { console.warn(`[weekly] פרסום נכשל (${guild.id}): ${e.message}`); return false; });
      }
      // מאפסים רק אחרי שהטבלה פורסמה בהצלחה; אחרת לא מאבדים את הנתונים
      if (posted) db.prepare('UPDATE users SET weekly_xp = 0 WHERE guild_id = ?').run(guild.id);
      else setSetting(guild.id, 'last_weekly', '');
    }
  }
}

/** מריץ fn כל ms, בלי חפיפה בין ריצות, וגם מיד בהפעלה (השלמת משימות שפג תוקפן בזמן שהבוט היה כבוי) */
function every(name, ms, fn, { immediate = true } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await fn(); } catch (e) { console.error(`[scheduler:${name}]`, e); } finally { running = false; }
  };
  if (immediate) run();
  return setInterval(run, ms);
}

function startScheduler(client) {
  const timers = [
    every('giveaways', 15_000, () => tickGiveaways(client)),
    every('tempbans', 30_000, () => expireTempBans(client)),
    every('voice', 60_000, () => tickVoice(client), { immediate: false }),
    every('scheduled', 60_000, () => tickScheduled(client)),
    every('prune', 6 * 36e5, async () => pruneCodes()),
  ];
  return () => timers.forEach(clearInterval);
}

module.exports = { startScheduler, every };
