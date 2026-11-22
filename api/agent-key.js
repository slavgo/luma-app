// Creates (or replaces) the agent key for the logged-in user. The key is shown once.
import { admin, configError, userFromJwt, hashKey, newKey } from './_lib/core.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const cfg = configError();
  if (cfg) return res.status(500).json({ error: cfg });

  const db = admin();
  const user = await userFromJwt(db, req);
  if (!user) return res.status(401).json({ error: 'לא מחובר' });

  const key = newKey();
  await db.from('agent_keys').delete().eq('user_id', user.id); // one active key per user
  const { error } = await db.from('agent_keys').insert([{ user_id: user.id, key_hash: hashKey(key), label: 'Hermes' }]);
  if (error) return res.status(500).json({ error: `agent_keys: ${error.message}` });

  return res.status(200).json({ key });
}
