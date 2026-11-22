-- ════════════════════════════════════════════════════════
-- Agent access (Hermes via MCP) — run once in Supabase SQL Editor
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_keys (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key_hash     TEXT UNIQUE NOT NULL,
  label        TEXT DEFAULT 'Hermes',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
ALTER TABLE agent_keys ENABLE ROW LEVEL SECURITY;
-- The app only reads its own rows (to show status); keys are created by the server
CREATE POLICY "agent_keys_select_own" ON agent_keys FOR SELECT USING (auth.uid() = user_id);
