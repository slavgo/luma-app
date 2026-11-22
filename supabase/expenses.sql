-- Fixed expenses (subscriptions, domains, tools) — run once in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS expenses (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  amount      NUMERIC,
  currency    TEXT NOT NULL DEFAULT 'ILS',      -- 'ILS' | 'USD'
  cycle       TEXT NOT NULL DEFAULT 'monthly',  -- 'monthly' | 'yearly'
  next_date   TEXT DEFAULT '',                  -- YYYY-MM-DD
  category    TEXT DEFAULT 'אחר',
  client      TEXT DEFAULT '',                  -- optional: client this cost belongs to
  notes       TEXT DEFAULT '',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_select" ON expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "expenses_insert" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expenses_update" ON expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "expenses_delete" ON expenses FOR DELETE USING (auth.uid() = user_id);
