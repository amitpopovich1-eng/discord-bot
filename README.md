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

**ניהול**
- 🔨 `/ban` `/kick` `/timeout` `/clear` `/warn` `/warnings`
- 🛡️ AutoMod: ספאם, לינקי הזמנה, תיוגים מרובים (`/setup automod`)
- 🎫 טיקטים פרטיים עם כפתור – `/ticketpanel`

**כיף:** `/8ball` `/dice` `/coinflip` `/rps` · **כללי:** `/help` `/ping` `/userinfo`

## התקנה
1. https://discord.com/developers/applications → New Application → Bot → העתק Token.
2. באותו עמוד הפעל **Server Members Intent** ו-**Message Content Intent**.
3. `cp .env.example .env` ומלא `DISCORD_TOKEN`, `CLIENT_ID`, ועדיף `GUILD_ID` (רישום מיידי).
4. הזמנה: OAuth2 → URL Generator → scopes `bot` + `applications.commands`. הרשאות: Manage Roles, Manage Channels, Kick, Ban, Moderate Members, Manage Messages, Send Messages, Embed Links, Add Reactions, Create Public Threads, Read Message History.
5. `npm install` ואז `npm start` (דורש Node 22.13+). הפקודות נרשמות אוטומטית בכל הפעלה.
6. **שימו את הרול של הבוט מעל** כל רול שהוא אמור לתת (רול אוטומטי / רולים לפי רמה).

## הגדרה ראשונית מומלצת (בדיסקורד)
```
/setup channel feature:ערוץ ברוכים הבאים channel:#welcome
/setup channel feature:ערוץ שאלת היום channel:#chat
/setup channel feature:ערוץ טבלת מובילים שבועית channel:#general
/setup channel feature:ערוץ הודעות עליית רמה channel:#level-ups
/setup automod enabled:True
/levelrole add level:5 role:@פעיל
/ticketpanel
```

## אחסון והרצה 24/7
הנתונים נשמרים ב-SQLite בתיקיית `data/` – חשוב לשמור אותה בין הפעלות (volume). אפשר להריץ על Railway, VPS או כל שרת עם Node.

## פיתוח
- פקודה חדשה: קובץ ב-`src/commands/<קטגוריה>/`.
- בדיקות: `npm test`.
