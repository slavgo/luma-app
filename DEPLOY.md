# 🚀 הוראות הפעלה — Task Manager Digital Marketing

## שלב 1 — Supabase (בסיס הנתונים)

1. כנס ל-[supabase.com](https://supabase.com) → "New Project"
2. בחר שם, סיסמה, וregion (מומלץ Frankfurt)
3. עבור ל-**SQL Editor** → הרץ את כל התוכן של קובץ `supabase/schema.sql`
4. עבור ל-**Settings → API** — העתק:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`

## שלב 2 — הגדר משתני סביבה

צור קובץ `.env.local` בתיקיית הפרויקט:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

## שלב 3 — הרץ מקומית

```bash
npm install
npm run dev
# → http://localhost:5173
```

## שלב 4 — Deploy ל-Vercel

### אפשרות א׳ — דרך GitHub (מומלץ)
1. צור repo חדש ב-GitHub
2. `git init && git add . && git commit -m "init" && git push`
3. כנס ל-[vercel.com](https://vercel.com) → "Import Git Repository"
4. הוסף את משתני הסביבה (מ-env.local) תחת **Environment Variables**
5. לחץ Deploy → תקבל URL כמו `https://task-manager-slav.vercel.app`

### אפשרות ב׳ — Vercel CLI
```bash
npm install -g vercel
vercel
# עקוב אחרי ההוראות, הוסף env vars כשנשאל
```

## שלב 5 — הרשמה ראשונה

1. פתח את ה-URL שקיבלת
2. לחץ **"הרשמה"** → הכנס אימייל וסיסמה
3. אשר את האימייל שנשלח אליך
4. כנס → האפליקציה ריקה ומוכנה לשימוש

## מבנה הפרויקט

```
task-manager-app/
├── src/
│   ├── main.jsx         ← נקודת כניסה
│   ├── TaskManager.jsx  ← כל הלוגיקה + UI
│   └── supabase.js      ← חיבור לבסיס הנתונים
├── supabase/
│   └── schema.sql       ← הגדרת טבלאות + הרשאות
├── index.html
├── vite.config.js
├── package.json
└── vercel.json
```

## פיצ'רים

- ✅ כניסה עם אימייל + סיסמה
- ✅ כל משתמש רואה רק את הנתונים שלו (RLS)
- ✅ נתונים נשמרים ב-Supabase (PostgreSQL)
- ✅ עובד מכל מכשיר ודפדפן
- ✅ עדכוני optimistic (מיידי בממשק + סינכרון ב-background)
- ✅ קלוד AI chat (מפתח API נפרד)
