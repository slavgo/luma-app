// Shared task logic — used by the web app (src/) and the Telegram bot (api/).
// Dates are plain 'YYYY-MM-DD' strings in Israel time.

export const TZ = 'Asia/Jerusalem';

export const PLATFORMS = ['גוגל אדס', 'מטא - ממומן', 'סושיאל', 'גרפיקה/וידאו', 'כללי'];
export const STATUS_TODO = 'לביצוע';
export const STATUS_WAITING = 'ממתין ללקוח';
export const STATUSES = [STATUS_TODO, STATUS_WAITING];
export const DEFAULT_CLIENT = 'LUMA';

// Today's date in Israel, regardless of the device/server timezone
export const localToday = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const weekday = (dateStr) => new Date(dateStr + 'T00:00:00Z').getUTCDay();

// Old 5-status model → new 2-status model (done is a separate boolean)
export const normStatus = (s) => {
  if (s === 'ממתין לאישור' || s === 'ממתין לחומרים' || s === STATUS_WAITING) return STATUS_WAITING;
  if (s === 'בוצע') return 'בוצע';
  return STATUS_TODO;
};

export const getNextRecurrenceDate = (fromDate, recurrence) => {
  if (!recurrence || recurrence === 'none' || !fromDate) return null;
  if (recurrence === 'daily') return addDays(fromDate, 1);
  if (recurrence === 'weekly') return addDays(fromDate, 7);
  if (recurrence === 'monthly') {
    const d = new Date(fromDate + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  const days = recurrence.split(',').map(Number).filter(n => !isNaN(n));
  if (!days.length) return null;
  for (let i = 1; i <= 14; i++) {
    const next = addDays(fromDate, i);
    if (days.includes(weekday(next))) return next;
  }
  return null;
};

// Urgency derived from due date
export const urgencyFromDate = (date, today = localToday()) => {
  if (!date) return 'בינונית';
  if (date <= addDays(today, 1)) return 'גבוהה';
  if (date <= addDays(today, 7)) return 'בינונית';
  return 'נמוכה';
};

// ── Quick-add parser ─────────────────────────────────────────
// "לשלוח למנור תסריט ביום ג׳ דחוף" → { client: 'מנור', task: 'לשלוח תסריט', date, urgency, platform }

const DAY_WORDS = [
  ['ראשון', 'א'], ['שני', 'ב'], ['שלישי', 'ג'], ['רביעי', 'ד'], ['חמישי', 'ה'], ['שישי', 'ו'], ['שבת', 'ש'],
];

const PLATFORM_KEYWORDS = [
  ['גוגל אדס', /גוגל|אדס|google|ppc|מילות מפתח/i],
  ['מטא - ממומן', /מטא|פייסבוק|ממומן|קמפיין|meta|מודעה|מודעות|ads/i],
  ['גרפיקה/וידאו', /עיצוב|גרפיקה|סרטון|וידאו|עריכה|באנר|לוגו|צילום|רילס?(?=$|\s)|reel/i],
  ['סושיאל', /פוסט|סטורי|אינסטגרם|סושיאל|תוכן|טיקטוק|instagram|tiktok/i],
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HEB_PREFIX = '(?:^|[\\s,.])(?:[ולבשמה]|של |עבור |אצל )?';

export function parseQuickTask(text, clientNames = [], today = localToday()) {
  let rest = ` ${String(text || '').trim()} `;
  const out = { client: '', task: '', date: '', urgency: '', platform: 'כללי', explicitUrgency: false };

  // Client — longest name first
  const sorted = [...clientNames].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    let re = new RegExp(`${HEB_PREFIX}${escapeRe(name)}(?=$|[\\s,.!?])`, 'i');
    // "למועצה הדתית" → "המועצה הדתית": a prefix letter swallows the leading ה
    if (!re.test(rest) && name.startsWith('ה') && name.length > 2) {
      re = new RegExp(`(?:^|[\\s,.])[ולבשמ]${escapeRe(name.slice(1))}(?=$|[\\s,.!?])`, 'i');
    }
    if (re.test(rest)) {
      out.client = name;
      rest = rest.replace(re, ' ');
      break;
    }
  }

  // Urgency
  const urgRe = /(?:^|\s)(דחוף|דחופה|דחוף!|בדחיפות|asap|!!+)(?=$|\s)/i;
  if (urgRe.test(rest)) {
    out.urgency = 'גבוהה';
    out.explicitUrgency = true;
    rest = rest.replace(urgRe, ' ');
  }

  // Date
  const setDate = (d, re) => { if (!out.date) { out.date = d; rest = rest.replace(re, ' '); } };
  let m;
  if ((m = rest.match(/(?:^|\s)(?:עד |ב)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=$|\s)/))) {
    const [, dd, mm, yy] = m;
    let year = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : Number(today.slice(0, 4));
    let candidate = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    if (!yy && candidate < today) candidate = `${year + 1}${candidate.slice(4)}`;
    if (!isNaN(new Date(candidate).getTime())) setDate(candidate, m[0]);
  }
  const rel = [
    [/(?:^|\s)(?:עד )?(?:ה)?היום(?=$|\s)/, 0],
    [/(?:^|\s)(?:עד )?(?:ל)?מחרתיים(?=$|\s)/, 2],
    [/(?:^|\s)(?:עד )?(?:ל)?מחר(?=$|\s)/, 1],
    [/(?:^|\s)(?:ב)?שבוע הבא(?=$|\s)/, 7],
  ];
  for (const [re, n] of rel) if (re.test(rest)) setDate(addDays(today, n), rest.match(re)[0]);
  if ((m = rest.match(/(?:^|\s)בעוד (\d+) ימים(?=$|\s)/))) setDate(addDays(today, Number(m[1])), m[0]);
  if (!out.date) {
    const todayDow = weekday(today);
    for (let i = 0; i < DAY_WORDS.length; i++) {
      const [full, letter] = DAY_WORDS[i];
      const re = new RegExp(`(?:^|\\s)(?:עד )?(?:ב|ל)?(?:יום )?(?:${full}|${letter}['׳'])(?=$|\\s)`);
      if (re.test(rest)) {
        let diff = (i - todayDow + 7) % 7;
        if (diff === 0) diff = 7;
        setDate(addDays(today, diff), rest.match(re)[0]);
        break;
      }
    }
  }

  // Platform (keep the words in the task text)
  for (const [platform, re] of PLATFORM_KEYWORDS) {
    if (re.test(rest)) { out.platform = platform; break; }
  }

  out.task = rest
    .replace(/(?:^|\s)(?:תזכיר לי|תזכורת|להזכיר לי|צריך|משימה:?)(?=\s)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.\-–:]+|[\s,.\-–:]+$/g, '')
    .trim();

  if (!out.urgency) out.urgency = urgencyFromDate(out.date, today);
  return out;
}

// Moves an overdue recurring task's date forward to the next occurrence >= today
export const advanceToNextValidDate = (taskDate, recurrence, today = localToday()) => {
  let date = taskDate;
  for (let i = 0; i < 60; i++) {
    if (date >= today) return date;
    const next = getNextRecurrenceDate(date, recurrence);
    if (!next) return date;
    date = next;
  }
  return date;
};

// ── Fixed expenses ───────────────────────────────────────────
export const USD_TO_ILS = 3.34; // approximate (Nov 2026), used for totals only
export const EXPENSE_CATEGORIES = ['AI', 'תשתית', 'תוכנה', 'דומיינים', 'שיווק', 'למידה', 'אחר'];
export const CYCLE_LABELS = { monthly: 'חודשי', yearly: 'שנתי' };

export const addMonths = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
};

// Roll a past charge date forward to the next one >= today
export const nextChargeDate = (dateStr, cycle, today = localToday()) => {
  if (!dateStr) return '';
  let d = dateStr;
  for (let i = 0; i < 120 && d < today; i++) d = addMonths(d, cycle === 'yearly' ? 12 : 1);
  return d;
};

export const toIls = (amount, currency) => (Number(amount) || 0) * (currency === 'USD' ? USD_TO_ILS : 1);
export const monthlyIls = (e) => (e.active === false ? 0 : toIls(e.amount, e.currency) / (e.cycle === 'yearly' ? 12 : 1));
export const formatMoney = (amount, currency) =>
  amount === null || amount === undefined || amount === '' ? '?' :
  currency === 'USD' ? `$${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}` :
  `₪${Number(amount).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
