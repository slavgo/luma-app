// Server-side helpers for the LUMA Telegram bot (Vercel serverless functions).
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import {
  localToday, addDays, weekday, normStatus, parseQuickTask, urgencyFromDate, getNextRecurrenceDate, advanceToNextValidDate,
  STATUS_TODO, STATUS_WAITING, DEFAULT_CLIENT, PLATFORMS,
} from '../../src/lib/taskCore.js';

export { localToday, addDays, STATUS_TODO, STATUS_WAITING, DEFAULT_CLIENT };

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const configError = () => {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  return missing.length ? `חסרים משתני סביבה ב-Vercel: ${missing.join(', ')}` : null;
};

export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Secret Telegram sends back on every webhook call — derived from the token, so no extra env var
export const webhookSecret = () => createHash('sha256').update(`luma-tg:${BOT_TOKEN}`).digest('hex').slice(0, 48);

export async function tg(method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) console.error(`[tg] ${method} failed`, body.description);
  return body;
}

export const publicBaseUrl = (req) => {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const relativeDate = (date, today) => {
  if (!date) return 'ללא תאריך';
  const d = Math.round((new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  if (d < 0) return `לפני ${-d} ימים`;
  if (d < 7) return `יום ${DAY_SHORT[weekday(date)]}`;
  const [, m, dd] = date.split('-');
  return `${Number(dd)}.${Number(m)}`;
};

// ── Data ─────────────────────────────────────────────────────

export async function getLinkByChat(db, chatId) {
  const { data } = await db.from('telegram_links').select('*').eq('chat_id', chatId).maybeSingle();
  return data;
}

export async function getClients(db, userId) {
  const { data } = await db.from('clients').select('id, name').eq('user_id', userId).order('name');
  return data || [];
}

export async function getTask(db, userId, id) {
  const { data } = await db.from('tasks').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  return data;
}

export async function openTasks(db, userId) {
  const { data } = await db.from('tasks').select('*').eq('user_id', userId).eq('done', false);
  return (data || []).map(t => ({ ...t, status: normStatus(t.status) }));
}

// Same behaviour as the web app on load: overdue recurring tasks roll forward
export async function advanceRecurring(db, tasks, today) {
  for (const t of tasks) {
    if (t.recurrence && t.recurrence !== 'none' && t.date && t.date < today) {
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
    if (!nextDate) return;
    const { data: existing } = await db.from('tasks').select('id')
      .eq('user_id', task.user_id).eq('task', task.task).eq('client', task.client)
      .eq('date', nextDate).eq('done', false).limit(1);
    if (existing && existing.length) return;
    const { id, created_at, done, status, ...rest } = task;
    await db.from('tasks').insert([{ ...rest, date: nextDate, done: false, status: STATUS_TODO }]);
  }
}

// ── Parsing (regex, optionally upgraded by Claude) ───────────

export async function parseTask(text, clientNames, today) {
  const base = parseQuickTask(text, clientNames, today);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return base;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 300,
        system: `You turn a short Hebrew note into a task for a digital-marketing agency. Today is ${today} (${DAY_NAMES[weekday(today)]}), Israel.
Known clients: ${JSON.stringify(clientNames)}.
Return ONLY JSON: {"task": string (Hebrew, short, imperative, without the client name or date words), "client": one of the known clients exactly or "", "date": "YYYY-MM-DD" or "", "urgent": boolean, "platform": one of ${JSON.stringify(PLATFORMS)}}.`,
        messages: [{ role: 'user', content: text }],
      }),
    });
    const body = await res.json();
    const raw = body?.content?.[0]?.text || '';
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : base.date;
    return {
      ...base,
      task: j.task || base.task,
      client: clientNames.includes(j.client) ? j.client : base.client,
      date,
      platform: PLATFORMS.includes(j.platform) ? j.platform : base.platform,
      urgency: (j.urgent || base.explicitUrgency) ? 'גבוהה' : urgencyFromDate(date, today),
    };
  } catch (e) {
    console.error('[ai-parse] fallback to regex', e.message);
    return base;
  }
}

// ── Messages ─────────────────────────────────────────────────

export function taskCard(task, today, { clients = [], askClient = false } = {}) {
  const lines = [
    task.done ? '✅ <b>בוצע</b>' : '📝 <b>נוספה משימה</b>',
    '',
    `<b>${esc(task.task)}</b>`,
    `👤 ${esc(task.client)}  ·  📅 ${relativeDate(task.date, today)}${task.urgency === 'גבוהה' ? '  ·  ⚡ דחוף' : ''}`,
  ];
  if (task.status === STATUS_WAITING && !task.done) lines.push('⏳ ממתין ללקוח');
  const kb = [];
  if (!task.done) {
    kb.push([
      { text: 'היום', callback_data: `s:${task.id}:0` },
      { text: 'מחר', callback_data: `s:${task.id}:1` },
      { text: 'בעוד שבוע', callback_data: `s:${task.id}:7` },
    ]);
    if (askClient && clients.length) {
      lines.push('', '👤 לאיזה לקוח?');
      const btns = clients.slice(0, 10).map(c => ({ text: c.name, callback_data: `c:${task.id}:${c.id}` }));
      for (let i = 0; i < btns.length; i += 2) kb.push(btns.slice(i, i + 2));
    }
    kb.push([
      { text: task.urgency === 'גבוהה' ? '⚡ בטל דחיפות' : '⚡ דחוף', callback_data: `h:${task.id}` },
      { text: '✅ בוצע', callback_data: `x:${task.id}` },
      { text: '🗑 מחק', callback_data: `u:${task.id}` },
    ]);
  }
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: kb }, parse_mode: 'HTML' };
}

export function digest(tasks, today, { morning = false } = {}) {
  const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999');
  const overdue = tasks.filter(t => t.date && t.date < today).sort(byDate);
  const todays = tasks.filter(t => (t.date === today || t.follow_up_date === today) && !(t.date && t.date < today));
  const shown = new Set([...overdue, ...todays].map(t => t.id));
  const waiting = tasks.filter(t => t.status === STATUS_WAITING && !shown.has(t.id)).sort(byDate);
  const tomorrow = tasks.filter(t => t.date === addDays(today, 1) && !shown.has(t.id) && t.status !== STATUS_WAITING);

  const [, m, d] = today.split('-');
  const lines = [`${morning ? '☀️ <b>בוקר טוב!</b> ' : '📋 '}<b>יום ${DAY_NAMES[weekday(today)]} · ${Number(d)}.${Number(m)}</b>`];
  const actionable = [...overdue, ...todays];
  let n = 0;
  const line = (t, extra = '') => `${++n}. ${t.urgency === 'גבוהה' ? '⚡ ' : ''}${esc(t.task)} — <i>${esc(t.client)}</i>${extra}`;

  if (!actionable.length) lines.push('', '✨ אין משימות להיום.');
  if (overdue.length) {
    lines.push('', `🔴 <b>באיחור (${overdue.length})</b>`);
    overdue.forEach(t => lines.push(line(t, ` (${relativeDate(t.date, today)})`)));
  }
  if (todays.length) {
    lines.push('', `📌 <b>היום (${todays.length})</b>`);
    todays.forEach(t => lines.push(line(t, t.follow_up_date === today ? ' 🔔' : '')));
  }
  if (waiting.length) {
    lines.push('', `⏳ <b>ממתין ללקוח (${waiting.length})</b>`);
    waiting.slice(0, 8).forEach(t => lines.push(`• ${esc(t.task)} — <i>${esc(t.client)}</i>`));
  }
  if (tomorrow.length) {
    lines.push('', `🗓 מחר: ${tomorrow.length} משימות`);
  }
  if (actionable.length) lines.push('', '<i>✅ = בוצע · ⏭ = דחה למחר</i>');

  const kb = [];
  const items = actionable.slice(0, 12);
  for (let i = 0; i < items.length; i += 2) {
    const row = [];
    items.slice(i, i + 2).forEach((t, j) => {
      const num = i + j + 1;
      row.push({ text: `✅ ${num}`, callback_data: `d:${t.id}` }, { text: `⏭ ${num}`, callback_data: `p:${t.id}` });
    });
    kb.push(row);
  }
  kb.push([{ text: '🔄 רענן', callback_data: 'r' }]);
  return { text: lines.join('\n'), reply_markup: { inline_keyboard: kb }, parse_mode: 'HTML', disable_web_page_preview: true };
}

export const HELP = [
  '👋 <b>הבוט של LUMA</b>',
  '',
  'פשוט כתוב לי משימה, למשל:',
  '<i>לשלוח למנור תסריט ביום ג׳ דחוף</i>',
  '<i>בלה פיטנס להחליף קריאייטיב מחר</i>',
  '',
  'אני מזהה לקוח, תאריך (היום / מחר / יום ה׳ / 5.12) ודחיפות.',
  '',
  '/today — מה יש היום',
  '/help — העזרה הזו',
  '',
  'כל בוקר ב-08:30 אשלח סיכום עם כפתורי ✅ / ⏭.',
].join('\n');
