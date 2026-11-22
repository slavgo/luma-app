// Called by the web app's "חבר טלגרם" button (logged-in user only).
// Makes sure the webhook points at production, and returns a one-time link code.
import { randomBytes } from 'crypto';
import { admin, tg, webhookSecret, configError, publicBaseUrl } from './_lib/bot.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const cfg = configError();
  if (cfg) return res.status(500).json({ error: cfg });

  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const db = admin();
  const { data: { user } = {}, error: authError } = await db.auth.getUser(jwt);
  if (authError || !user) return res.status(401).json({ error: 'לא מחובר' });

  const me = await tg('getMe');
  if (!me.ok) return res.status(500).json({ error: 'הטוקן של הבוט לא תקין' });

  const url = `${publicBaseUrl(req)}/api/telegram`;
  const info = await tg('getWebhookInfo');
  if (info.result?.url !== url) {
    const set = await tg('setWebhook', {
      url, secret_token: webhookSecret(), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
    });
    if (!set.ok) return res.status(500).json({ error: `setWebhook נכשל: ${set.description}` });
    await tg('setMyCommands', {
      commands: [
        { command: 'today', description: 'מה יש היום' },
        { command: 'help', description: 'איך משתמשים' },
      ],
    });
  }

  const code = randomBytes(12).toString('hex');
  const { error } = await db.from('telegram_links').upsert({ user_id: user.id, link_code: code }, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: `טבלת telegram_links: ${error.message}` });

  return res.status(200).json({ username: me.result.username, code });
}
