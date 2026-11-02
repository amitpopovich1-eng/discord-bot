#!/usr/bin/env node
/**
 * אבחון מול השירותים האמיתיים (Mojang + Hypixel). מריצים מקומית, עם המפתח שלכם:
 *
 *   node scripts/check-hypixel.js <שם_במיינקראפט> [שם_משתמש_בדיסקורד]
 *
 * מאמת שהמפתח תקין, שה-API מחזיר את המבנה שהבוט מצפה לו, ומה הערך שמופיע בפרופיל.
 * לא מדפיס את המפתח. מדפיס רק את הנתונים של החשבון שבדקתם (שהם ציבוריים ב-API).
 */
require('dotenv').config();
const hypixel = require('../src/hypixel');

const [ign, discordUser] = process.argv.slice(2);
if (!ign) {
  console.error('שימוש: node scripts/check-hypixel.js <IGN> [discord_username]');
  process.exit(2);
}
if (!process.env.HYPIXEL_API_KEY) {
  console.error('❌ HYPIXEL_API_KEY לא מוגדר ב-.env');
  process.exit(2);
}

(async () => {
  let code = 0;
  try {
    const p = await hypixel.resolveUuid(ign, { useCache: false });
    if (!p) { console.log(`❌ Mojang: לא נמצא שחקן בשם ${ign}`); process.exit(1); }
    console.log(`✅ Mojang: ${p.name} → ${p.uuid}`);

    const h = await hypixel.getHypixelDiscord(p.uuid, { apiKey: process.env.HYPIXEL_API_KEY });
    console.log(`✅ Hypixel API: המפתח התקבל, התשובה במבנה הצפוי (success=true)`);
    console.log(`   השחקן נמצא: ${h.found ? 'כן' : 'לא (לא נכנס מעולם / נתונים מוסתרים)'}`);
    console.log(`   Discord בפרופיל: ${h.discord ? JSON.stringify(h.discord) : '(לא מוגדר)'}`);
    if (discordUser) {
      const ok = hypixel.discordHandleMatches(h.discord, { username: discordUser, discriminator: '0' });
      console.log(`   התאמה ל-"${discordUser}": ${ok ? '✅ כן' : '❌ לא'}`);
      if (!ok) code = 1;
    }
  } catch (e) {
    if (e instanceof hypixel.ServiceError) {
      const hints = {
        auth: 'המפתח נדחה (403) או חסר. בדקו אותו בפורטל המפתחים. אם הוא תקין ועדיין נדחה, ייתכן שפורמט האימות בתיעוד הרשמי השתנה - ספרו לי.',
        rate_limited: 'חריגה ממגבלת קצב. המתינו ונסו שוב.',
        unavailable: `השירות לא זמין / שגיאת רשת (${e.message}).`,
        malformed: `התשובה לא במבנה הצפוי (${e.message}). זה בדיוק מה שהסקריפט נועד לגלות - ספרו לי.`,
      };
      console.log(`❌ ${e.kind}: ${hints[e.kind] ?? e.message}`);
    } else {
      console.log('❌ שגיאה לא צפויה:', e.message);
    }
    code = 1;
  }
  process.exit(code);
})();
