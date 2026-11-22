// Morning digest — Vercel Cron (see vercel.json). Sends each linked user their day.
import { admin, tg, configError, openTasks, advanceRecurring, digest, localToday } from '../_lib/bot.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const authorized = secret
    ? req.headers.authorization === `Bearer ${secret}`
    : String(req.headers['user-agent'] || '').startsWith('vercel-cron');
  if (!authorized) return res.status(401).json({ error: 'unauthorized' });
  const cfg = configError();
  if (cfg) return res.status(500).json({ error: cfg });

  const db = admin();
  const today = localToday();
  const { data: links } = await db.from('telegram_links').select('user_id, chat_id').not('chat_id', 'is', null);
  let sent = 0;
  for (const link of links || []) {
    const tasks = await advanceRecurring(db, await openTasks(db, link.user_id), today);
    const r = await tg('sendMessage', { chat_id: link.chat_id, ...digest(tasks, today, { morning: true }) });
    if (r.ok) sent++;
  }
  return res.status(200).json({ ok: true, sent });
}
