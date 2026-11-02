# בוט קהילה לדיסקורד

בוט שנועד **לשמור על הקהילה פעילה** ולעזור בניהול. כל ההגדרות נעשות מתוך דיסקורד עם `/setup` – בלי לערוך קוד.

## פיצ׳רים
**שימור פעילות**
- 🆙 XP ורמות מהודעות (פעם בדקה) ומשיחות קוליות (כשיש לפחות 2 בני אדם ולא מושתקים). `/rank`
- 🎖️ רולים אוטומטיים לפי רמה – `/levelrole`
- 🔥 בונוס יומי עם סטריק – `/daily`
- 🏆 טבלת מובילים (כללי / שבועי / סטריק) – `/leaderboard`, ופוסט שבועי אוטומטי ביום ראשון 20:00
- 💬 שאלת היום אוטומטית ב-18:00, עם תגובה בת׳רד
- 🎁 הגרלות עם כפתור – `/giveaway start|end|reroll`
- 📊 סקרים – `/poll`
- ⭐ Starboard – הודעות עם מספיק ⭐ עולות לערוץ מיוחד
- 👋 הודעת ברוכים הבאים + רול אוטומטי

**מיינקראפט ואימות**
- 🔗 אימות חשבון דרך **Hypixel**: השחקן מגדיר את שם המשתמש שלו בדיסקורד בפרופיל ה-Hypixel שלו, והבוט בודק זאת ב-API. רק אז: רול מאומת + כינוי = שם במשחק (`/verifypanel`). **שם בלבד לא מאמת.**
- 🔐 מגבלות, אבטחה והוראות הגדרה: `docs/verification.md`
- חשבון מיינקראפט אחד = משתמש דיסקורד אחד · גיל מינימלי לחשבון · רול "לא מאומת" שמוסר באימות
- `/whois` `/unlink` `/status` (שחקנים מחוברים, גרסה, MOTD)

**טיקטים ותמיכה**
- 🎫 תפריט קטגוריות (תמיכה / דיווח / ערעור / באג / אחר) ← טופס ← ערוץ פרטי ממוספר (`/ticketpanel`)
- 🙋 תפיסת טיקט ע"י צוות, `/ticket add|remove`, סגירה עם **תמלול מלא** ללוג ול-DM של הפותח
- 💡 הצעות עם הצבעת 👍/👎 וטיפול צוות באישור/דחייה/בחינה – `/suggest`, `/suggestion`
- 🎭 פאנל רולים בכפתורים – `/rolepanel` (חוסם רולים עם הרשאות ניהול)

**מודרציה**
- Cases ממוספרים עם לוג אוטומטי ו-DM למשתמש: `/warn` `/timeout` `/kick` `/ban` `/unban` `/history` `/case`
- ⏳ חסימה זמנית (`/ban duration:7d`) – משתחררת לבד
- ⚖️ ענישה אוטומטית: 3 אזהרות ב-30 יום = השתקה שעה · 5 = 24 שעות · 7 = חסימה
- 🛡️ AutoMod: ספאם, לינקי הזמנה, תיוגים מרובים, מילים אסורות (`/filter`)
- `/clear` `/lock` `/slowmode`

**כיף וכללי:** `/8ball` `/dice` `/coinflip` `/rps` `/help` `/ping` `/userinfo`

## התקנה
1. https://discord.com/developers/applications → New Application → Bot → העתק Token.
2. באותו עמוד הפעל **Server Members Intent** ו-**Message Content Intent**.
3. `cp .env.example .env` ומלא `DISCORD_TOKEN`, `CLIENT_ID`, ועדיף `GUILD_ID` (רישום מיידי), ו-`HYPIXEL_API_KEY` לאימות מיינקראפט (ראו `docs/verification.md`). **בלי המפתח האימות כבוי** והבוט לא מעניק רול מאומת. את הסודות מכניסים רק לקובץ `.env` או למשתני הסביבה של הפריסה, לעולם לא לצ׳אט או ל-git.
4. הזמנה: OAuth2 → URL Generator → scopes `bot` + `applications.commands`. הרשאות: Manage Roles, Manage Channels, Kick, Ban, Moderate Members, Manage Messages, Send Messages, Embed Links, Add Reactions, Create Public Threads, Read Message History.
   (**Manage Channels** נדרש לטיקטים; **Manage Roles** לרולים; הרול של הבוט חייב להיות מעל הרולים שהוא נותן.)
5. `npm install` ואז `npm start` (דורש Node 22.13+). הפקודות נרשמות אוטומטית בכל הפעלה.
6. **שימו את הרול של הבוט מעל** כל רול שהוא אמור לתת (רול אוטומטי / רולים לפי רמה).

## הגדרה ראשונית מומלצת (בדיסקורד)
```
/setup role feature:רול צוות role:@Staff
/setup role feature:רול מאומת role:@Verified
/setup role feature:רול לא מאומת role:@Unverified
/setup channel feature:לוג מודרציה ואימותים channel:#mod-log
/setup channel feature:לוג וטרנסקריפטים של טיקטים channel:#ticket-logs
/setup channel feature:הצעות channel:#suggestions
/setup channel feature:ברוכים הבאים channel:#welcome
/setup mcaddress address:play.example.com
/setup automod enabled:True
/verifypanel        (בערוץ #verify)
/ticketpanel        (בערוץ #support)
```
בשרת: הסתירו את רוב הערוצים מ-@Unverified והראו רק את `#verify`.

## אחסון והרצה 24/7
כל המצב (רמות, Cases, באנים זמניים, טיקטים, קישורי חשבונות, הגרלות) נשמר בקובץ SQLite אחד.
- ברירת מחדל: `data/bot.db` בתוך הפרויקט. **בפריסה בענן זה נמחק בכל deploy** אלא אם מחברים volume.
- בפריסה: מחברים volume (למשל ב-`/data`) ומגדירים `DB_PATH=/data/bot.db`. אם התיקייה לא כתיבה הבוט יוצא עם הודעה ברורה.
- שדרוגי סכמה אוטומטיים (מיגרציות). מומלץ לגבות את הקובץ לפני עדכון גרסה.
- אחרי הפעלה מחדש: כפתורי טיקט, אימות, הגרלות ופאנלי רולים ממשיכים לעבוד (הם נשענים על ה-DB). באנים זמניים והגרלות שפג תוקפם בזמן שהבוט כבוי מטופלים מיד בעלייה. תצוגות הדפדוף וה-`/help` פגות עם ההפעלה מחדש, וצריך להריץ את הפקודה שוב.
- הרצה: `npm start` (דורש Node 22.13+). הבוט נסגר בצורה מסודרת על SIGTERM/SIGINT.

## פיתוח
- פקודה חדשה: קובץ ב-`src/commands/<קטגוריה>/`.
- בדיקות: `npm test`.
