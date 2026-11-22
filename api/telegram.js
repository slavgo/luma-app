// Telegram webhook — receives messages and button presses from the LUMA bot.
import {
  admin, tg, webhookSecret, configError, getLinkByChat, getClients, getTask, openTasks, advanceRecurring,
  markDone, parseTask, taskCard, digest, HELP, localToday, addDays, STATUS_TODO, STATUS_WAITING, DEFAULT_CLIENT,
} from './_lib/bot.js';

const NOT_LINKED = 'כדי לחבר את הבוט: היכנס לאפליקציית LUMA ← מסך "היום" ← <b>חבר טלגרם</b>.';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');
  if (configError()) return res.status(200).send('not configured');
  if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) return res.status(401).send('bad secret');

  const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (e) {
    console.error('[telegram] handler error', e);
  }
  return res.status(200).send('ok');
}

async function sendDigest(db, link, chatId, editMessageId) {
  const today = localToday();
  const tasks = await advanceRecurring(db, await openTasks(db, link.user_id), today);
  const msg = digest(tasks, today);
  if (editMessageId) return tg('editMessageText', { chat_id: chatId, message_id: editMessageId, ...msg });
  return tg('sendMessage', { chat_id: chatId, ...msg });
}

async function onMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const db = admin();

  // Linking: /start <code>
  if (text.startsWith('/start')) {
    const code = text.split(/\s+/)[1];
    if (code) {
      const { data: row } = await db.from('telegram_links').select('*').eq('link_code', code).maybeSingle();
      if (!row) return tg('sendMessage', { chat_id: chatId, text: 'הקוד לא תקף או שפג תוקפו. לחץ שוב על "חבר טלגרם" באפליקציה.' });
      await db.from('telegram_links').update({ chat_id: null }).eq('chat_id', chatId).neq('user_id', row.user_id);
      await db.from('telegram_links').update({
        chat_id: chatId, link_code: null, tg_username: message.from?.username || null, linked_at: new Date().toISOString(),
      }).eq('user_id', row.user_id);
      await tg('sendMessage', { chat_id: chatId, text: '✅ <b>מחובר!</b>\n\n' + HELP, parse_mode: 'HTML' });
      return sendDigest(db, { user_id: row.user_id }, chatId);
    }
  }

  const link = await getLinkByChat(db, chatId);
  if (!link) return tg('sendMessage', { chat_id: chatId, text: NOT_LINKED, parse_mode: 'HTML' });

  if (!text) {
    return tg('sendMessage', { chat_id: chatId, text: 'כרגע אני מבין רק הודעות טקסט 🙂 כתוב לי את המשימה במילים.' });
  }
  if (/^\/(start|help)\b|^עזרה$/.test(text)) return tg('sendMessage', { chat_id: chatId, text: HELP, parse_mode: 'HTML' });
  if (/^\/today\b|^(היום|מה יש היום\??|משימות)$/.test(text)) return sendDigest(db, link, chatId);

  // Anything else → new task
  const today = localToday();
  const clients = await getClients(db, link.user_id);
  const p = await parseTask(text, clients.map(c => c.name), today);
  const row = {
    user_id: link.user_id,
    task: p.task || text,
    client: p.client || DEFAULT_CLIENT,
    platform: p.platform || 'כללי',
    urgency: p.urgency,
    status: STATUS_TODO,
    date: p.date || '',
    done: false,
    notes: '',
    link: '',
    follow_up_date: '',
    recurrence: 'none',
  };
  const { data: task, error } = await db.from('tasks').insert([row]).select().single();
  if (error) {
    console.error('[telegram] insert failed', error);
    return tg('sendMessage', { chat_id: chatId, text: '⚠️ לא הצלחתי לשמור את המשימה. נסה שוב.' });
  }
  return tg('sendMessage', {
    chat_id: chatId,
    reply_to_message_id: message.message_id,
    ...taskCard(task, today, { clients, askClient: !p.client }),
  });
}

async function onCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const db = admin();
  const link = await getLinkByChat(db, chatId);
  if (!link) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'הבוט לא מחובר לחשבון' });

  const [action, idStr, arg] = String(cb.data || '').split(':');
  const today = localToday();
  const answer = (text) => tg('answerCallbackQuery', { callback_query_id: cb.id, text });

  if (action === 'r') {
    await sendDigest(db, link, chatId, messageId);
    return answer('עודכן');
  }

  const task = await getTask(db, link.user_id, Number(idStr));
  if (!task) { await answer('המשימה לא נמצאה (אולי נמחקה)'); return; }

  // Digest buttons → refresh the digest
  if (action === 'd' || action === 'p') {
    if (action === 'd') await markDone(db, task);
    else await db.from('tasks').update({ date: addDays(today, 1) }).eq('id', task.id);
    await sendDigest(db, link, chatId, messageId);
    return answer(action === 'd' ? `✅ ${task.task}` : `⏭ נדחה למחר`);
  }

  // Task-card buttons → refresh the card
  let updated = task;
  let toast = 'עודכן';
  if (action === 's') {
    ({ data: updated } = await db.from('tasks').update({ date: addDays(today, Number(arg) || 0) }).eq('id', task.id).select().single());
    toast = '📅 התאריך עודכן';
  } else if (action === 'h') {
    ({ data: updated } = await db.from('tasks').update({ urgency: task.urgency === 'גבוהה' ? 'בינונית' : 'גבוהה' }).eq('id', task.id).select().single());
  } else if (action === 'c') {
    const { data: client } = await db.from('clients').select('name').eq('id', Number(arg)).eq('user_id', link.user_id).maybeSingle();
    if (client) ({ data: updated } = await db.from('tasks').update({ client: client.name }).eq('id', task.id).select().single());
    toast = `👤 ${client?.name || ''}`;
  } else if (action === 'w') {
    ({ data: updated } = await db.from('tasks').update({ status: task.status === STATUS_WAITING ? STATUS_TODO : STATUS_WAITING }).eq('id', task.id).select().single());
  } else if (action === 'x') {
    await markDone(db, task);
    updated = { ...task, done: true };
    toast = '✅ בוצע';
  } else if (action === 'u') {
    await db.from('tasks').delete().eq('id', task.id);
    await tg('editMessageText', { chat_id: chatId, message_id: messageId, text: `🗑 נמחקה: ${task.task}` });
    return answer('נמחקה');
  }
  await tg('editMessageText', { chat_id: chatId, message_id: messageId, ...taskCard(updated || task, today) });
  return answer(toast);
}
