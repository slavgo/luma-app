-- ════════════════════════════════════════════════════════
-- Telegram bot — run once in Supabase SQL Editor
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS telegram_links (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id     BIGINT UNIQUE,
  link_code   TEXT UNIQUE,
  tg_username TEXT,
  linked_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;

-- The app only reads its own row (to show "connected"); the bot writes with the service role key
DROP POLICY IF EXISTS "tg_select_own" ON telegram_links;
CREATE POLICY "tg_select_own" ON telegram_links FOR SELECT USING (auth.uid() = user_id);
