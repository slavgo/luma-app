import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";
import { UpcomingCharges } from "./ExpensesScreen.jsx";
import { parseQuickTask, addDays, localToday, STATUS_TODO, STATUS_WAITING, DEFAULT_CLIENT } from "./lib/taskCore.js";

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);

export const relativeDate = (date, today) => {
  if (!date) return '';
  const d = dayDiff(date, today);
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d === -1) return 'אתמול';
  if (d < 0) return `לפני ${-d} ימים`;
  if (d < 7) return `יום ${DAY_SHORT[new Date(date + 'T00:00:00Z').getUTCDay()]}`;
  const [y, m, dd] = date.split('-');
  return `${Number(dd)}.${Number(m)}${y !== today.slice(0, 4) ? `.${y.slice(2)}` : ''}`;
};

const isRecurring = (t) => t.recurrence && t.recurrence !== 'none';

// ─── Quick add ──────────────────────────────────────────────────────────────
const Chip = ({ children, tone = 'default', onClick, title }) => {
  const tones = {
    default: { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
    accent: { background: 'var(--accent-dim)', color: 'var(--accent)' },
    red: { background: 'rgba(220,38,38,0.1)', color: 'var(--red)' },
  };
  return (
    <button type="button" onClick={onClick} title={title} style={{
      ...tones[tone], border: 'none', borderRadius: 99, padding: '4px 10px',
      fontSize: 12, fontWeight: 600, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
    }}>{children}</button>
  );
};

const QuickAdd = ({ clients, today, onAdd, onOpenFull }) => {
  const [text, setText] = useState('');
  const [clientOverride, setClientOverride] = useState('');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');
  const inputRef = useRef(null);

  const parsed = text.trim() ? parseQuickTask(text, clients, today) : null;
  const client = clientOverride || parsed?.client || DEFAULT_CLIENT;

  const build = () => parsed && {
    task: parsed.task || text.trim(),
    client,
    date: parsed.date,
    urgency: parsed.urgency,
    platform: parsed.platform,
    status: STATUS_TODO,
  };

  const submit = async (e) => {
    e?.preventDefault();
    const t = build();
    if (!t || !t.task || saving) return;
    setSaving(true);
    await onAdd(t);
    setSaving(false);
    setText(''); setClientOverride('');
    setFlash(`✓ נוספה: ${t.task}`);
    setTimeout(() => setFlash(''), 2500);
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={submit} style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16,
      padding: 12, boxShadow: 'var(--shadow-card)',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="מה צריך לעשות? למשל: לשלוח למנור תסריט ביום ג׳ דחוף"
          style={{
            flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 16,
            padding: '8px 4px', color: 'var(--text-primary)', boxShadow: 'none',
          }}
          onFocus={e => { e.target.style.boxShadow = 'none'; }}
        />
        <button type="submit" disabled={!parsed || saving} style={{
          background: parsed ? 'var(--accent)' : 'var(--bg-elevated)', color: parsed ? 'white' : 'var(--text-muted)',
          border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>{saving ? '...' : 'הוסף'}</button>
      </div>

      {parsed && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <select
            value={client}
            onChange={e => setClientOverride(e.target.value)}
            style={{
              border: 'none', borderRadius: 99, padding: '4px 10px', fontSize: 12, fontWeight: 700,
              background: 'var(--accent-dim)', color: 'var(--accent)', cursor: 'pointer', appearance: 'none',
            }}
            title="לקוח"
          >
            {[DEFAULT_CLIENT, ...clients.filter(c => c !== DEFAULT_CLIENT)].map(c => <option key={c} value={c}>👤 {c}</option>)}
          </select>
          <Chip tone={parsed.date && parsed.date <= today ? 'red' : 'default'}>📅 {parsed.date ? relativeDate(parsed.date, today) : 'ללא תאריך'}</Chip>
          {parsed.urgency === 'גבוהה' && <Chip tone="red">⚡ דחוף</Chip>}
          {parsed.platform !== 'כללי' && <Chip>{parsed.platform}</Chip>}
          <button type="button" onClick={() => { const t = build(); setText(''); setClientOverride(''); onOpenFull(t); }}
            style={{ marginRight: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline' }}>
            פירוט מלא
          </button>
        </div>
      )}
      {flash && !parsed && <p style={{ margin: '8px 4px 0', fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{flash}</p>}
    </form>
  );
};

// ─── Task row ───────────────────────────────────────────────────────────────
const IconBtn = ({ onClick, title, children, active }) => (
  <button onClick={e => { e.stopPropagation(); onClick(); }} title={title} style={{
    border: '1px solid var(--border)', background: active ? 'var(--accent-dim)' : 'var(--bg-surface)',
    color: active ? 'var(--accent)' : 'var(--text-secondary)', borderRadius: 8,
    padding: '4px 8px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
  }}>{children}</button>
);

const TodayRow = ({ task, today, onToggleDone, onUpdate, onTaskClick, onClientClick, showPostpone }) => {
  const overdue = task.date && task.date < today;
  const waiting = task.status === STATUS_WAITING;
  const followUp = task.follow_up_date === today;
  return (
    <div onClick={() => onTaskClick(task)} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
      borderBottom: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-surface)',
    }}>
      <span onClick={e => e.stopPropagation()} style={{ display: 'flex' }}>
        <button onClick={() => onToggleDone(task.id)} title="בוצע" style={{
          width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--border-strong)',
          background: 'transparent', flexShrink: 0, padding: 0,
        }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.urgency === 'גבוהה' && <span style={{ color: 'var(--red)' }}>⚡ </span>}
          {task.task}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <button onClick={e => { e.stopPropagation(); onClientClick(task.client); }} style={{
            border: 'none', background: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, fontSize: 12,
          }}>{task.client}</button>
          {task.date && <span style={{ color: overdue ? 'var(--red)' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>{relativeDate(task.date, today)}</span>}
          {followUp && <span style={{ color: '#d97706' }}>🔔 פולו-אפ</span>}
          {isRecurring(task) && <span>🔁</span>}
          {task.link && <a href={task.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--text-muted)' }}>🔗</a>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <IconBtn active={waiting} title={waiting ? 'החזר ללביצוע' : 'סמן כממתין ללקוח'}
          onClick={() => onUpdate({ id: task.id, status: waiting ? STATUS_TODO : STATUS_WAITING })}>⏳</IconBtn>
        {showPostpone && (
          <IconBtn title="דחה למחר" onClick={() => onUpdate({ id: task.id, date: addDays(today, 1) })}>מחר ←</IconBtn>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, count, tone, children, collapsible = false, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  if (!count) return null;
  const color = tone === 'red' ? 'var(--red)' : tone === 'amber' ? '#d97706' : 'var(--text-secondary)';
  return (
    <section style={{ marginTop: 22 }}>
      <button onClick={() => collapsible && setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '0 4px 8px',
        cursor: collapsible ? 'pointer' : 'default', width: '100%', textAlign: 'right',
      }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, color, letterSpacing: '0.02em' }}>{title}</h2>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{count}</span>
        {collapsible && <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{open ? 'הסתר' : 'הצג'}</span>}
      </button>
      {open && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
          {children}
        </div>
      )}
    </section>
  );
};

// ─── Hermes (AI agent) connect ──────────────────────────────────────────────
const HermesConnect = () => {
  const [state, setState] = useState('loading'); // loading | hidden | idle | connected | working | created | error
  const [info, setInfo] = useState(null);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase.from('agent_keys').select('created_at, last_used_at').maybeSingle().then(({ data, error }) => {
      if (error) return setState('hidden');
      setInfo(data);
      setState(data ? 'connected' : 'idle');
    });
  }, []);

  const create = async () => {
    if (info && !window.confirm('ליצור מפתח חדש? המפתח הקודם יפסיק לעבוד.')) return;
    setState('working'); setMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/agent-key', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'שגיאה ביצירת מפתח');
      setKey(body.key); setState('created');
    } catch (e) { setMsg(e.message); setState('error'); }
  };

  const snippet = `mcp_servers:\n  luma:\n    url: "${window.location.origin}/api/mcp"\n    headers:\n      Authorization: "Bearer ${key}"`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch (e) {}
  };

  if (state === 'loading' || state === 'hidden') return null;

  if (state === 'connected') return (
    <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: '24px 0 0' }}>
      🤖 Hermes מחובר{info?.last_used_at ? ` · פעילות אחרונה ${new Date(info.last_used_at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ' · עדיין לא התחבר'}
      {' · '}<button onClick={create} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', textDecoration: 'underline', fontSize: 12, padding: 0 }}>מפתח חדש</button>
    </p>
  );

  return (
    <div style={{ marginTop: 24, padding: 16, borderRadius: 16, border: '1px dashed rgba(var(--accent-rgb),0.45)', background: 'var(--accent-dim)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>🤖 חיבור ל-Hermes</p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            {state === 'created' ? 'העתק את זה ל-~/.hermes/config.yaml בשרת. המפתח מוצג פעם אחת בלבד.' :
             state === 'error' ? msg :
             'הוספת משימות, סיכום בוקר וסימון "בוצע" — בהודעה או בהקלטה בטלגרם.'}
          </p>
        </div>
        {state !== 'created' && (
          <button onClick={create} disabled={state === 'working'} style={{
            background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 13,
          }}>{state === 'working' ? '...' : 'צור מפתח'}</button>
        )}
      </div>
      {state === 'created' && (
        <div style={{ marginTop: 12 }}>
          <pre dir="ltr" style={{
            margin: 0, padding: 12, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)',
            fontSize: 12, overflowX: 'auto', color: 'var(--text-primary)', textAlign: 'left',
          }}>{snippet}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={copy} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 700, fontSize: 13 }}>
              {copied ? '✓ הועתק' : 'העתק'}
            </button>
            <button onClick={() => { setState('connected'); setInfo({ created_at: new Date().toISOString() }); setKey(''); }}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: 'var(--text-secondary)' }}>
              סיימתי
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function TodayScreen({ tasks, expenses = [], onOpenExpenses, clients, user, today = localToday(), onToggleDone, onUpdateTask, onQuickAdd, onOpenFullAdd, onTaskClick, onClientClick, onOpenStats, mobile }) {
  const open = tasks.filter(t => !t.done);
  const weekEnd = addDays(today, 7);

  const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999');
  const overdue = open.filter(t => t.date && t.date < today).sort(byDate);
  const todays = open.filter(t => (t.date === today || t.follow_up_date === today) && !(t.date && t.date < today));
  const shownIds = new Set([...overdue, ...todays].map(t => t.id));
  const waiting = open.filter(t => t.status === STATUS_WAITING && !shownIds.has(t.id)).sort(byDate);
  waiting.forEach(t => shownIds.add(t.id));
  const upcoming = open.filter(t => !shownIds.has(t.id) && t.date > today && t.date <= weekEnd).sort(byDate);
  const undated = open.filter(t => !shownIds.has(t.id) && !t.date && !isRecurring(t));

  const doneToday = tasks.filter(t => t.done && t.date === today).length;
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  const [, m, d] = today.split('-');
  const name = user?.name?.split(' ')[0] || '';

  const rowProps = { today, onToggleDone, onUpdate: onUpdateTask, onTaskClick, onClientClick };

  return (
    <div dir="rtl" style={{ maxWidth: 760, margin: '0 auto', padding: mobile ? '18px 14px 110px' : '36px 28px 60px' }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>יום {DAY_NAMES[dow]} · {Number(d)}.{Number(m)}</p>
      <h1 style={{ margin: '2px 0 4px', fontSize: mobile ? 26 : 32, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {overdue.length + todays.length === 0 ? `נקי להיום${name ? `, ${name}` : ''} ✨` : `${name ? `${name}, ` : ''}יש ${overdue.length + todays.length} דברים להיום`}
      </h1>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--text-secondary)' }}>
        {overdue.length > 0 && <span style={{ color: 'var(--red)', fontWeight: 700 }}>{overdue.length} באיחור · </span>}
        {open.filter(t => t.status === STATUS_WAITING).length} ממתינות ללקוח
        {doneToday > 0 && <span style={{ color: 'var(--green)', fontWeight: 600 }}> · {doneToday} בוצעו היום</span>}
      </p>

      <QuickAdd clients={clients} today={today} onAdd={onQuickAdd} onOpenFull={onOpenFullAdd} />

      <Section title="באיחור" count={overdue.length} tone="red">
        {overdue.map(t => <TodayRow key={t.id} task={t} showPostpone {...rowProps} />)}
      </Section>
      <Section title="היום" count={todays.length}>
        {todays.map(t => <TodayRow key={t.id} task={t} showPostpone {...rowProps} />)}
      </Section>
      <Section title="ממתין ללקוח" count={waiting.length} tone="amber">
        {waiting.map(t => <TodayRow key={t.id} task={t} {...rowProps} />)}
      </Section>
      <UpcomingCharges expenses={expenses} today={today} onOpen={onOpenExpenses} />
      <Section title="השבוע" count={upcoming.length} collapsible defaultOpen={overdue.length + todays.length < 3}>
        {upcoming.map(t => <TodayRow key={t.id} task={t} {...rowProps} />)}
      </Section>
      <Section title="ללא תאריך" count={undated.length} collapsible defaultOpen={false}>
        {undated.map(t => <TodayRow key={t.id} task={t} {...rowProps} />)}
      </Section>

      {open.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>אין משימות פתוחות. תוסיף אחת למעלה 👆</p>
      )}

      <HermesConnect />

      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <button onClick={onOpenStats} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
          📊 סטטיסטיקה ותובנות ←
        </button>
      </div>
    </div>
  );
}
