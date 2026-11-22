// MCP server (Streamable HTTP, stateless JSON responses) — lets an agent like Hermes
// manage LUMA tasks. Auth: "Authorization: Bearer <agent key>" created in the app.
import {
  admin, configError, userFromAgentKey, getClients, getTask, allTasks, advanceRecurring, markDone,
  matchClient, parseQuickTask, todaySummary, taskLine, relativeDate, dayName, localToday, addDays,
  urgencyFromDate, STATUS_TODO, STATUS_WAITING, DEFAULT_CLIENT, PLATFORMS,
  getExpenses, expenseLine, upcomingCharges, monthlyIls, formatMoney, EXPENSE_CATEGORIES, USD_TO_ILS,
} from './_lib/core.js';

const INSTRUCTIONS = `LUMA task manager — Slav's digital-marketing agency tasks (Hebrew). Today's date is always included in tool results; dates are YYYY-MM-DD in Israel time.
Statuses: "${STATUS_TODO}" or "${STATUS_WAITING}" (waiting on the client); finished tasks are marked done with complete_task.
When Slav asks what's on today, call get_today and present it briefly in Hebrew.
When he mentions something to do, call add_task (prefer structured fields; use an existing client name from list_clients; default client is "${DEFAULT_CLIENT}" for internal work).
Fixed business expenses (subscriptions, tools, domains) live in list_expenses / add_expense / update_expense — not personal purchases.
When he says he finished something, find it (get_today / list_tasks) and call complete_task with its id. Confirm actions in one short Hebrew line.`;

const TOOLS = [
  {
    name: 'get_today',
    description: 'Today\'s overview: overdue, due today (incl. follow-ups), waiting on client, tomorrow. Each task line starts with [#id]. Use for "מה יש היום" and for the morning summary.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_tasks',
    description: 'Search/list tasks. Filter by client, status, text, or date range. Returns lines starting with [#id].',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client name (loose match)' },
        status: { type: 'string', enum: ['open', 'todo', 'waiting', 'done', 'overdue', 'all'], description: 'Default: open' },
        search: { type: 'string', description: 'Text contained in the task' },
        from_date: { type: 'string', description: 'YYYY-MM-DD' },
        to_date: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Default 30' },
      },
    },
  },
  {
    name: 'add_task',
    description: 'Create a task. Either pass structured fields (preferred), or just `text` with a free Hebrew sentence like "לשלוח למנור תסריט ביום ג׳ דחוף" and it will be parsed.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Short task title in Hebrew, without client/date words' },
        client: { type: 'string', description: `Client name from list_clients. Default "${DEFAULT_CLIENT}"` },
        date: { type: 'string', description: 'Due date YYYY-MM-DD (optional)' },
        urgent: { type: 'boolean' },
        platform: { type: 'string', enum: PLATFORMS },
        notes: { type: 'string' },
        follow_up_date: { type: 'string', description: 'Reminder date YYYY-MM-DD (optional)' },
        waiting_on_client: { type: 'boolean' },
        text: { type: 'string', description: 'Free text to parse instead of structured fields' },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark a task as done (recurring tasks automatically get their next occurrence).',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
  },
  {
    name: 'update_task',
    description: 'Change fields of a task.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        task: { type: 'string' },
        client: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD, or empty string to clear' },
        status: { type: 'string', enum: [STATUS_TODO, STATUS_WAITING] },
        urgent: { type: 'boolean' },
        notes: { type: 'string' },
        follow_up_date: { type: 'string', description: 'YYYY-MM-DD, or empty string to clear' },
        reopen: { type: 'boolean', description: 'Set true to un-complete a done task' },
      },
      required: ['id'],
    },
  },
  {
    name: 'postpone_task',
    description: 'Move a task\'s due date forward by N days from today (default 1 = tomorrow), or to a specific date.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' }, days: { type: 'number' }, date: { type: 'string', description: 'YYYY-MM-DD' } },
      required: ['id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task. Only when Slav explicitly asks to delete (not when it is done — use complete_task).',
    inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
  },
  {
    name: 'list_expenses',
    description: 'Fixed business expenses (subscriptions, tools, domains): monthly/yearly totals in ILS, per-category breakdown, upcoming charges, and each item with [#id].',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: EXPENSE_CATEGORIES },
        include_inactive: { type: 'boolean' },
        upcoming_days: { type: 'number', description: 'Show charges due within N days (default 14)' },
      },
    },
  },
  {
    name: 'add_expense',
    description: 'Add a recurring business expense (subscription, tool, domain). Not for one-off or personal purchases.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        amount: { type: 'number' },
        currency: { type: 'string', enum: ['ILS', 'USD'] },
        cycle: { type: 'string', enum: ['monthly', 'yearly'] },
        next_date: { type: 'string', description: 'Next charge date YYYY-MM-DD' },
        category: { type: 'string', enum: EXPENSE_CATEGORIES },
        client: { type: 'string', description: 'Client this cost belongs to (optional)' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_expense',
    description: 'Change an expense, or cancel it (active=false) when a subscription is cancelled.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        amount: { type: 'number' },
        currency: { type: 'string', enum: ['ILS', 'USD'] },
        cycle: { type: 'string', enum: ['monthly', 'yearly'] },
        next_date: { type: 'string' },
        category: { type: 'string', enum: EXPENSE_CATEGORIES },
        client: { type: 'string' },
        notes: { type: 'string' },
        active: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_clients',
    description: 'List client names, with count of open tasks each.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const header = (today) => `היום: ${today} (יום ${dayName(today)})`;

async function callTool(name, args, ctx) {
  const { db, userId } = ctx;
  const today = localToday();
  const notFound = (id) => `לא נמצאה משימה #${id}`;

  switch (name) {
    case 'get_today': {
      const [tasks, expenses] = await Promise.all([
        allTasks(db, userId).then(t => advanceRecurring(db, t, today)),
        getExpenses(db, userId, today),
      ]);
      return todaySummary(tasks, today, expenses).text;
    }

    case 'list_tasks': {
      const status = args.status || 'open';
      let tasks = await allTasks(db, userId, { done: status === 'done' ? true : status === 'all' ? null : false });
      if (args.client) {
        const c = matchClient(args.client, await getClients(db, userId)) || args.client;
        tasks = tasks.filter(t => t.client === c || t.client.includes(args.client));
      }
      if (status === 'todo') tasks = tasks.filter(t => t.status === STATUS_TODO);
      if (status === 'waiting') tasks = tasks.filter(t => t.status === STATUS_WAITING);
      if (status === 'overdue') tasks = tasks.filter(t => t.date && t.date < today);
      if (args.search) tasks = tasks.filter(t => `${t.task} ${t.notes || ''}`.includes(args.search));
      if (isDate(args.from_date)) tasks = tasks.filter(t => t.date && t.date >= args.from_date);
      if (isDate(args.to_date)) tasks = tasks.filter(t => t.date && t.date <= args.to_date);
      tasks.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
      const limit = Math.min(Number(args.limit) || 30, 100);
      if (!tasks.length) return `${header(today)}\nלא נמצאו משימות.`;
      return [`${header(today)}`, `${tasks.length} משימות${tasks.length > limit ? ` (מוצגות ${limit})` : ''}:`,
        ...tasks.slice(0, limit).map(t => (t.done ? '✓ ' : '') + taskLine(t, today))].join('\n');
    }

    case 'add_task': {
      const clients = await getClients(db, userId);
      const names = clients.map(c => c.name);
      let p = { task: args.task, client: args.client, date: args.date, urgency: '', platform: args.platform };
      if (args.text && !args.task) {
        const q = parseQuickTask(args.text, names, today);
        p = { task: q.task || args.text, client: args.client || q.client, date: args.date || q.date, urgency: q.explicitUrgency ? 'גבוהה' : '', platform: args.platform || q.platform };
      }
      if (!p.task) return 'חסר תיאור משימה (task או text)';
      const matched = matchClient(p.client, clients);
      const client = matched || (p.client ? String(p.client).trim() : DEFAULT_CLIENT);
      const date = isDate(p.date) ? p.date : '';
      const row = {
        user_id: userId,
        task: String(p.task).trim(),
        client,
        platform: PLATFORMS.includes(p.platform) ? p.platform : 'כללי',
        urgency: args.urgent || p.urgency === 'גבוהה' ? 'גבוהה' : urgencyFromDate(date, today),
        status: args.waiting_on_client ? STATUS_WAITING : STATUS_TODO,
        date,
        done: false,
        notes: args.notes || '',
        link: '',
        follow_up_date: isDate(args.follow_up_date) ? args.follow_up_date : '',
        recurrence: 'none',
      };
      const { data, error } = await db.from('tasks').insert([row]).select().single();
      if (error) throw new Error(error.message);
      const warn = !matched && p.client ? `\n⚠️ "${p.client}" לא קיים ברשימת הלקוחות (${names.join(', ')}). אם התכוונת ללקוח קיים, עדכן עם update_task.` : '';
      return `נוספה: ${taskLine(data, today)}${warn}`;
    }

    case 'complete_task': {
      const task = await getTask(db, userId, args.id);
      if (!task) return notFound(args.id);
      if (task.done) return `כבר מסומנת כבוצעה: ${task.task}`;
      const next = await markDone(db, task);
      return `✅ בוצע: ${task.task} — ${task.client}${next ? `\n🔁 המופע הבא: ${relativeDate(next, today)} (${next})` : ''}`;
    }

    case 'update_task': {
      const task = await getTask(db, userId, args.id);
      if (!task) return notFound(args.id);
      const u = {};
      if (args.task) u.task = args.task;
      if (args.client) u.client = matchClient(args.client, await getClients(db, userId)) || args.client;
      if (args.date !== undefined) u.date = isDate(args.date) ? args.date : '';
      if (args.follow_up_date !== undefined) u.follow_up_date = isDate(args.follow_up_date) ? args.follow_up_date : '';
      if (args.status) u.status = args.status === STATUS_WAITING ? STATUS_WAITING : STATUS_TODO;
      if (args.urgent !== undefined) u.urgency = args.urgent ? 'גבוהה' : 'בינונית';
      if (args.notes !== undefined) u.notes = args.notes;
      if (args.reopen) { u.done = false; u.status = u.status || STATUS_TODO; }
      if (!Object.keys(u).length) return 'לא צוין מה לשנות';
      const { data, error } = await db.from('tasks').update(u).eq('id', task.id).select().single();
      if (error) throw new Error(error.message);
      return `עודכן: ${taskLine(data, today)}`;
    }

    case 'postpone_task': {
      const task = await getTask(db, userId, args.id);
      if (!task) return notFound(args.id);
      const date = isDate(args.date) ? args.date : addDays(today, Number(args.days) || 1);
      await db.from('tasks').update({ date }).eq('id', task.id);
      return `⏭ ${task.task} — נדחתה ל${relativeDate(date, today)} (${date})`;
    }

    case 'delete_task': {
      const task = await getTask(db, userId, args.id);
      if (!task) return notFound(args.id);
      await db.from('tasks').delete().eq('id', task.id);
      return `🗑 נמחקה: ${task.task} — ${task.client}`;
    }

    case 'list_expenses': {
      const all = await getExpenses(db, userId, today);
      const active = all.filter(e => e.active !== false);
      const monthly = active.reduce((s, e) => s + monthlyIls(e), 0);
      const shown = all.filter(e => (args.include_inactive || e.active !== false) && (!args.category || e.category === args.category))
        .sort((a, b) => monthlyIls(b) - monthlyIls(a));
      const cats = EXPENSE_CATEGORIES.map(c => [c, active.filter(e => e.category === c).reduce((s, e) => s + monthlyIls(e), 0)])
        .filter(([, v]) => v > 0).map(([c, v]) => `${c} ₪${Math.round(v)}`).join(' · ');
      const soon = upcomingCharges(all, today, Number(args.upcoming_days) || 14);
      const missing = active.filter(e => e.amount == null).length;
      return [
        header(today),
        `סה"כ פעיל: ₪${Math.round(monthly)} בחודש · ₪${Math.round(monthly * 12)} בשנה (דולר ≈ ₪${USD_TO_ILS}${missing ? `; ${missing} בלי סכום` : ''})`,
        cats ? `לפי קטגוריה (חודשי): ${cats}` : '',
        soon.length ? `\nחיובים קרובים:\n${soon.map(e => `• ${relativeDate(e.next_date, today)}: ${e.name} ${formatMoney(e.amount, e.currency)}`).join('\n')}` : '',
        `\nכל ההוצאות (${shown.length}):`,
        ...shown.map(e => expenseLine(e, today)),
      ].filter(Boolean).join('\n');
    }

    case 'add_expense': {
      const row = {
        user_id: userId,
        name: String(args.name).trim(),
        amount: typeof args.amount === 'number' ? args.amount : null,
        currency: args.currency === 'USD' ? 'USD' : 'ILS',
        cycle: args.cycle === 'yearly' ? 'yearly' : 'monthly',
        next_date: isDate(args.next_date) ? args.next_date : '',
        category: EXPENSE_CATEGORIES.includes(args.category) ? args.category : 'אחר',
        client: args.client ? (matchClient(args.client, await getClients(db, userId)) || args.client) : '',
        notes: args.notes || '',
        active: true,
      };
      const { data, error } = await db.from('expenses').insert([row]).select().single();
      if (error) throw new Error(error.message);
      return `נוספה הוצאה: ${expenseLine(data, today)}`;
    }

    case 'update_expense': {
      const { data: cur } = await db.from('expenses').select('*').eq('id', Number(args.id)).eq('user_id', userId).maybeSingle();
      if (!cur) return `לא נמצאה הוצאה #${args.id}`;
      const u = {};
      for (const k of ['name', 'notes', 'client']) if (args[k] !== undefined) u[k] = args[k];
      if (args.amount !== undefined) u.amount = args.amount;
      if (args.currency) u.currency = args.currency === 'USD' ? 'USD' : 'ILS';
      if (args.cycle) u.cycle = args.cycle === 'yearly' ? 'yearly' : 'monthly';
      if (args.next_date !== undefined) u.next_date = isDate(args.next_date) ? args.next_date : '';
      if (args.category && EXPENSE_CATEGORIES.includes(args.category)) u.category = args.category;
      if (args.active !== undefined) u.active = !!args.active;
      if (!Object.keys(u).length) return 'לא צוין מה לשנות';
      const { data, error } = await db.from('expenses').update(u).eq('id', cur.id).select().single();
      if (error) throw new Error(error.message);
      return `עודכן: ${expenseLine(data, today)}`;
    }

    case 'list_clients': {
      const [clients, tasks] = await Promise.all([getClients(db, userId), allTasks(db, userId)]);
      const count = (n) => tasks.filter(t => t.client === n).length;
      return [`לקוחות (${clients.length}):`, ...clients.map(c => `• ${c.name} — ${count(c.name)} פתוחות`),
        `• ${DEFAULT_CLIENT} (פנימי) — ${count(DEFAULT_CLIENT)} פתוחות`].join('\n');
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleMessage(msg, ctx) {
  const { id, method, params = {} } = msg;
  const isNotification = id === undefined || id === null;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  if (isNotification) return null;
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'luma-tasks', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call':
      try {
        const text = await callTool(params.name, params.arguments || {}, ctx);
        return ok({ content: [{ type: 'text', text }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: `שגיאה: ${e.message}` }], isError: true });
      }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Use POST (Streamable HTTP, JSON responses)' }, id: null });
  }
  const cfg = configError();
  if (cfg) return res.status(500).json({ jsonrpc: '2.0', error: { code: -32000, message: cfg }, id: null });

  const db = admin();
  const userId = await userFromAgentKey(db, req);
  if (!userId) return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Invalid or missing agent key' }, id: null });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const ctx = { db, userId };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(m => handleMessage(m, ctx)))).filter(Boolean);
    return out.length ? res.status(200).json(out) : res.status(202).end();
  }
  const out = await handleMessage(body || {}, ctx);
  return out ? res.status(200).json(out) : res.status(202).end();
}
