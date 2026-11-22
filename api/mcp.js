// MCP server (Streamable HTTP, stateless JSON responses) — lets an agent like Hermes
// manage LUMA tasks. Auth: "Authorization: Bearer <agent key>" created in the app.
import {
  admin, configError, userFromAgentKey, getClients, getTask, allTasks, advanceRecurring, markDone,
  matchClient, parseQuickTask, todaySummary, taskLine, relativeDate, dayName, localToday, addDays,
  urgencyFromDate, STATUS_TODO, STATUS_WAITING, DEFAULT_CLIENT, PLATFORMS,
} from './_lib/core.js';

const INSTRUCTIONS = `LUMA task manager — Slav's digital-marketing agency tasks (Hebrew). Today's date is always included in tool results; dates are YYYY-MM-DD in Israel time.
Statuses: "${STATUS_TODO}" or "${STATUS_WAITING}" (waiting on the client); finished tasks are marked done with complete_task.
When Slav asks what's on today, call get_today and present it briefly in Hebrew.
When he mentions something to do, call add_task (prefer structured fields; use an existing client name from list_clients; default client is "${DEFAULT_CLIENT}" for internal work).
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
      const tasks = await advanceRecurring(db, await allTasks(db, userId), today);
      return todaySummary(tasks, today).text;
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
