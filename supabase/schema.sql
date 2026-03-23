-- ════════════════════════════════════════════════════════
-- Task Manager Digital Marketing — Supabase Schema
-- הרץ את הקובץ הזה ב-Supabase SQL Editor
-- ════════════════════════════════════════════════════════

-- ── TASKS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client      TEXT NOT NULL DEFAULT '',
  platform    TEXT NOT NULL DEFAULT 'כללי',
  task        TEXT NOT NULL DEFAULT '',
  urgency     TEXT NOT NULL DEFAULT 'בינונית',
  status      TEXT NOT NULL DEFAULT 'לביצוע',
  date        TEXT DEFAULT '',
  done        BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CLIENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  website     TEXT DEFAULT '',
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- ── CALENDAR ITEMS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS cal_items (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'post',  -- 'post' | 'holiday' | 'campaign'
  title       TEXT NOT NULL DEFAULT '',
  client      TEXT DEFAULT '',
  platform    TEXT DEFAULT '',
  status      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — כל משתמש רואה רק את הנתונים שלו
-- ════════════════════════════════════════════════════════

ALTER TABLE tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cal_items ENABLE ROW LEVEL SECURITY;

-- Tasks policies
CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (auth.uid() = user_id);

-- Clients policies
CREATE POLICY "clients_select" ON clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "clients_update" ON clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "clients_delete" ON clients FOR DELETE USING (auth.uid() = user_id);

-- Cal items policies
CREATE POLICY "cal_select" ON cal_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cal_insert" ON cal_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cal_update" ON cal_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cal_delete" ON cal_items FOR DELETE USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════
-- נתוני דוגמה (אופציונלי — הרץ אחרי הרשמה ראשונה)
-- ════════════════════════════════════════════════════════
-- INSERT INTO clients (user_id, name, phone, email) VALUES
--   (auth.uid(), 'Sea Club', '054-1234567', 'info@seaclub.co.il'),
--   (auth.uid(), 'נדב מאירסון', '052-9876543', 'nadav@gmail.com');
