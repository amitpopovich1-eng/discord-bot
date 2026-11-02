# חיבור שרת המיינקראפט לאימות (הוכחת בעלות)

בלי זה האימות עובד במצב **ללא הוכחה**: כל אחד יכול להקליד שם של שחקן אחר. עם `API_SECRET`
הבוט מנפיק קוד חד-פעמי (10 דקות), והשחקן צריך להקליד אותו **בתוך המשחק** עם החשבון עצמו.

## הזרימה
1. שחקן לוחץ "אימות חשבון" ומקליד שם → הבוט בודק מול Mojang ומחזיר קוד, למשל `K7M2XQ`.
2. בשרת המיינקראפט השחקן מריץ `/discord verify K7M2XQ`.
3. הפלאגין שולח לבוט (הבוט בודק שה-UUID של המריץ זהה ל-UUID שאליו הונפק הקוד):

```
POST http://<כתובת-הבוט>:<API_PORT>/api/verify
Authorization: Bearer <API_SECRET>
Content-Type: application/json

{"code":"K7M2XQ","uuid":"069a79f4-44e9-4726-a5be-fca90e38aaf5"}
```

| קוד | משמעות |
|-----|--------|
| 200 | אומת. גוף: `{"discordId":"...","ign":"..."}` |
| 401 | סוד שגוי |
| 403 | הקוד שייך לחשבון אחר (UUID לא תואם) |
| 404 | קוד לא קיים / פג תוקף |
| 409 | החשבון כבר מקושר |
| 410 | המשתמש עזב את השרת |

`GET /health` מחזיר `{"ok":true}` לבדיקות חיים.

## אבטחה
- שמרו את `API_SECRET` ארוך ואקראי (`openssl rand -hex 32`). אל תפרסמו אותו.
- מומלץ לחשוף את הפורט רק לכתובת של שרת המיינקראפט (חומת אש), או לשים מאחורי HTTPS.
- ה-UUID חייב להגיע מהשרת עצמו (`player.getUniqueId()`), לא מקלט של השחקן.

## פלאגין לדוגמה (Paper) — לא נבדק
זה שלד בלבד, לא קומפל ולא נבדק מול שרת. התאימו לגרסה שלכם.

```java
// Command: /discord verify <code>
public boolean onCommand(CommandSender s, Command c, String l, String[] a) {
  if (!(s instanceof Player p) || a.length != 2 || !a[0].equalsIgnoreCase("verify")) return false;
  String body = "{\"code\":\"" + a[1].replaceAll("[^A-Za-z0-9]", "") + "\",\"uuid\":\"" + p.getUniqueId() + "\"}";
  Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
    try {
      var req = java.net.http.HttpRequest.newBuilder(java.net.URI.create(getConfig().getString("api-url")))
        .header("Authorization", "Bearer " + getConfig().getString("api-secret"))
        .header("Content-Type", "application/json")
        .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body)).build();
      int status = java.net.http.HttpClient.newHttpClient().send(req, java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode();
      p.sendMessage(status == 200 ? "§aאומת בהצלחה!" : "§cהאימות נכשל (" + status + ")");
    } catch (Exception e) { p.sendMessage("§cהשרת לא זמין, נסו שוב."); }
  });
  return true;
}
```
