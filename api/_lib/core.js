// Server-side helpers shared by the agent API (MCP endpoint) and key management.
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import {
  localToday, addDays, weekday, normStatus, parseQuickTask, urgencyFromDate, getNextRecurrenceDate,
  advanceToNextValidDate, STATUS_TODO, STATUS_WAITING, DEFAULT_CLIENT, PLATFORMS,
  nextChargeDate, monthlyIls, formatMoney, EXPENSE_CATEGORIES, CYCLE_LABELS, USD_TO_ILS,
} from '../../src/lib/taskCore.js';

export { localToday, addDays, STATUS_TODO, STATUS_WAITING, DEFAULT_CLIENT, PLATFORMS, urgencyFromDate,
  monthlyIls, formatMoney, EXPENSE_CATEGORIES, CYCLE_LABELS, USD_TO_ILS };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const configError = () => {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing.length ? `חסרים משתני סביבה ב-Vercel: ${missing.join(', ')}` : null;
};

export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ── Agent keys ───────────────────────────────────────────────
export const hashKey = (key) => createHash('sha256').update(String(key)).digest('hex');
export const newKey = () => `luma_${randomBytes(24).toString('base64url')}`;

export async function userFromAgentKey(db, req) {
  const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!key) return null;
  const { data } = await db.from('agent_keys').select('id, user_id').eq('key_hash', hashKey(key)).maybeSingle();
  if (!data) return null;
  db.from('agent_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});
  return data.user_id;
}

export async function userFromJwt(db, req) {
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  return error ? null : data?.user || null;
}

// ── Dates / formatting ───────────────────────────────────────
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const dayName = (date) => DAY_NAMES[weekday(date)];

export const relativeDate = (date, today) => {
  if (!date) return 'ללא תאריך';
  const d = Math.round((new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  if (d < 0) return `לפני ${-d} ימים`;
  if (d < 7) return `יום ${DAY_SHORT[weekday(date)]}`;
  const [y, m, dd] = date.split('-');
  return `${Number(dd)}.${Number(m)}${y !== today.slice(0, 4) ? `.${y.slice(2)}` : ''}`;
};

export const taskLine = (t, today) =>
  `[#${t.id}] ${t.urgency === 'גבוהה' ? '⚡ ' : ''}${t.task} — ${t.client} (${relativeDate(t.date, today)}${t.status === STATUS_WAITING ? ', ממתין ללקוח' : ''}${t.recurrence && t.recurrence !== 'none' ? ', חוזרת' : ''})`;

// ── Data ─────────────────────────────────────────────────────
export async function getClients(db, userId) {
  const { data } = await db.from('clients').select('id, name').eq('user_id', userId).order('name');
  return data || [];
}

export async function getTask(db, userId, id) {
  const { data } = await db.from('tasks').select('*').eq('id', Number(id)).eq('user_id', userId).maybeSingle();
  return data;
}

export async function allTasks(db, userId, { done = false } = {}) {
  let q = db.from('tasks').select('*').eq('user_id', userId);
  if (done !== null) q = q.eq('done', done);
  const { data } = await q;
  return (data || []).map(t => (t.done ? t : { ...t, status: normStatus(t.status) }));
}

// Same behaviour as the web app on load: overdue recurring tasks roll forward
export async function advanceRecurring(db, tasks, today) {
  for (const t of tasks) {
    if (!t.done && t.recurrence && t.recurrence !== 'none' && t.date && t.date < today) {
      const next = advanceToNextValidDate(t.date, t.recurrence, today);
      if (next !== t.date) {
        await db.from('tasks').update({ date: next }).eq('id', t.id);
        t.date = next;
      }
    }
  }
  return tasks;
}

export async function markDone(db, task) {
  await db.from('tasks').update({ done: true, status: 'בוצע' }).eq('id', task.id);
  if (task.recurrence && task.recurrence !== 'none' && task.date) {
    const nextDate = getNextRecurrenceDate(task.date, task.recurrence);
    if (!nextDate) return null;
    const { data: existing } = await db.from('tasks').select('id')
      .eq('user_id', task.user_id).eq('task', task.task).eq('client', task.client)
      .eq('date', nextDate).eq('done', false).limit(1);
    if (existing && existing.length) return nextDate;
    const { id, created_at, done, status, ...rest } = task;
    await db.from('tasks').insert([{ ...rest, date: nextDate, done: false, status: STATUS_TODO }]);
    return nextDate;
  }
  return null;
}

// Match a client name loosely ("מנור", "למנור", "בלה") against the known list
export function matchClient(name, clients) {
  if (!name) return '';
  const n = String(name).trim().replace(/^[ולבשמה](?=\S{2,})/, '');
  const names = clients.map(c => c.name);
  return names.find(c => c === name) ||
    names.find(c => c.toLowerCase() === String(name).trim().toLowerCase()) ||
    names.find(c => c.includes(n) || n.includes(c) || c.replace(/^ה/, '') === n) || '';
}

export { parseQuickTask };

// ── Expenses ─────────────────────────────────────────────────
export async function getExpenses(db, userId, today) {
  const { data, error } = await db.from('expenses').select('*').eq('user_id', userId).order('name');
  if (error || !data) return [];
  for (const e of data) {
    if (e.active === false) continue;
    const next = nextChargeDate(e.next_date, e.cycle, today);
    if (next !== e.next_date) { await db.from('expenses').update({ next_date: next }).eq('id', e.id); e.next_date = next; }
  }
  return data;
}

export const expenseLine = (e, today) =>
  `[#${e.id}] ${e.name} — ${formatMoney(e.amount, e.currency)} ${CYCLE_LABELS[e.cycle] || e.cycle} · ${e.category}${e.client ? ` · ${e.client}` : ''}${e.next_date && e.active !== false ? ` · חיוב הבא ${relativeDate(e.next_date, today)} (${e.next_date})` : ''}${e.active === false ? ' · בוטל' : ''}`;

export const upcomingCharges = (expenses, today, days = 3) =>
  expenses.filter(e => e.active !== false && e.next_date && e.next_date >= today && e.next_date <= addDays(today, days))
    .sort((a, b) => a.next_date.localeCompare(b.next_date));

// ── Today summary (what the morning message is built from) ───
export function todaySummary(tasks, today, expenses = []) {
  const open = tasks.filter(t => !t.done);
  const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999');
  const overdue = open.filter(t => t.date && t.date < today).sort(byDate);
  const todays = open.filter(t => (t.date === today || t.follow_up_date === today) && !(t.date && t.date < today));
  const shown = new Set([...overdue, ...todays].map(t => t.id));
  const waiting = open.filter(t => t.status === STATUS_WAITING && !shown.has(t.id)).sort(byDate);
  const tomorrow = open.filter(t => t.date === addDays(today, 1) && !shown.has(t.id) && t.status !== STATUS_WAITING);
  const week = open.filter(t => t.date > addDays(today, 1) && t.date <= addDays(today, 7) && !shown.has(t.id) && t.status !== STATUS_WAITING).sort(byDate);

  const [, m, d] = today.split('-');
  const lines = [`יום ${dayName(today)} · ${Number(d)}.${Number(m)}`];
  const block = (title, list) => { if (list.length) lines.push('', `${title} (${list.length})`, ...list.map(t => taskLine(t, today))); };
  block('🔴 באיחור', overdue);
  block('📌 היום', todays);
  block('⏳ ממתין ללקוח', waiting);
  block('🗓 מחר', tomorrow);
  if (week.length) lines.push('', `📅 בהמשך השבוע: ${week.length} משימות`);
  const charges = upcomingCharges(expenses, today);
  if (charges.length) lines.push('', `💳 חיובים קרובים (${charges.length})`, ...charges.map(e => `${relativeDate(e.next_date, today)}: ${e.name} ${formatMoney(e.amount, e.currency)}`));
  if (!overdue.length && !todays.length) lines.push('', '✨ אין משימות להיום.');
  return { text: lines.join('\n'), counts: { overdue: overdue.length, today: todays.length, waiting: waiting.length, tomorrow: tomorrow.length, week: week.length } };
}
