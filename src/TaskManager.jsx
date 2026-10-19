import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";

const TODAY = new Date().toISOString().slice(0, 10);
const PLATFORMS = ["גוגל אדס", "מטא - ממומן", "סושיאל", "גרפיקה/וידאו", "כללי"];
const URGENCIES = ["גבוהה", "בינונית", "נמוכה"];
const STATUSES = ["לביצוע", "בביצוע", "ממתין לאישור", "בתיקונים", "ממתין לחומרים"];
const emptyTask = { client: "", platform: PLATFORMS[0], task: "", urgency: "בינונית", status: "לביצוע", date: "", done: false, notes: "", link: "", follow_up_date: "", recurrence: "none" };

const RECURRENCE_LABELS = { none: 'ללא', daily: 'יומי', weekly: 'שבועי', monthly: 'חודשי', custom: 'ימים קבועים' };
const HEBREW_WEEKDAYS = ['א׳ (ראשון)','ב׳ (שני)','ג׳ (שלישי)','ד׳ (רביעי)','ה׳ (חמישי)','ו׳ (שישי)','ש׳ (שבת)'];

const RECURRENCE_LOOKAHEAD_DAYS = 2;

const getNextRecurrenceDate = (fromDate, recurrence) => {
  if (!recurrence || recurrence === 'none') return null;
  const d = new Date(fromDate);
  if (recurrence === 'daily') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
  if (recurrence === 'weekly') { d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); }
  if (recurrence === 'monthly') { d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); }
  const days = recurrence.split(',').map(Number).filter(n => !isNaN(n));
  if (!days.length) return null;
  const next = new Date(fromDate);
  for (let i = 1; i <= 14; i++) {
    next.setDate(next.getDate() + 1);
    if (days.includes(next.getDay())) return next.toISOString().slice(0, 10);
  }
  return null;
};

// Returns next occurrence ON OR AFTER today (for reschedule + auto-fill)
const getNextRecurrenceOnOrAfterToday = (recurrence) => {
  if (!recurrence || recurrence === 'none') return '';
  const days = recurrence.split(',').map(Number).filter(n => !isNaN(n));
  if (days.length) {
    const today = new Date(TODAY);
    if (days.includes(today.getDay())) return TODAY;
    for (let i = 1; i <= 14; i++) {
      const d = new Date(TODAY);
      d.setDate(d.getDate() + i);
      if (days.includes(d.getDay())) return d.toISOString().slice(0, 10);
    }
    return '';
  }
  return TODAY; // daily/weekly/monthly: start today
};

// Advances a past recurring task date forward until it's >= today
const advanceToNextValidDate = (taskDate, recurrence) => {
  let date = taskDate;
  for (let i = 0; i < 60; i++) {
    if (date >= TODAY) return date;
    const next = getNextRecurrenceDate(date, recurrence);
    if (!next) return date;
    date = next;
  }
  return date;
};

const PLATFORM_ICONS = {
  "גוגל אדס": "🔍",
  "מטא - ממומן": "📘",
  "סושיאל": "📱",
  "גרפיקה/וידאו": "🎬",
  "כללי": "📋",
};

const getUrgencyStyle = (urgency) => {
  switch (urgency) {
    case 'גבוהה': return { background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.25)' };
    case 'בינונית': return { background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' };
    default: return { background: 'rgba(59,130,246,0.1)', color: 'var(--blue)', border: '1px solid rgba(59,130,246,0.25)' };
  }
};

const getStatusColor = (status) => {
  switch (status) {
    case 'בביצוע': return 'var(--blue)';
    case 'ממתין לאישור': return '#f59e0b';
    case 'בתיקונים': return 'var(--red)';
    case 'ממתין לחומרים': return '#a855f7';
    default: return 'var(--text-muted)';
  }
};

// ─── Checkbox Button ────────────────────────────────────────────────────────
const DoneCheckbox = ({ done, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${done ? 'var(--green)' : 'var(--border-strong)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: done ? 'var(--green)' : 'transparent', cursor: 'pointer', transition: 'all 0.12s',
    }}
  >
    {done && (
      <svg viewBox="0 0 10 8" style={{ width: 10, height: 10, fill: 'none', stroke: '#fff', strokeWidth: 2 }}>
        <polyline points="1,4 4,7 9,1" />
      </svg>
    )}
  </button>
);

// ─── Task Row ────────────────────────────────────────────────────────────────
const ClientBadge = ({ name, onClick, done }) => (
  <button
    onClick={onClick}
    style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      background: 'var(--accent-dim)', color: 'var(--accent)',
      border: 'none', cursor: 'pointer', opacity: done ? 0.5 : 1,
      transition: 'opacity 0.1s',
    }}
  >
    {name}
  </button>
);

const URGENCY_BORDER = { 'גבוהה': '#ef4444', 'בינונית': '#f97316', 'נמוכה': '#6366f1' };

const TaskRow = ({ task, onToggleDone, onClientClick, onTaskClick, showClient = true }) => (
  <tr style={{
    borderBottom: '1px solid var(--border)',
    opacity: task.done ? 0.4 : 1,
    borderRight: `3px solid ${task.done ? 'var(--border)' : (URGENCY_BORDER[task.urgency] || 'var(--accent)')}`,
    transition: 'background 0.1s',
  }}
    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    className="group"
  >
    <td className="pl-5 pr-3 py-3">
      <DoneCheckbox done={task.done} onToggle={() => onToggleDone(task.id)} />
    </td>
    {showClient && (
      <td className="px-3 py-3">
        <ClientBadge name={task.client} onClick={() => onClientClick(task.client)} done={task.done} />
      </td>
    )}
    <td className="px-3 py-3 cursor-pointer" onClick={() => onTaskClick && onTaskClick(task)}>
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 13, color: task.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.4 }}>
          {task.task}
        </span>
        {task.notes && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>📝</span>}
        {task.link && !task.done && (
          <a href={task.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, flexShrink: 0, color: 'var(--blue)' }} title="פתח קישור">🔗</a>
        )}
        {task.recurrence && task.recurrence !== 'none' && !task.done && (
          <span style={{ fontSize: 11, flexShrink: 0, color: 'var(--accent)' }} title={`חוזרת: ${RECURRENCE_LABELS[task.recurrence] || 'ימים קבועים'}`}>🔁</span>
        )}
        {task.follow_up_date && !task.done && (
          <span style={{ fontSize: 11, flexShrink: 0, color: task.follow_up_date <= TODAY ? '#f59e0b' : 'var(--text-muted)' }} title={`פולו-אפ: ${task.follow_up_date}`}>🔔</span>
        )}
      </div>
    </td>
    <td className="px-3 py-3">
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{PLATFORM_ICONS[task.platform]} {task.platform}</span>
    </td>
    <td className="px-3 py-3">
      {!task.done && (
        <span style={{ fontSize: 11, fontWeight: 600, color: task.urgency === 'גבוהה' ? 'var(--red)' : task.urgency === 'בינונית' ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
          {task.urgency}
        </span>
      )}
    </td>
    <td className="px-3 py-3">
      {!task.done && (
        task.status === 'בביצוע' ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#60a5fa' }}>
            <span style={{ width: 6, height: 6, background: '#3b82f6', borderRadius: '50%' }} className="animate-pulse" />בביצוע
          </span>
        ) : task.status === 'בתיקונים' ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#f87171' }}>
            <span style={{ width: 6, height: 6, background: '#dc2626', borderRadius: '50%' }} className="animate-pulse" />בתיקונים
          </span>
        ) : task.status === 'ממתין לחומרים' ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#c084fc' }}>
            <span style={{ width: 6, height: 6, background: '#9333ea', borderRadius: '50%' }} />ממתין לחומרים
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>{task.status}</span>
        )
      )}
    </td>
    <td style={{ padding: '0 12px', fontSize: 11, fontFamily: 'Inter, monospace', color: task.done ? 'var(--text-muted)' : task.date < TODAY ? 'var(--red)' : 'var(--text-secondary)', textDecoration: task.done ? 'line-through' : 'none', fontWeight: task.date < TODAY && !task.done ? 600 : 400 }}>
      {task.date}
    </td>
  </tr>
);

// ─── Shared field wrapper (must be defined outside TaskDetailModal to avoid focus loss on re-render) ───
const Field = ({ label, children }) => (
  <div>
    <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block', fontWeight: 600 }}>{label}</label>
    {children}
  </div>
);
const fieldInput = { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' };

// ─── Task Detail Modal ───────────────────────────────────────────────────────
const TaskDetailModal = ({ task, clients, onClose, onSave, onDelete, onStopRecurring, onLinkToCalendar, onSaveTemplate, onFollowUp, isNew = false, templates = [], onApplyTemplate }) => {
  const [form, setForm] = useState({ ...task });
  const [linkedToCalendar, setLinkedToCalendar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState(task.task || '');
  const [templateSaved, setTemplateSaved] = useState(false);
  const mobile = useMobile();

  const handleSave = () => { onSave(form); onClose(); };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !onSaveTemplate) return;
    const ok = await onSaveTemplate({ name: templateName.trim(), task: form.task, platform: form.platform, urgency: form.urgency, status: form.status, notes: form.notes || '' });
    if (ok !== false) { setTemplateSaved(true); setShowSaveTemplate(false); }
  };

  const handleLinkCalendar = () => {
    onLinkToCalendar({
      type: "post",
      title: form.task,
      client: form.client,
      platform: form.platform,
      status: form.status === "ממתין לאישור" ? "ממתין לאישור" : "טיוטה",
      date: form.date,
      id: Date.now() + 1,
    });
    setLinkedToCalendar(true);
  };


  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200, padding: '0 0 0 0' }} className="sm:items-center sm:p-4" onClick={onClose}>
      <div className="modal-sheet" style={{ background: 'var(--bg-surface)', borderRadius: mobile ? '24px 24px 0 0' : 16, border: '1px solid var(--border)', width: '100%', maxWidth: 520, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} dir="rtl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: isNew ? 'var(--accent-dim)' : task.urgency === 'גבוהה' ? 'rgba(239,68,68,0.1)' : task.urgency === 'בינונית' ? 'rgba(245,158,11,0.1)' : 'var(--bg-elevated)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isNew ? '➕ משימה חדשה' : `${task.client} · ${PLATFORM_ICONS[task.platform]} ${task.platform}`}</p>
                {isNew && templates.length > 0 && onApplyTemplate && (
                  <select
                    style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 99, padding: '2px 8px', background: 'var(--bg-elevated)', color: 'var(--accent)', outline: 'none', cursor: 'pointer' }}
                    defaultValue=""
                    onChange={e => { if (e.target.value) { onApplyTemplate(templates.find(t => String(t.id) === e.target.value)); e.target.value = ''; } }}
                  >
                    <option value="">📋 מתבנית</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>
              <input
                style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none', width: '100%' }}
                value={form.task}
                onChange={e => setForm(f => ({...f, task: e.target.value}))}
                placeholder="שם המשימה"
                autoFocus={isNew && !mobile}
              />
            </div>
            <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>×</button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1 }}>

          {/* Row 1: client + platform */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="לקוח">
              <select style={{ ...fieldInput, cursor: 'pointer' }} value={form.client} onChange={e => setForm(f => ({...f, client: e.target.value}))}>
                <option value="">בחר לקוח</option>
                {clients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="פלטפורמה">
              <select style={{ ...fieldInput, cursor: 'pointer' }} value={form.platform} onChange={e => setForm(f => ({...f, platform: e.target.value}))}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>

          {/* Row 2: urgency + status + date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="דחיפות">
              <select style={{ ...fieldInput, cursor: 'pointer' }} value={form.urgency} onChange={e => setForm(f => ({...f, urgency: e.target.value}))}>
                {URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="סטטוס">
              <select style={{ ...fieldInput, cursor: 'pointer' }} value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="תאריך יעד">
              <input type="date" style={fieldInput} value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
            </Field>
          </div>

          {/* Notes */}
          <Field label="📝 הערות">
            <textarea
              style={{ ...fieldInput, resize: 'none' }}
              rows={3}
              placeholder="פרטים נוספים, לינקים, הנחיות..."
              value={form.notes || ""}
              onChange={e => setForm(f => ({...f, notes: e.target.value}))}
            />
          </Field>

          {/* Link */}
          <Field label="🔗 קישור">
            <input
              type="url"
              dir="ltr"
              style={{ ...fieldInput, textAlign: 'left' }}
              placeholder="https://..."
              value={form.link || ""}
              onChange={e => setForm(f => ({...f, link: e.target.value}))}
            />
          </Field>

          {/* Follow-up date */}
          <Field label="🔔 תזכורת פולו-אפ">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="date"
                style={{ ...fieldInput, flex: 1 }}
                value={form.follow_up_date || ""}
                onChange={e => setForm(f => ({...f, follow_up_date: e.target.value}))}
              />
              {form.follow_up_date && (
                <button onClick={() => setForm(f => ({...f, follow_up_date: ""}))} style={{ color: 'var(--text-muted)', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>×</button>
              )}
            </div>
            {form.follow_up_date && (
              <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>
                {form.follow_up_date === TODAY ? "⚡ תזכורת להיום" : form.follow_up_date < TODAY ? "⚠️ תזכורת בוטלה" : `תזכורת ב-${form.follow_up_date}`}
              </p>
            )}
          </Field>

          {/* Recurrence */}
          {(() => {
            const FIXED = ['none','daily','weekly','monthly'];
            const isCustom = form.recurrence && !FIXED.includes(form.recurrence);
            const customDays = isCustom ? form.recurrence.split(',').map(Number).filter(n => !isNaN(n)) : [];
            const selectVal = isCustom ? 'custom' : (form.recurrence || 'none');

            const toggleDay = (idx) => {
              const next = customDays.includes(idx)
                ? customDays.filter(d => d !== idx)
                : [...customDays, idx];
              const newRec = next.sort().join(',') || 'none';
              const autoDate = (!form.date && newRec !== 'none') ? getNextRecurrenceOnOrAfterToday(newRec) : form.date;
              setForm(f => ({ ...f, recurrence: newRec, date: autoDate || f.date }));
            };

            const nextDate = form.date && form.recurrence && form.recurrence !== 'none'
              ? getNextRecurrenceDate(form.date, form.recurrence) : null;

            return (
              <Field label="🔁 משימה חוזרת">
                <select
                  style={{ ...fieldInput, cursor: 'pointer' }}
                  value={selectVal}
                  onChange={e => {
                    const v = e.target.value;
                    const newRec = v === 'custom' ? (customDays.join(',') || '0') : v;
                    const autoDate = (!form.date && newRec !== 'none') ? getNextRecurrenceOnOrAfterToday(newRec) : form.date;
                    setForm(f => ({ ...f, recurrence: newRec, date: autoDate || f.date }));
                  }}
                >
                  {Object.entries(RECURRENCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {isCustom && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'].map((label, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        style={{ padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: '1px solid', cursor: 'pointer', transition: 'all 0.15s',
                          background: customDays.includes(idx) ? 'var(--accent)' : 'var(--bg-elevated)',
                          borderColor: customDays.includes(idx) ? 'var(--accent)' : 'var(--border)',
                          color: customDays.includes(idx) ? 'white' : 'var(--text-secondary)' }}
                      >{label}</button>
                    ))}
                  </div>
                )}
                {nextDate && <p style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>המחזור הבא: {nextDate}</p>}
              </Field>
            );
          })()}

          {/* Link to content calendar + Google Calendar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 12, border: '1px solid', background: linkedToCalendar ? 'rgba(34,197,94,0.1)' : 'var(--bg-elevated)', borderColor: linkedToCalendar ? 'rgba(34,197,94,0.3)' : 'var(--border)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>📅 לוח תוכן פנימי</p>
              {!linkedToCalendar ? (
                <button onClick={handleLinkCalendar} disabled={!form.date}
                  style={{ padding: '4px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: form.date ? 1 : 0.4 }}>
                  {form.date ? "קשר ללוח" : "נדרש תאריך"}
                </button>
              ) : <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>✓ קושר</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>🗓 Google Calendar</p>
              <a
                href={form.date ? (() => {
                  const d = form.date.replace(/-/g, '');
                  const next = new Date(form.date); next.setDate(next.getDate()+1);
                  const d2 = next.toISOString().slice(0,10).replace(/-/g,'');
                  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(form.task)}&dates=${d}/${d2}&details=${encodeURIComponent(`${form.client} · ${form.platform}${form.notes ? '\n' + form.notes : ''}`)}`;
                })() : '#'}
                target="_blank" rel="noopener noreferrer"
                style={{ padding: '4px 8px', background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 8, fontSize: 11, fontWeight: 600, textAlign: 'center', textDecoration: 'none', opacity: form.date ? 1 : 0.4, pointerEvents: form.date ? 'auto' : 'none' }}
              >
                {form.date ? "פתח בגוגל" : "נדרש תאריך"}
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {/* Save as template row */}
          {!isNew && showSaveTemplate ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input
                style={{ ...fieldInput, flex: 1 }}
                placeholder="שם התבנית..."
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
                autoFocus
              />
              <button onClick={handleSaveTemplate} disabled={!templateName.trim()} style={{ padding: '6px 12px', background: 'var(--accent)', color: 'white', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: templateName.trim() ? 1 : 0.4 }}>שמור</button>
              <button onClick={() => setShowSaveTemplate(false)} style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>ביטול</button>
            </div>
          ) : !isNew && templateSaved ? (
            <p style={{ fontSize: 11, color: 'var(--green)', marginBottom: 12 }}>✓ נשמר כתבנית</p>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {!isNew && (confirmDelete ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {task.recurrence && task.recurrence !== 'none' && onStopRecurring ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => { onStopRecurring(task.task, task.client); onClose(); }} style={{ padding: '5px 12px', background: 'var(--red)', color: 'white', borderRadius: 8, fontSize: 12, border: 'none', cursor: 'pointer' }}>🛑 עצור כל החזרות</button>
                      <button onClick={() => { onDelete(task.id); onClose(); }} style={{ padding: '5px 12px', background: 'rgba(239,68,68,0.15)', color: 'var(--red)', borderRadius: 8, fontSize: 12, border: 'none', cursor: 'pointer' }}>מחק רק זו</button>
                      <button onClick={() => setConfirmDelete(false)} style={{ padding: '5px 10px', color: 'var(--text-muted)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>ביטול</button>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--red)', opacity: 0.7 }}>"עצור כל החזרות" ימחק את כל ההופעות הפתוחות ויעצור את המחזור</p>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--red)' }}>בטוח?</span>
                    <button onClick={() => { onDelete(task.id); onClose(); }} style={{ padding: '5px 12px', background: 'var(--red)', color: 'white', borderRadius: 8, fontSize: 12, border: 'none', cursor: 'pointer' }}>מחק</button>
                    <button onClick={() => setConfirmDelete(false)} style={{ padding: '5px 10px', color: 'var(--text-muted)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer' }}>ביטול</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setConfirmDelete(true)} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>🗑 מחק</button>
                {!templateSaved && onSaveTemplate && <button onClick={() => { setShowSaveTemplate(true); setTemplateName(form.task); }} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>📌 שמור כתבנית</button>}
                {onFollowUp && (
                  <button
                    onClick={() => onFollowUp({ client: form.client, platform: form.platform })}
                    style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
                  >➕ המשימה הבאה</button>
                )}
              </div>
            ))}
            {isNew && <div />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>ביטול</button>
              <button onClick={handleSave} style={{ padding: '8px 20px', background: 'var(--accent)', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                {isNew ? 'הוסף משימה' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Calendar Screen ─────────────────────────────────────────────────────────
const CAL_ITEM_COLORS = {
  post:     { bg: "bg-blue-100",   text: "text-blue-700",   dot: "bg-blue-500",   label: "פוסט" },
  campaign: { bg: "bg-green-100",  text: "text-green-700",  dot: "bg-green-500",  label: "קמפיין" },
  holiday:  { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500", label: "חג/אירוע" },
};

const HEBREW_DAYS = ["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"];
const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

const CalendarScreen = ({ calItems, onAddItem, onDeleteItem, clients }) => {
  const mobile = useMobile();
  const now = new Date(TODAY);
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-based
  const [dayModal,  setDayModal]  = useState(null); // {dateStr, items}
  const [addForm,   setAddForm]   = useState(null); // null or { type, title, client, platform, status }

  const emptyForm = { type: "post", title: "", client: "", platform: PLATFORMS[0], status: "טיוטה" };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0);  setViewYear(y => y+1); } else setViewMonth(m => m+1); };

  // Build grid: 6 rows × 7 cols (Sun=0 ... Sat=6)
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startCol = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dateStr = (d) => `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const itemsForDay = (d) => calItems.filter(i => i.date === dateStr(d));

  const openDay = (d) => {
    if (!d) return;
    setDayModal({ dateStr: dateStr(d), items: itemsForDay(d) });
    setAddForm(null);
  };

  const submitAdd = () => {
    if (!addForm.title.trim()) return;
    onAddItem({ ...addForm, date: dayModal.dateStr });
    setDayModal(prev => ({ ...prev, items: [...prev.items, { ...addForm, date: prev.dateStr, id: Date.now() }] }));
    setAddForm(null);
  };

  return (
    <div className={mobile ? "p-3 min-h-screen" : "p-6 min-h-screen"} style={{ background: '#f5f6fa' }} dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full border text-lg" style={{ background: '#ffffff', borderColor: '#e8eaf0', color: '#475569' }}>‹</button>
          <h2 className="text-xl font-bold min-w-32 text-center" style={{ color: '#0f172a' }}>{HEBREW_MONTHS[viewMonth]} {viewYear}</h2>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full border text-lg" style={{ background: '#ffffff', borderColor: '#e8eaf0', color: '#475569' }}>›</button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Legend */}
          {!mobile && (
            <div className="flex gap-3 text-xs text-gray-500">
              {Object.entries(CAL_ITEM_COLORS).map(([key, c]) => (
                <span key={key} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${c.dot}`}></span>{c.label}</span>
              ))}
            </div>
          )}
          <button onClick={() => { setDayModal({ dateStr: TODAY, items: calItems.filter(i => i.date === TODAY) }); setAddForm({...emptyForm}); }} className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            + הוסף תוכן
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e8eaf0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {/* Day headers */}
        <div className="grid grid-cols-7" style={{ borderBottom: '1px solid #e8eaf0', background: '#f8fafc' }}>
          {HEBREW_DAYS.map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold" style={{ color: '#94a3b8' }}>{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const isToday = day && dateStr(day) === TODAY;
            const items = day ? itemsForDay(day) : [];
            return (
              <div
                key={idx}
                onClick={() => openDay(day)}
                className="min-h-20 p-1.5 transition-colors"
                style={{
                  borderBottom: '1px solid #f1f5f9',
                  borderLeft: '1px solid #f1f5f9',
                  cursor: day ? 'pointer' : 'default',
                  background: isToday ? 'rgba(99,102,241,0.06)' : !day ? '#fafbfc' : 'transparent',
                }}
                onMouseEnter={e => { if (day && !isToday) e.currentTarget.style.background = '#f8fafc'; }}
                onMouseLeave={e => { if (day && !isToday) e.currentTarget.style.background = 'transparent'; }}
              >
                {day && (
                  <>
                    <span className="text-xs font-semibold mb-1 block" style={{ color: isToday ? '#6366f1' : '#94a3b8' }}>
                      {isToday ? <span style={{ background: '#6366f1', color: 'white', borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{day}</span> : day}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {items.slice(0, 3).map(item => (
                        <span key={item.id} className={`text-xs px-1 py-0.5 rounded truncate ${CAL_ITEM_COLORS[item.type]?.bg} ${CAL_ITEM_COLORS[item.type]?.text}`}>
                          {item.title}
                        </span>
                      ))}
                      {items.length > 3 && <span className="text-xs text-gray-400">+{items.length - 3} עוד</span>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Modal */}
      {dayModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => { setDayModal(null); setAddForm(null); }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' }} dir="rtl" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{dayModal.dateStr}</h3>
              <button onClick={() => { setDayModal(null); setAddForm(null); }} style={{ color: 'var(--text-muted)', fontSize: 22, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
            </div>

            {/* Items list */}
            {dayModal.items.length === 0 && !addForm && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 16, textAlign: 'center' }}>אין תוכן מתוכנן ליום זה</p>
            )}
            {dayModal.items.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: 12, marginBottom: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {CAL_ITEM_COLORS[item.type]?.label}
                    {item.client && ` · ${item.client}`}
                    {item.platform && ` · ${item.platform}`}
                    {item.status && ` · ${item.status}`}
                  </p>
                </div>
                <button onClick={() => { onDeleteItem(item.id); setDayModal(prev => ({ ...prev, items: prev.items.filter(i => i.id !== item.id) })); }} style={{ color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>
            ))}

            {/* Add form */}
            {addForm ? (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>הוספת תוכן</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Object.entries(CAL_ITEM_COLORS).map(([key, c]) => (
                    <button key={key} onClick={() => setAddForm(f => ({...f, type: key}))}
                      style={{ padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: '1px solid', cursor: 'pointer',
                        background: addForm.type === key ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        borderColor: addForm.type === key ? 'var(--accent)' : 'var(--border)',
                        color: addForm.type === key ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <input style={{ ...fieldInput }} placeholder="כותרת / תיאור" value={addForm.title} onChange={e => setAddForm(f => ({...f, title: e.target.value}))} autoFocus />
                {addForm.type !== 'holiday' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <select style={{ ...fieldInput, cursor: 'pointer' }} value={addForm.client} onChange={e => setAddForm(f => ({...f, client: e.target.value}))}>
                      <option value="">לקוח (אופציונלי)</option>
                      {clients.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select style={{ ...fieldInput, cursor: 'pointer' }} value={addForm.platform} onChange={e => setAddForm(f => ({...f, platform: e.target.value}))}>
                      {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
                {addForm.type === 'post' && (
                  <select style={{ ...fieldInput, cursor: 'pointer' }} value={addForm.status} onChange={e => setAddForm(f => ({...f, status: e.target.value}))}>
                    {["טיוטה","ממתין לאישור","מאושר","פורסם"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setAddForm(null)} style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>ביטול</button>
                  <button onClick={submitAdd} disabled={!addForm.title.trim()} style={{ padding: '6px 16px', background: 'var(--accent)', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: addForm.title.trim() ? 1 : 0.4 }}>הוסף</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddForm({...emptyForm})} style={{ width: '100%', marginTop: 12, padding: '10px', border: '2px dashed var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text-muted)', background: 'none', cursor: 'pointer' }}>
                + הוסף תוכן ליום זה
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── LUMA Logo ───────────────────────────────────────────────────────────────
const LumaLogo = ({ showTagline = false }) => (
  <div className="flex flex-col items-start leading-none gap-0.5 select-none">
    <span
      style={{
        fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
        fontWeight: 900,
        fontSize: showTagline ? 28 : 20,
        letterSpacing: '-0.02em',
        color: '#111',
        lineHeight: 1,
      }}
    >
      LUMA
    </span>
    {showTagline && (
      <span
        style={{
          fontFamily: "'Helvetica Neue',Arial,sans-serif",
          fontWeight: 400,
          fontSize: 10,
          letterSpacing: '0.04em',
          color: '#94a3b8',
        }}
      >
        Make Digital Brighter
      </span>
    )}
  </div>
);

// ─── Nav Tabs ────────────────────────────────────────────────────────────────
const UserAvatar = ({ name = "S", size = "md" }) => {
  const initials = name.trim().charAt(0).toUpperCase();
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm ring-2 ring-white flex-shrink-0`}>
      {initials}
    </div>
  );
};

const NAV_ITEMS = [
  { id: "home",     label: "דשבורד",    icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M2 11l8-8 8 8M4 9v8h5v-5h2v5h5V9"/>
    </svg>
  )},
  { id: "tasks",    label: "משימות",    icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
    </svg>
  )},
  { id: "clients",  label: "לקוחות",   icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
    </svg>
  )},
  { id: "calendar", label: "לוח תוכן", icon: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
    </svg>
  )},
];

// Color accent per nav item
const NAV_COLORS = {
  home:     { from: '#6366f1', to: '#8b5cf6', glow: 'rgba(99,102,241,0.4)'  },
  tasks:    { from: '#06b6d4', to: '#3b82f6', glow: 'rgba(59,130,246,0.4)'  },
  clients:  { from: '#10b981', to: '#059669', glow: 'rgba(16,185,129,0.4)'  },
  calendar: { from: '#f59e0b', to: '#ef4444', glow: 'rgba(245,158,11,0.4)'  },
};

const Sidebar = ({ screen, setScreen, user, onSignOut, onOpenAdmin, tasks }) => {
  const isAdmin = user?.role === "admin" || user?.provider === "google";
  const initials = (user?.name || "U").trim().charAt(0).toUpperCase();
  const userName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'משתמש';

  // Badge counts for nav items
  const activeTasks = (tasks || []).filter(t => !t.done);
  const overdueCount = activeTasks.filter(t => t.date && t.date < TODAY).length;
  const highCount = activeTasks.filter(t => t.urgency === 'גבוהה').length;
  const NAV_BADGES = {
    tasks: overdueCount > 0 ? overdueCount : null,
    home: highCount > 0 ? highCount : null,
  };

  return (
    <aside
      dir="rtl"
      style={{
        width: 220,
        minWidth: 220,
        background: 'rgba(13,13,16,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        borderLeft: '1px solid rgba(255,255,255,0.07)',
        paddingBottom: 16,
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: '16px 22px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center',
      }}>
        <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontWeight: 900, fontSize: 24, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1, userSelect: 'none' }}>LUMA</span>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 10px', width: '100%', boxSizing: 'border-box' }}>
        {NAV_ITEMS.map(item => {
          const active = screen === item.id;
          const colors = NAV_COLORS[item.id] || NAV_COLORS.home;
          const badge = NAV_BADGES[item.id];
          return (
            <div key={item.id} style={{ position: 'relative' }}>
              {/* Active indicator bar — left edge facing content */}
              {active && (
                <span style={{
                  position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 28, borderRadius: '3px 0 0 3px',
                  background: `linear-gradient(180deg, ${colors.from}, ${colors.to})`,
                  boxShadow: `0 0 10px ${colors.glow}`,
                }}/>
              )}
              <button
                onClick={() => setScreen(item.id)}
                style={{
                  width: '100%', borderRadius: 10, cursor: 'pointer', border: 'none',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px 10px 18px',
                  transition: 'all 0.15s',
                  background: active
                    ? `linear-gradient(135deg, ${colors.from}22, ${colors.to}18)`
                    : 'transparent',
                  color: active ? 'white' : 'rgba(255,255,255,0.38)',
                  boxShadow: active ? `0 0 20px ${colors.glow}` : 'none',
                  textAlign: 'right',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.72)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.38)';
                  }
                }}
              >
                <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: active ? colors.from : 'inherit' }}>
                  {item.icon}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500, letterSpacing: '0.01em', flex: 1, fontFamily: "'Helvetica Neue',Arial,sans-serif" }}>
                  {item.label}
                </span>
                {badge && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, borderRadius: 99,
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 5px', flexShrink: 0, boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            </div>
          );
        })}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 4px' }} />

        {/* Admin */}
        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            style={{
              width: '100%', borderRadius: 10, cursor: 'pointer', border: 'none',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px 10px 18px',
              background: 'transparent', color: 'rgba(255,255,255,0.25)', transition: 'all 0.15s',
              textAlign: 'right', boxSizing: 'border-box',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
          >
            <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
              </svg>
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>ניהול מערכת</span>
          </button>
        )}
      </nav>

      {/* User section */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 700, fontSize: 14,
              boxShadow: '0 0 0 2px rgba(99,102,241,0.25), 0 0 10px rgba(168,85,247,0.2)',
            }}>
              {initials}
            </div>
            {isAdmin && (
              <span style={{
                position: 'absolute', bottom: -1, right: -1,
                width: 11, height: 11, borderRadius: '50%',
                background: '#6366f1', border: '2px solid #0c1122',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 6, color: 'white', fontWeight: 700,
              }}>★</span>
            )}
          </div>
          {/* Name + role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</p>
            <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', margin: 0 }}>{isAdmin ? 'מנהל' : 'משתמש'}</p>
          </div>
          {/* Sign out */}
          <button
            onClick={onSignOut}
            title="יציאה"
            style={{
              width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: 'rgba(255,255,255,0.18)', transition: 'all 0.15s',
              fontSize: 14,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.18)'; }}
          >↩</button>
        </div>
      </div>
    </aside>
  );
};

// ── Mobile detection hook ────────────────────────────────────────────────────
const useMobile = () => {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
};

// ── Bottom Navigation (mobile) ───────────────────────────────────────────────
const BottomNav = ({ screen, setScreen, user, onSignOut, onOpenAdmin, tasks }) => {
  const isAdmin = user?.role === "admin" || user?.provider === "google";
  const activeTasks = (tasks || []).filter(t => !t.done);
  const overdueCount = activeTasks.filter(t => t.date && t.date < TODAY).length;
  const NAV_BADGES = { tasks: overdueCount > 0 ? overdueCount : null };

  return (
    <nav dir="rtl" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(20,20,24,0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'stretch',
      height: 60,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {NAV_ITEMS.map(item => {
        const active = screen === item.id;
        const colors = NAV_COLORS[item.id] || NAV_COLORS.home;
        const badge = NAV_BADGES[item.id];
        return (
          <button
            key={item.id}
            onClick={() => setScreen(item.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 4, padding: '6px 0', border: 'none',
              background: 'transparent', cursor: 'pointer',
              transition: 'color 0.15s',
              color: active ? colors.from : 'var(--text-muted)',
              position: 'relative',
            }}
          >
            {/* Active pill background */}
            {active && (
              <span style={{
                position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)',
                width: 40, height: 28, borderRadius: 10,
                background: `linear-gradient(135deg, ${colors.from}22, ${colors.to}18)`,
                boxShadow: `0 0 12px ${colors.glow}`,
              }} />
            )}
            {/* Icon + badge */}
            <span style={{ position: 'relative', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              {item.icon}
              {badge && (
                <span style={{
                  position: 'absolute', top: -5, left: -5,
                  fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 99,
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
                }}>
                  {badge}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, letterSpacing: '0.02em', zIndex: 1 }}>{item.label}</span>
          </button>
        );
      })}
      {/* More menu — admin + sign out collapsed into one button */}
      <BottomNavMore isAdmin={isAdmin} onOpenAdmin={onOpenAdmin} onSignOut={onSignOut} />
    </nav>
  );
};

const BottomNavMore = ({ isAdmin, onOpenAdmin, onSignOut }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          padding: '6px 0', border: 'none', background: 'transparent', cursor: 'pointer',
          color: open ? 'var(--accent)' : 'var(--text-muted)', width: '100%',
          transition: 'color 0.15s',
        }}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 20, height: 20 }}>
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z"/>
        </svg>
        <span style={{ fontSize: 10, fontWeight: 400 }}>עוד</span>
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setOpen(false)} />
          {/* Popup */}
          <div style={{
            position: 'absolute', bottom: 68, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 8, minWidth: 140, zIndex: 99,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }} dir="rtl">
            {isAdmin && (
              <button
                onClick={() => { onOpenAdmin(); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 10, border: 'none', background: 'transparent',
                  cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500,
                }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16, flexShrink: 0 }}>
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
                </svg>
                ניהול מערכת
              </button>
            )}
            <button
              onClick={() => { onSignOut(); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10, border: 'none', background: 'transparent',
                cursor: 'pointer', color: 'var(--red)', fontSize: 13, fontWeight: 500,
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ width: 16, height: 16, flexShrink: 0 }}>
                <path d="M13 3h4a1 1 0 011 1v12a1 1 0 01-1 1h-4M9 14l-4-4 4-4M5 10h9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              יציאה
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ── Mobile top header ────────────────────────────────────────────────────────
const SCREEN_LABELS = { home: 'בית', tasks: 'משימות', clients: 'לקוחות', calendar: 'לוח שנה' };

const MobileHeader = ({ screen, user }) => {
  const initials = (user?.name || "U").trim().charAt(0).toUpperCase();
  const colors = NAV_COLORS[screen] || NAV_COLORS.home;
  return (
    <header dir="rtl" style={{
      position: 'sticky', top: 0, zIndex: 90,
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', height: 52,
    }}>
      {/* LUMA logo */}
      <span style={{ fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", fontWeight: 900, fontSize: 18, letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1, userSelect: 'none' }}>LUMA</span>

      {/* Page label */}
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{SCREEN_LABELS[screen] || ''}</span>

      {/* User avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: 'var(--accent-dim)',
        border: '1px solid rgba(124,110,245,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--accent)', fontWeight: 700, fontSize: 12,
      }}>
        {initials}
      </div>
    </header>
  );
};

// ── Layout wrapper ──────────────────────────────────────────────────────────
const Layout = ({ screen, setScreen, user, onSignOut, onOpenAdmin, tasks, children }) => {
  const mobile = useMobile();
  return (
    <div style={{ display: 'flex', flexDirection: 'row-reverse', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <main dir="rtl" style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-base)',
        paddingBottom: mobile ? 56 : 0,
      }}>
        {mobile && <MobileHeader screen={screen} user={user} />}
        {children}
      </main>
      {mobile
        ? <BottomNav screen={screen} setScreen={setScreen} user={user} onSignOut={onSignOut} onOpenAdmin={onOpenAdmin} tasks={tasks} />
        : <Sidebar screen={screen} setScreen={setScreen} user={user} onSignOut={onSignOut} onOpenAdmin={onOpenAdmin} tasks={tasks} />
      }
    </div>
  );
};

// ─── Dashboard / Home Screen ─────────────────────────────────────────────────
// ─── Local AI Pattern Analysis ─────────────────────────────────────────────
const analyzePatterns = (tasks, clientsData) => {
  const insights = [];
  const activeTasks = tasks.filter(t => !t.done);

  // 1. Overdue clients
  const overdueByClient = {};
  activeTasks.filter(t => t.date && t.date < TODAY).forEach(t => {
    overdueByClient[t.client] = (overdueByClient[t.client] || 0) + 1;
  });
  const topOverdue = Object.entries(overdueByClient).sort((a, b) => b[1] - a[1])[0];
  if (topOverdue) {
    insights.push({ icon: '⚠️', color: 'orange', text: `${topOverdue[0]} — ${topOverdue[1]} משימ${topOverdue[1] > 1 ? 'ות' : 'ה'} באיחור. כדאי לטפל בהקדם` });
  }

  // 2. Waiting for approval too long (>5 days past due)
  const waitingOld = activeTasks.filter(t =>
    t.status === 'ממתין לאישור' && t.date && (new Date(TODAY) - new Date(t.date)) > 5 * 86400000
  );
  if (waitingOld.length > 0) {
    insights.push({ icon: '🕐', color: 'yellow', text: `${waitingOld.length} משימ${waitingOld.length > 1 ? 'ות' : 'ה'} ממתינ${waitingOld.length > 1 ? 'ות' : 'ה'} לאישור מעל 5 ימים — שווה לפנות ללקוח` });
  }

  // 3. Busiest client this week
  const weekEnd = new Date(TODAY);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);
  const thisWeekByClient = {};
  activeTasks.filter(t => t.date >= TODAY && t.date <= weekEndStr).forEach(t => {
    thisWeekByClient[t.client] = (thisWeekByClient[t.client] || 0) + 1;
  });
  const busiest = Object.entries(thisWeekByClient).sort((a, b) => b[1] - a[1])[0];
  if (busiest && busiest[1] >= 2) {
    insights.push({ icon: '📊', color: 'blue', text: `${busiest[0]} — ${busiest[1]} משימות השבוע. ${busiest[1] >= 3 ? 'עומס גבוה — תכנן בהתאם' : 'שמור על קצב'}` });
  }

  // 4. Recurring task text pattern
  const textCounts = {};
  activeTasks.forEach(t => { if (t.task) textCounts[t.task.trim()] = (textCounts[t.task.trim()] || 0) + 1; });
  const recurring = Object.entries(textCounts).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1])[0];
  if (recurring) {
    insights.push({ icon: '🔁', color: 'purple', text: `"${recurring[0]}" מופיעה ${recurring[1]} פעמים — שקול ליצור תבנית משימה קבועה`, recurringTaskName: recurring[0] });
  }

  // 5. Client with high social load
  const socialByClient = {};
  activeTasks.filter(t => t.platform === 'סושיאל').forEach(t => {
    socialByClient[t.client] = (socialByClient[t.client] || 0) + 1;
  });
  const topSocial = Object.entries(socialByClient).sort((a, b) => b[1] - a[1])[0];
  if (topSocial && topSocial[1] >= 2) {
    insights.push({ icon: '📱', color: 'indigo', text: `${topSocial[0]} — ${topSocial[1]} משימות סושיאל. שקול לוח תוכן חודשי קבוע` });
  }

  // 6. All clear
  if (insights.length === 0 && activeTasks.length > 0) {
    insights.push({ icon: '✅', color: 'green', text: 'כל המשימות מאורגנות ובמסלול — עבודה טובה!' });
  }

  return insights.slice(0, 4);
};

const AI_COLORS = {
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  blue:   'bg-blue-50 border-blue-200 text-blue-800',
  purple: 'bg-purple-50 border-purple-200 text-purple-800',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  green:  'bg-green-50 border-green-200 text-green-800',
  gray:   'bg-gray-50 border-gray-200 text-gray-600',
};

const AIInsightsPanel = ({ tasks, clientsData, onCreateTemplate }) => {
  const insights = analyzePatterns(tasks, clientsData);
  const [created, setCreated] = useState({});
  if (insights.length === 0) return null;
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">תובנות AI 🤖</p>
      <div className="flex flex-col gap-2">
        {insights.map((ins, i) => (
          <div key={i} className={`flex items-start gap-2 text-sm px-3 py-2 rounded-xl border ${AI_COLORS[ins.color] || AI_COLORS.gray}`}>
            <span className="flex-shrink-0 mt-0.5">{ins.icon}</span>
            <span className="flex-1">{ins.text}</span>
            {ins.recurringTaskName && onCreateTemplate && (
              created[i] ? (
                <span className="text-xs text-green-600 flex-shrink-0 font-medium">✓ נשמר</span>
              ) : (
                <button
                  onClick={async () => {
                    const ok = await onCreateTemplate({ name: ins.recurringTaskName, task: ins.recurringTaskName, platform: 'כללי', urgency: 'בינונית', status: 'לביצוע', notes: '' });
                    if (ok !== false) setCreated(p => ({ ...p, [i]: true }));
                  }}
                  className="text-xs text-purple-600 hover:text-purple-800 flex-shrink-0 font-medium whitespace-nowrap border border-purple-200 bg-white rounded-full px-2 py-0.5 hover:bg-purple-50 transition-colors"
                >
                  💾 צור תבנית
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Claude AI Chat ─────────────────────────────────────────────────────────
const ClaudeChat = ({ tasks, clientsData, isOpen, onClose, onOpen, isMobile }) => {
  const [apiKey, setApiKey] = useState('');
  const [keyEntered, setKeyEntered] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const systemPrompt = `אתה עוזר AI חכם למנהל שיווק דיגיטלי ישראלי.
היום: ${TODAY}

משימות פעילות:
${JSON.stringify(tasks.filter(t => !t.done), null, 2)}

לקוחות:
${JSON.stringify(Object.entries(clientsData).map(([name, d]) => ({ name, ...d })), null, 2)}

ענה תמיד בעברית. היה ממוקד ומעשי. זהה דפוסים ותן המלצות קונקרטיות.`;

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: systemPrompt,
          messages: newMessages,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || `שגיאה ${res.status}`);
      }
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.content[0].text }]);
    } catch (e) {
      setError(`שגיאה: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const QUICK_QUESTIONS = ['מה כדאי לעשות ראשון?', 'מי הלקוח הכי עמוס?', 'מה המגמות שאתה רואה?'];

  const chatBottom = isMobile ? 76 : 24;

  if (!isOpen) {
    return (
      <button
        onClick={onOpen}
        style={{ position: 'fixed', bottom: chatBottom, left: 24, zIndex: 50, background: 'var(--accent)', color: 'white', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', fontSize: 22, boxShadow: '0 4px 20px rgba(124,110,245,0.4)' }}
        title="שאל קלוד AI"
      >
        🤖
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', bottom: chatBottom, left: 16, zIndex: 50, width: isMobile ? 'calc(100vw - 32px)' : 320, maxHeight: isMobile ? '70vh' : 520, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }} dir="rtl">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--accent)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'white' }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>קלוד AI — עוזר שיווק</span>
        </div>
        <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.8)', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
      </div>

      {!keyEntered ? (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>הכנס מפתח API של Anthropic כדי לשוחח עם קלוד על המשימות שלך:</p>
          <input
            type="password"
            style={{ ...fieldInput, fontFamily: 'monospace' }}
            placeholder="sk-ant-api03-..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && apiKey.startsWith('sk-') && setKeyEntered(true)}
          />
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>המפתח נשמר בזיכרון הסשן בלבד ולא מועבר לשום מקום אחר</p>
          <button
            onClick={() => setKeyEntered(true)}
            disabled={!apiKey.startsWith('sk-')}
            style={{ padding: '8px', background: 'var(--accent)', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: apiKey.startsWith('sk-') ? 1 : 0.4 }}
          >
            התחל שיחה
          </button>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, maxHeight: 320 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 28 }}>💡</div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>שאל אותי על המשימות, הלקוחות, או תכנון השבוע</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, width: '100%' }}>
                  {QUICK_QUESTIONS.map(q => (
                    <button key={q} onClick={() => setInput(q)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right' }}>▶ {q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ fontSize: 13, padding: '8px 12px', borderRadius: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5, maxWidth: '92%',
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                color: m.role === 'user' ? 'white' : 'var(--text-primary)',
                alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end' }}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div style={{ fontSize: 11, padding: '8px 12px', borderRadius: 12, background: 'var(--bg-elevated)', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>⏳ קלוד חושב...</div>
            )}
            {error && <div style={{ fontSize: 11, padding: '6px 8px', background: 'rgba(239,68,68,0.1)', color: 'var(--red)', borderRadius: 8 }}>{error}</div>}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: 8, display: 'flex', gap: 8, flexShrink: 0 }}>
            <input
              style={{ ...fieldInput, flex: 1, borderRadius: 99, padding: '6px 14px' }}
              placeholder="שאל שאלה..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              style={{ background: 'var(--accent)', color: 'white', borderRadius: '50%', width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0, opacity: (loading || !input.trim()) ? 0.4 : 1 }}
            >
              ➤
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
const HomeScreen = ({ tasks, clientsData, onGoToTasks, onGoToClients, onSelectClient, onAddTask, user, onNavigateWithFilter, onTaskClick, onCreateTemplate }) => {
  const mobile = useMobile();
  const activeTasks = tasks.filter(t => !t.done);
  const doneTasks   = tasks.filter(t => t.done);
  const clients     = Object.keys(clientsData);

  const weekEnd = new Date(TODAY);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const todayTasks   = activeTasks.filter(t => t.date === TODAY);
  const thisWeek     = activeTasks.filter(t => t.date > TODAY && t.date <= weekEndStr);
  const overdue      = activeTasks.filter(t => t.date < TODAY);
  const highUrgency  = activeTasks.filter(t => t.urgency === 'גבוהה');
  const waiting      = activeTasks.filter(t => t.status === 'ממתין לאישור');
  const clientLoad = clients
    .map(name => ({
      name,
      count: activeTasks.filter(t => t.client === name).length,
      urgent: activeTasks.filter(t => t.client === name && t.urgency === 'גבוהה').length,
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const upcoming = [...activeTasks]
    .filter(t => t.date >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  const todayDate = new Date();
  const dayName = dayNames[todayDate.getDay()];
  const [d, m, y] = [todayDate.getDate(), todayDate.getMonth() + 1, todayDate.getFullYear()];

  const doneRate = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0;

  const KpiCard = ({ label, value, sub, gradient, glow, icon, onClick }) => (
    <div
      onClick={onClick}
      style={{
        background: gradient || 'var(--bg-surface)',
        borderRadius: 12,
        padding: mobile ? '14px 16px' : '18px 20px',
        border: '1px solid var(--border)',
        position: 'relative', overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = (gradient || 'var(--bg-hover)'); }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.background = (gradient || 'var(--bg-surface)'); }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: mobile ? 10 : 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
          <p style={{ fontSize: mobile ? 28 : 34, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-1px' }}>{value}</p>
          {sub && !mobile && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{sub}</p>}
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'var(--bg-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
        }}>{icon}</div>
      </div>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100%' }} dir="rtl">

      {/* Hero Header */}
      <div style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        padding: mobile ? '20px 18px 24px' : '28px 36px 32px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* decorative blobs */}
        <div style={{ position:'absolute',top:-40,right:-40,width:180,height:180,borderRadius:'50%',background:'radial-gradient(circle,rgba(124,110,245,0.12) 0%,transparent 70%)',pointerEvents:'none' }}/>
        <div style={{ position:'absolute',bottom:-50,left:60,width:220,height:220,borderRadius:'50%',background:'radial-gradient(circle,rgba(124,110,245,0.07) 0%,transparent 70%)',pointerEvents:'none' }}/>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',position:'relative' }}>
          <div>
            <p style={{ fontSize: mobile ? 12 : 13, color:'var(--text-muted)', margin:'0 0 4px', letterSpacing:'0.04em' }}>יום {dayName} · {d}/{m}/{y}</p>
            <h1 style={{ fontSize: mobile ? 22 : 28, fontWeight: 900, color:'var(--text-primary)', margin: 0, letterSpacing:'-0.5px' }}>
              שלום, {user?.name?.split(' ')[0] || 'Slav'} 👋
            </h1>
            <p style={{ fontSize: mobile ? 12 : 13, color:'var(--text-muted)', marginTop: 6 }}>
              {activeTasks.length} משימות פתוחות · {overdue.length > 0 ? <span style={{color:'var(--red)'}}>⚠ {overdue.length} באיחור</span> : <span style={{color:'var(--green)'}}>✓ הכל בזמן</span>}
            </p>
          </div>
          <button onClick={onAddTask} style={{
            display:'flex',alignItems:'center',gap:8,
            padding: mobile ? '10px 16px' : '12px 22px',
            background:'var(--accent)',
            color:'white',borderRadius:10,border:'none',cursor:'pointer',
            fontSize: mobile ? 13 : 14,fontWeight:700,
            flexShrink:0,
          }}>
            <span style={{fontSize:18,lineHeight:1}}>+</span>
            {!mobile && 'משימה חדשה'}
          </button>
        </div>
      </div>

      <div style={{ padding: mobile ? '16px 14px' : '24px 32px' }}>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: mobile ? 10 : 14, marginBottom: mobile ? 14 : 24 }}>
        <KpiCard label="משימות פתוחות" value={activeTasks.length} sub={`${overdue.length} באיחור`} gradient="linear-gradient(135deg,rgba(124,110,245,0.25) 0%,rgba(124,110,245,0.1) 100%)" glow="rgba(124,110,245,0.15)" icon="📋" onClick={onNavigateWithFilter ? () => onNavigateWithFilter(null) : undefined} />
        <KpiCard label="דחוף ומיידי" value={highUrgency.length} sub="דורש טיפול עכשיו" gradient="linear-gradient(135deg,rgba(239,68,68,0.25) 0%,rgba(239,68,68,0.1) 100%)" glow="rgba(239,68,68,0.15)" icon="⚡" onClick={onNavigateWithFilter ? () => onNavigateWithFilter({ type: 'urgency', value: 'גבוהה' }) : undefined} />
        <KpiCard label="ממתין לאישור" value={waiting.length} sub="לקוחות ממתינים" gradient="linear-gradient(135deg,rgba(245,158,11,0.25) 0%,rgba(245,158,11,0.1) 100%)" glow="rgba(245,158,11,0.15)" icon="⏳" onClick={onNavigateWithFilter ? () => onNavigateWithFilter({ type: 'status', value: 'ממתין לאישור' }) : undefined} />
        <KpiCard label="פולו-אפ ממתין" value={activeTasks.filter(t => t.follow_up_date && t.follow_up_date <= TODAY).length} sub={`${activeTasks.filter(t => t.follow_up_date === TODAY).length} להיום`} gradient="linear-gradient(135deg,rgba(34,197,94,0.25) 0%,rgba(34,197,94,0.1) 100%)" glow="rgba(34,197,94,0.15)" icon="🔔" onClick={onNavigateWithFilter ? () => onNavigateWithFilter({ type: 'followup', value: true }) : undefined} />
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: mobile ? '12px 16px' : '16px 20px', border: '1px solid var(--border)', marginBottom: mobile ? 14 : 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>התקדמות כוללת</span>
            <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{doneRate}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${doneRate}%`, background: 'var(--accent)', borderRadius: 99, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            {[
              { label: 'לביצוע', count: activeTasks.filter(t=>t.status==='לביצוע').length, color: 'var(--text-muted)' },
              { label: 'בביצוע', count: activeTasks.filter(t=>t.status==='בביצוע').length, color: 'var(--accent)' },
              { label: 'ממתין', count: waiting.length, color: '#f59e0b' },
              { label: 'בוצע', count: doneTasks.length, color: 'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, display: 'inline-block' }}></span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label} <strong style={{ color: 'var(--text-secondary)' }}>{s.count}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2-col grid: urgent + upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: mobile ? 12 : 18, marginBottom: mobile ? 12 : 18 }}>

        {/* Urgent tasks */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🔥 דחוף ומיידי</h3>
            <button onClick={onGoToTasks} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>כל המשימות ←</button>
          </div>
          {[...todayTasks, ...highUrgency.filter(t => !todayTasks.includes(t))].slice(0, 5).length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '24px 0', fontStyle: 'italic' }}>אין משימות דחופות 🎉</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {[...todayTasks, ...highUrgency.filter(t => !todayTasks.includes(t))].slice(0, 5).map(task => (
                <li key={task.id} onClick={() => onTaskClick && onTaskClick(task)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', gap: 12, cursor: 'pointer', transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.task}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{task.client} · {task.platform}</p>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: task.urgency === 'גבוהה' ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.15)', color: task.urgency === 'גבוהה' ? 'var(--red)' : '#f97316', fontWeight: 600, flexShrink: 0 }}>{task.urgency}</span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
            <button onClick={onAddTask} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ הוסף משימה</button>
          </div>
        </div>

        {/* Upcoming deadlines */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📅 דדליינים קרובים</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>7 ימים קדימה</span>
          </div>
          {upcoming.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '24px 0', fontStyle: 'italic' }}>אין דדליינים קרובים</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {upcoming.map(task => {
                const daysLeft = Math.ceil((new Date(task.date) - new Date(TODAY)) / 86400000);
                const chip = daysLeft === 0 ? { bg: 'var(--accent-dim)', c: 'var(--accent)', t: 'היום' } : daysLeft === 1 ? { bg: 'rgba(239,68,68,0.15)', c: 'var(--red)', t: 'מחר' } : daysLeft <= 3 ? { bg: 'rgba(249,115,22,0.15)', c: '#f97316', t: `${daysLeft} ימים` } : { bg: 'var(--bg-elevated)', c: 'var(--text-secondary)', t: `${daysLeft} ימים` };
                return (
                  <li key={task.id} onClick={() => onTaskClick && onTaskClick(task)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', gap: 12, cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.task}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{task.client}</p>
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: chip.bg, color: chip.c, fontWeight: 700, flexShrink: 0 }}>{chip.t}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Follow-up today banner */}
      {(() => {
        const followUps = activeTasks.filter(t => t.follow_up_date === TODAY);
        if (followUps.length === 0) return null;
        return (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '14px 20px', marginBottom: mobile ? 12 : 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', margin: 0 }}>פולו-אפ להיום — {followUps.length} משימ{followUps.length > 1 ? 'ות' : 'ה'}</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {followUps.map(task => (
                <div key={task.id} onClick={() => onTaskClick && onTaskClick(task)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', gap: 10, transition: 'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.task}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{task.client} · {task.platform}</p>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>{task.status}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 2-col: client load + AI insights */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: mobile ? 12 : 18 }}>

        {/* Client workload */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>👥 עומס לפי לקוח</h3>
            <button onClick={onGoToClients} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>כל הלקוחות ←</button>
          </div>
          {clientLoad.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '24px 0', fontStyle: 'italic' }}>אין משימות פעילות</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {clientLoad.map(({ name, count, urgent }) => {
                const pct = Math.round((count / clientLoad[0].count) * 100);
                return (
                  <li key={name} style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
                  onClick={() => onSelectClient(name)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {urgent > 0 && <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>⚡ {urgent}</span>}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{count} משימות</span>
                      </div>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: urgent > 0 ? 'var(--red)' : 'var(--accent)', borderRadius: 99 }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <AIInsightsPanel tasks={tasks} clientsData={clientsData} onCreateTemplate={onCreateTemplate} />

      </div>
      </div>
    </div>
  );
};

// ─── New Client Modal (shared) ────────────────────────────────────────────────
const NewClientModal = ({ newClientForm, setNewClientForm, emptyClientForm, onClose, onAdd }) => {
  const inputStyle = {
    width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block', fontWeight: 600 };
  return (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
    <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, width: '100%', maxWidth: 440 }} dir="rtl" onClick={e => e.stopPropagation()}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>➕ הקמת לקוח חדש</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>שם הלקוח <span style={{ color: 'var(--red)' }}>*</span></label>
          <input style={inputStyle} placeholder="שם הלקוח" value={newClientForm.name} onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} autoFocus />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>📞 טלפון</label>
            <input style={inputStyle} placeholder="05X-XXXXXXX" value={newClientForm.phone} onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>✉️ דוא"ל</label>
            <input type="email" style={inputStyle} placeholder="email@example.com" value={newClientForm.email} onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>🌐 אתר</label>
          <input style={inputStyle} placeholder="www.example.com" value={newClientForm.website} onChange={e => setNewClientForm(f => ({ ...f, website: e.target.value }))} />
        </div>
        {/* Financial fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>💼 סוג התקשרות</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={newClientForm.type || ''} onChange={e => setNewClientForm(f => ({ ...f, type: e.target.value }))}>
              <option value="">בחר...</option>
              <option value="ריטיינר">ריטיינר</option>
              <option value="חד״פ">חד״פ</option>
              <option value="פרויקט">פרויקט</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>₪ סכום</label>
            <input style={inputStyle} placeholder="4,500" value={newClientForm.amount || ''} onChange={e => setNewClientForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>📄 חוזה</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={newClientForm.contract || ''} onChange={e => setNewClientForm(f => ({ ...f, contract: e.target.value }))}>
              <option value="">בחר...</option>
              <option value="חתום">חתום ✓</option>
              <option value="ממתין">ממתין ⏳</option>
              <option value="אין">ללא חוזה</option>
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>📝 הערות</label>
          <textarea style={{ ...inputStyle, resize: 'none' }} rows={2} placeholder="פרטים נוספים על הלקוח..." value={newClientForm.notes} onChange={e => setNewClientForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>ביטול</button>
        <button onClick={onAdd} disabled={!newClientForm.name.trim()} style={{ padding: '8px 20px', background: 'var(--accent)', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: newClientForm.name.trim() ? 1 : 0.4 }}>הוסף לקוח</button>
      </div>
    </div>
  </div>
  );
};

// ─── Clients List Screen ─────────────────────────────────────────────────────
const ClientsListScreen = ({ clientsData, tasks, onSelectClient, onAddClient }) => {
  const clients = Object.keys(clientsData);

  return (
    <div className="p-6 min-h-screen" style={{ background: '#f5f6fa' }} dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{ color: '#0f172a' }}>רשימת לקוחות</h2>
        <button
          onClick={onAddClient}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
        >
          <span className="text-lg leading-none">+</span> לקוח חדש
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="text-center text-gray-400 mt-20 text-sm">אין לקוחות עדיין</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map(name => {
            const data = clientsData[name];
            const clientTasks = tasks.filter(t => t.client === name && !t.done);
            const activePlatforms = [...new Set(tasks.filter(t => t.client === name).map(t => t.platform))];
            const highUrgency = clientTasks.filter(t => t.urgency === 'גבוהה').length;
            const waiting = clientTasks.filter(t => t.status === 'ממתין לאישור').length;

            return (
              <div
                key={name}
                onClick={() => onSelectClient(name)}
                style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>
                    {name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, marginBottom: 4 }}>{name}</h3>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {activePlatforms.slice(0, 3).map(p => (
                        <span key={p} style={{ fontSize: 13 }}>{PLATFORM_ICONS[p]}</span>
                      ))}
                      {activePlatforms.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>אין פלטפורמות</span>}
                    </div>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>←</span>
                </div>

                {/* Contact info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {data.phone && <span>📞 {data.phone}</span>}
                  {data.email && <span>✉️ {data.email}</span>}
                  {data.website && <span>🌐 {data.website}</span>}
                  {!data.phone && !data.email && !data.website && (
                    <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>אין פרטי קשר</span>
                  )}
                </div>

                {/* Financial chips */}
                {(data.type || data.amount || data.contract) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {data.type && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700 }}>{data.type}</span>}
                    {data.amount && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontWeight: 700 }}>₪{data.amount}</span>}
                    {data.contract === 'חתום' && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontWeight: 700 }}>✓ חתום</span>}
                    {data.contract === 'ממתין' && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700 }}>⏳ ממתין</span>}
                    {data.contract === 'אין' && <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(139,139,153,0.15)', color: 'var(--text-muted)', fontWeight: 700 }}>ללא חוזה</span>}
                  </div>
                )}

                {/* Notes preview */}
                {data.notes && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 12, borderRight: '2px solid var(--border)', paddingRight: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {data.notes}
                  </p>
                )}

                {/* Stats chips */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700 }}>
                    {clientTasks.length} משימות פתוחות
                  </span>
                  {highUrgency > 0 && (
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 700 }}>
                      {highUrgency} דחוף
                    </span>
                  )}
                  {waiting > 0 && (
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700 }}>
                      {waiting} ממתין לאישור
                    </span>
                  )}
                  {clientTasks.length === 0 && (
                    <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontWeight: 700 }}>✓ נקי</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Client Brief Tab ────────────────────────────────────────────────────────
const ClientBriefTab = ({ brief = {}, onSave }) => {
  const [form, setForm] = useState({
    contact_person: '', business_description: '', main_product: '', ad_goal: '',
    advertised_before: null, what_worked: '',
    has_meta_account: null, has_google_account: null, has_tracking: null,
    website_link: '', facebook_link: '', instagram_link: '',
    has_materials: null, has_mailing_list: null,
    has_logo: null, has_brand_guide: null, brand_3_words: '', differentiator: '',
    target_audience: '', ideal_customer: '', customer_problem: '', why_choose_us: '',
    references: '', what_liked: '',
    lead_process: '', lead_response_time: '', lead_handler: '', closing_rate: '',
    monthly_budget: '', expectations: '',
    additional_notes: '',
    ...brief,
  });
  const [saved, setSaved] = useState(false);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };
  const handleSave = () => { onSave(form); setSaved(true); setTimeout(() => setSaved(false), 2500); };

  const sectionsFilled = [
    form.contact_person || form.business_description || form.main_product || form.ad_goal,
    form.advertised_before !== null || form.what_worked,
    form.website_link || form.facebook_link || form.instagram_link,
    form.has_logo !== null || form.brand_3_words || form.differentiator,
    form.target_audience || form.ideal_customer || form.customer_problem,
    form.references || form.what_liked,
    form.lead_process || form.lead_response_time,
    form.monthly_budget || form.expectations,
    form.additional_notes,
  ].filter(Boolean).length;

  const Sec = ({ title, icon, children }) => (
    <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{icon}</span> {title}
      </p>
      {children}
    </div>
  );
  const Lbl = ({ children }) => <label style={{ fontSize: 12, color: '#64748b', marginBottom: 4, display: 'block', fontWeight: 500 }}>{children}</label>;
  const Inp = ({ field, placeholder }) => (
    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
      placeholder={placeholder} value={form[field] || ''} onChange={e => set(field, e.target.value)} />
  );
  const Txt = ({ field, placeholder, rows = 3 }) => (
    <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
      rows={rows} placeholder={placeholder} value={form[field] || ''} onChange={e => set(field, e.target.value)} />
  );
  const YesNo = ({ field }) => (
    <div style={{ display: 'flex', gap: 8 }}>
      {[[true, 'כן', '#10b981', '#ecfdf5', '#059669'], [false, 'לא', '#f43f5e', '#fff1f2', '#e11d48']].map(([boolVal, label, borderC, bgC, textC]) => (
        <button key={String(boolVal)} onClick={() => set(field, form[field] === boolVal ? null : boolVal)}
          style={{
            padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1.5px solid ${form[field] === boolVal ? borderC : '#e2e8f0'}`,
            background: form[field] === boolVal ? bgC : 'white',
            color: form[field] === boolVal ? textC : '#94a3b8',
          }}>{label}</button>
      ))}
    </div>
  );

  return (
    <div style={{ paddingTop: 18 }}>
      {/* Completion bar */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', border: '1px solid #f1f5f9', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(sectionsFilled / 9) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)', borderRadius: 99, transition: 'width 0.3s' }} />
        </div>
        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', fontWeight: 600 }}>{sectionsFilled}/9 סעיפים</span>
      </div>

      {/* 1 — פרטי העסק */}
      <Sec title="פרטי העסק" icon="🏢">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Lbl>איש קשר</Lbl><Inp field="contact_person" placeholder="שם + תפקיד" /></div>
          <div><Lbl>מה מוכרים?</Lbl><Inp field="business_description" placeholder="תיאור קצר של העסק" /></div>
          <div><Lbl>מוצר / שירות עיקרי</Lbl><Inp field="main_product" placeholder="למה מפרסמים?" /></div>
          <div>
            <Lbl>מטרת הפרסום</Lbl>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.ad_goal || ''} onChange={e => set('ad_goal', e.target.value)}>
              <option value="">בחר מטרה</option>
              {['לידים', 'מכירות', 'תנועה לאתר', 'מודעות מותג', 'אחר'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
      </Sec>

      {/* 2 — מצב קיים */}
      <Sec title="מצב קיים" icon="📊">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <Lbl>פרסם בעבר?</Lbl>
            <YesNo field="advertised_before" />
          </div>
          {form.advertised_before && (
            <div><Lbl>מה עבד?</Lbl><Inp field="what_worked" placeholder="קמפיינים, פורמטים, ערוצים..." /></div>
          )}
          <div><Lbl>יש חשבון Meta Business?</Lbl><YesNo field="has_meta_account" /></div>
          <div><Lbl>יש חשבון Google Ads?</Lbl><YesNo field="has_google_account" /></div>
          <div><Lbl>יש Pixel / GTM / המרות?</Lbl><YesNo field="has_tracking" /></div>
        </div>
      </Sec>

      {/* 3 — נכסים ותשתיות */}
      <Sec title="נכסים ותשתיות" icon="🔗">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div><Lbl>אתר</Lbl><Inp field="website_link" placeholder="https://..." /></div>
          <div><Lbl>עמוד פייסבוק</Lbl><Inp field="facebook_link" placeholder="https://facebook.com/..." /></div>
          <div><Lbl>פרופיל אינסטגרם</Lbl><Inp field="instagram_link" placeholder="https://instagram.com/..." /></div>
        </div>
        <div style={{ display: 'flex', gap: 32 }}>
          <div><Lbl>יש חומרי גלם? (תמונות, סרטונים)</Lbl><YesNo field="has_materials" /></div>
          <div><Lbl>יש רשימת תפוצה?</Lbl><YesNo field="has_mailing_list" /></div>
        </div>
      </Sec>

      {/* 4 — מיתוג ושפה */}
      <Sec title="מיתוג ושפה" icon="🎨">
        <div style={{ display: 'flex', gap: 32, marginBottom: 14 }}>
          <div><Lbl>יש לוגו?</Lbl><YesNo field="has_logo" /></div>
          <div><Lbl>יש ברנד בוק / מדריך מיתוג?</Lbl><YesNo field="has_brand_guide" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Lbl>3 מילים שמתארות את המותג</Lbl><Inp field="brand_3_words" placeholder="לדוגמה: מקצועי, חם, מודרני" /></div>
          <div><Lbl>מה מייחד אתכם מהמתחרים?</Lbl><Inp field="differentiator" placeholder="ה-USP שלכם..." /></div>
        </div>
      </Sec>

      {/* 5 — קהל יעד */}
      <Sec title="קהל יעד" icon="🎯">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Lbl>קהל יעד כללי</Lbl><Inp field="target_audience" placeholder="גיל, מגדר, תחומי עניין, גיאוגרפיה..." /></div>
          <div><Lbl>הלקוח האידיאלי (פרסונה)</Lbl><Inp field="ideal_customer" placeholder="מי הלקוח שהכי כדאי לכם?" /></div>
          <div><Lbl>מה הבעיה שהלקוח פותר?</Lbl><Inp field="customer_problem" placeholder="כאב / צורך..." /></div>
          <div><Lbl>למה לקנות דווקא מכם?</Lbl><Inp field="why_choose_us" placeholder="הסיבה שהם יבחרו בכם..." /></div>
        </div>
      </Sec>

      {/* 6 — השראה ורפרנסים */}
      <Sec title="השראה ורפרנסים" icon="✨">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><Lbl>דוגמאות שאהבת (פרסומות, עמודים, גרפיקה)</Lbl><Txt field="references" placeholder="לינקים, שמות מותגים, תיאור..." /></div>
          <div><Lbl>מה אהבת בהן?</Lbl><Txt field="what_liked" placeholder="סגנון, טון, צבעוניות, מסר..." rows={2} /></div>
        </div>
      </Sec>

      {/* 7 — תהליך לידים ומכירה */}
      <Sec title="תהליך לידים ומכירה" icon="🔄">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Lbl>מה קורה אחרי שמגיע ליד?</Lbl><Txt field="lead_process" placeholder="תהליך המכירה..." rows={2} /></div>
          <div>
            <div style={{ marginBottom: 12 }}><Lbl>זמן מענה ללידים</Lbl><Inp field="lead_response_time" placeholder="לדוגמה: עד שעה" /></div>
            <div><Lbl>מי מטפל בלידים?</Lbl><Inp field="lead_handler" placeholder="שם / תפקיד" /></div>
          </div>
          <div><Lbl>אחוז סגירה משוער</Lbl><Inp field="closing_rate" placeholder="לדוגמה: 20%" /></div>
        </div>
      </Sec>

      {/* 8 — תקציב וציפיות */}
      <Sec title="תקציב וציפיות" icon="💰">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><Lbl>תקציב חודשי לפרסום (₪)</Lbl><Inp field="monthly_budget" placeholder="לדוגמה: 5,000" /></div>
          <div><Lbl>ציפיות / יעדים</Lbl><Inp field="expectations" placeholder="כמה לידים? ROI מצופה?" /></div>
        </div>
      </Sec>

      {/* 9 — דגשים נוספים */}
      <Sec title="דגשים נוספים" icon="📌">
        <Txt field="additional_notes" placeholder="כל מה שחשוב לדעת שלא נכלל למעלה..." rows={3} />
      </Sec>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4, paddingBottom: 8 }}>
        <button onClick={handleSave} style={{
          padding: '9px 22px', borderRadius: 99, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
          background: saved ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#6366f1,#a855f7)',
          color: 'white',
          boxShadow: saved ? '0 4px 14px rgba(16,185,129,0.3)' : '0 4px 14px rgba(99,102,241,0.3)',
          transition: 'all 0.2s',
        }}>
          {saved ? '✓ נשמר' : 'שמור אפיון'}
        </button>
      </div>
    </div>
  );
};

// ─── Client Detail Screen ────────────────────────────────────────────────────
const ClientScreen = ({ clientName, clientData, tasks, onBack, onAddTask, onToggleDone, onSaveClientData, onTaskClick }) => {
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: clientName, type: '', amount: '', contract: '', ...clientData });
  const [activeTab, setActiveTab] = useState('details');

  const handleBriefSave = (briefData) => {
    onSaveClientData(clientName, clientName, { ...clientData, brief: briefData });
  };

  const allClientTasks = tasks.filter(t => t.client === clientName);
  const activeTasks = allClientTasks.filter(t => !t.done);
  const doneTasks = allClientTasks.filter(t => t.done);
  const overdue = activeTasks.filter(t => t.date < TODAY);
  const activePlatforms = [...new Set(allClientTasks.map(t => t.platform))];

  const COL_HEADERS = ["", "משימה", "פלטפורמה", "דחיפות", "סטטוס", "תאריך יעד"];

  const handleSave = () => {
    const { name: newName, ...rest } = editForm;
    onSaveClientData(clientName, newName.trim() || clientName, rest);
    setEditMode(false);
  };

  const data = editMode ? editForm : clientData;

  return (
    <div style={{ padding: 24, minHeight: '100vh', background: 'var(--bg-base)' }} dir="rtl">
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 24, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: 18 }}>→</span> חזרה לכל המשימות
      </button>

      {/* Client header card */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
              {(editMode ? editForm.name : clientName).charAt(0)}
            </div>
            <div>
              {editMode ? (
                <input
                  style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)', background: 'transparent', outline: 'none', width: '100%', marginBottom: 4 }}
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="שם הלקוח"
                />
              ) : (
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{clientName}</h2>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {activePlatforms.map(p => (
                  <span key={p} style={{ fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 99, border: '1px solid var(--border)' }}>
                    {PLATFORM_ICONS[p] || "📋"} {p}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Edit / Save buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {editMode ? (
              <>
                <button onClick={() => { setEditMode(false); setEditForm({ ...clientData }); }} style={{ padding: '7px 16px', fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)', cursor: 'pointer' }}>ביטול</button>
                <button onClick={handleSave} style={{ padding: '7px 16px', fontSize: 13, background: 'var(--accent)', color: 'white', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700 }}>שמור</button>
              </>
            ) : (
              <button onClick={() => setEditMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', fontSize: 13, color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-elevated)', cursor: 'pointer' }}>
                ✏️ עריכת פרטים
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 20, borderBottom: '1px solid var(--border)' }}>
          {[['details', '📋 פרטים'], ['brief', '📝 אפיון']].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '8px 18px', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Tab: פרטים */}
        {activeTab === 'details' && (
          <>
            {/* Contact fields */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { icon: "📞", label: "טלפון", key: "phone" },
                { icon: "✉️", label: 'דוא"ל', key: "email" },
                { icon: "🌐", label: "אתר", key: "website" },
              ].map(({ icon, label, key }) => (
                <div key={key}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{icon} {label}</p>
                  {editMode ? (
                    <input
                      style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                      value={editForm[key]}
                      onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={`הזן ${label}`}
                    />
                  ) : (
                    <p style={{ fontSize: 13, color: data[key] ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: data[key] ? 'normal' : 'italic' }}>{data[key] || "לא הוזן"}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Financial fields */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>💼 סוג התקשרות</p>
                {editMode ? (
                  <select style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }} value={editForm.type || ''} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="">בחר...</option>
                    <option value="ריטיינר">ריטיינר</option>
                    <option value="חד״פ">חד״פ</option>
                    <option value="פרויקט">פרויקט</option>
                  </select>
                ) : (
                  <p style={{ fontSize: 13, color: data.type ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: data.type ? 'normal' : 'italic' }}>{data.type || "לא הוזן"}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>₪ סכום</p>
                {editMode ? (
                  <input style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }} placeholder="למשל: 4,500" value={editForm.amount || ''} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
                ) : (
                  <p style={{ fontSize: 13, color: data.amount ? 'var(--green)' : 'var(--text-muted)', fontStyle: data.amount ? 'normal' : 'italic', fontWeight: data.amount ? 700 : 400 }}>{data.amount ? `₪${data.amount}` : "לא הוזן"}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>📄 חוזה</p>
                {editMode ? (
                  <select style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }} value={editForm.contract || ''} onChange={e => setEditForm(f => ({ ...f, contract: e.target.value }))}>
                    <option value="">בחר...</option>
                    <option value="חתום">חתום ✓</option>
                    <option value="ממתין">ממתין לחתימה ⏳</option>
                    <option value="אין">ללא חוזה</option>
                  </select>
                ) : (
                  <p style={{ fontSize: 13, fontWeight: data.contract ? 600 : 400, fontStyle: data.contract ? 'normal' : 'italic',
                    color: data.contract === 'חתום' ? 'var(--green)' : data.contract === 'ממתין' ? '#f59e0b' : data.contract === 'אין' ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                    {data.contract === 'חתום' ? '✓ חתום' : data.contract === 'ממתין' ? '⏳ ממתין לחתימה' : data.contract === 'אין' ? 'ללא חוזה' : 'לא הוזן'}
                  </p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>📝 הערות</p>
              {editMode ? (
                <textarea
                  style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
                  rows={3}
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="הוסף הערות על הלקוח..."
                />
              ) : (
                <p style={{ fontSize: 13, color: data.notes ? 'var(--text-secondary)' : 'var(--text-muted)', fontStyle: data.notes ? 'normal' : 'italic' }}>{data.notes || "אין הערות"}</p>
              )}
            </div>
          </>
        )}

        {/* Tab: אפיון */}
        {activeTab === 'brief' && (
          <ClientBriefTab brief={clientData.brief || {}} onSave={handleBriefSave} />
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { value: activeTasks.length, label: 'משימות פתוחות', color: 'var(--blue)' },
          { value: activeTasks.filter(t => t.urgency === 'גבוהה').length, label: 'דחיפות גבוהה', color: 'var(--red)' },
          { value: doneTasks.length, label: 'בוצעו', color: 'var(--green)' },
          { value: overdue.length, label: 'פג תוקף', color: '#f97316' },
        ].map(({ value, label, color }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 700, color }}>{value}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Tasks table */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>משימות</h3>
          <button onClick={onAddTask} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--accent)', color: 'white', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <span>+</span> משימה חדשה
          </button>
        </div>
        {allClientTasks.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>אין משימות ללקוח זה עדיין</div>
        ) : (
          <table style={{ width: '100%', textAlign: 'right', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                {COL_HEADERS.map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeTasks.map(task => (
                <TaskRow key={task.id} task={task} onToggleDone={onToggleDone} onClientClick={() => {}} onTaskClick={onTaskClick} showClient={false} />
              ))}
              {doneTasks.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} style={{ padding: '16px 16px 8px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ בוצעו ({doneTasks.length})</span>
                    </td>
                  </tr>
                  {doneTasks.map(task => (
                    <TaskRow key={task.id} task={task} onToggleDone={onToggleDone} onClientClick={() => {}} onTaskClick={onTaskClick} showClient={false} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── Google Icon SVG ─────────────────────────────────────────────────────────
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// ─── Set New Password Screen ──────────────────────────────────────────────────
const SetNewPasswordScreen = ({ onDone }) => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);

  const handleSubmit = async () => {
    if (password.length < 6) { setError("סיסמה חייבת להכיל לפחות 6 תווים"); return; }
    if (password !== confirm) { setError("הסיסמאות אינן תואמות"); return; }
    setLoading(true); setError("");
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e) { setError(e.message); setLoading(false); return; }
    setSuccess(true);
    setTimeout(onDone, 1500);
  };

  const authInput = { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg-base)' }} dir="rtl">
      <div style={{ width: '100%', maxWidth: 380, background: 'var(--bg-surface)', borderRadius: 20, border: '1px solid var(--border)', padding: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>סיסמה חדשה</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>בחר סיסמה חדשה לחשבון שלך</p>
        {success ? (
          <div style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>✅ הסיסמה עודכנה! מתחבר...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              style={authInput}
              placeholder="סיסמה חדשה (לפחות 6 תווים)"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <input
              type="password"
              style={authInput}
              placeholder="אימות סיסמה"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
            {error && <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{error}</p>}
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ width: '100%', padding: '11px 0', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: loading ? 'default' : 'pointer', background: loading ? 'var(--text-muted)' : 'linear-gradient(135deg,#6366f1,#a855f7)' }}
            >
              {loading ? "⏳ שומר..." : "עדכן סיסמה"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Login Screen ─────────────────────────────────────────────────────────────
const LoginScreen = ({ accessBlocked }) => {
  const [mode, setMode] = useState("login"); // "login" | "register" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(accessBlocked ? "הגישה שלך לא אושרה. פנה למנהל המערכת." : "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const handleEmailLogin = async () => {
    if (!email.trim()) { setError("נא להזין אימייל"); return; }
    if (mode !== "reset" && password.length < 6) { setError("סיסמה חייבת להכיל לפחות 6 תווים"); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      if (mode === "register") {
        const { error: e } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (e) throw e;
        setSuccess("נשלח אימייל אימות — בדוק את תיבת הדואר שלך ✉️");
      } else if (mode === "reset") {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (e) throw e;
        setSuccess("נשלח מייל לאיפוס סיסמה ✉️ בדוק את תיבת הדואר שלך");
        setTimeout(() => setMode("login"), 3000);
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) throw e;
      }
    } catch (e) {
      setError(e.message || "שגיאה לא ידועה");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (e) { setError(e.message); setLoading(false); }
  };

  const switchMode = (m) => { setMode(m); setError(""); setSuccess(""); };

  const authInput = { width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' };

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'radial-gradient(ellipse at 70% 20%, rgba(124,110,245,0.15) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(34,211,238,0.08) 0%, transparent 55%), var(--bg-base)'
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, gap: 8 }}>
          <svg viewBox="0 0 160 54" xmlns="http://www.w3.org/2000/svg" style={{ height: 48, width: 'auto' }} aria-label="LUMA">
            <defs>
              <linearGradient id="loginAGrad" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="#22d3ee" />
                <stop offset="40%"  stopColor="#6366f1" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
              <clipPath id="loginAClip">
                <text x="116" y="48" fontFamily="'Helvetica Neue',Arial,sans-serif" fontWeight="900" fontSize="54">A</text>
              </clipPath>
            </defs>
            <text x="0" y="48" fontFamily="'Helvetica Neue',Helvetica,Arial,sans-serif" fontWeight="900" fontSize="54" letterSpacing="-1.5" fill="var(--text-primary)">LUM</text>
            <text x="116" y="48" fontFamily="'Helvetica Neue',Helvetica,Arial,sans-serif" fontWeight="900" fontSize="54" letterSpacing="-1.5" fill="url(#loginAGrad)">A</text>
            <g clipPath="url(#loginAClip)" opacity="0.3">
              <line x1="116" y1="48" x2="160" y2="0"  stroke="white" strokeWidth="1.5"/>
              <line x1="125" y1="48" x2="160" y2="12" stroke="white" strokeWidth="1"/>
              <line x1="135" y1="48" x2="160" y2="24" stroke="white" strokeWidth="1"/>
              <line x1="145" y1="0"  x2="116" y2="36" stroke="white" strokeWidth="1"/>
            </g>
          </svg>
          <p style={{ fontSize: 10, letterSpacing: '0.15em', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 500, margin: 0 }}>Make Digital Brighter</p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 24, border: '1px solid var(--border)', padding: 28, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>

          {mode === "reset" ? (
            /* ── Reset password view ── */
            <>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 12px', background: 'var(--accent-dim)' }}>🔑</div>
                <h2 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, margin: '0 0 4px' }}>איפוס סיסמה</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>נשלח אליך קישור לאיפוס במייל</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="email"
                  style={authInput}
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleEmailLogin()}
                  autoComplete="email"
                />
                {error && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', fontSize: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '8px 12px', borderRadius: 10 }}><span>⚠</span><span>{error}</span></div>}
                {success && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', padding: '8px 12px', borderRadius: 10 }}><span>✅</span><span>{success}</span></div>}
                <button onClick={handleEmailLogin} disabled={loading}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 12, fontSize: 13, fontWeight: 700, color: 'white', border: 'none', cursor: loading ? 'default' : 'pointer', background: 'linear-gradient(135deg,#6366f1,#a855f7)', boxShadow: '0 4px 14px rgba(139,92,246,0.35)', opacity: loading ? 0.6 : 1 }}>
                  {loading ? "⏳ שולח..." : "שלח קישור לאיפוס"}
                </button>
                <button onClick={() => switchMode("login")} style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', textAlign: 'center', marginTop: 4 }}>
                  ← חזרה לכניסה
                </button>
              </div>
            </>
          ) : (
            /* ── Login / Register view ── */
            <>
              {/* Mode toggle */}
              <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 16, padding: 4, marginBottom: 24, border: '1px solid var(--border)' }}>
                <button onClick={() => switchMode("login")}
                  style={{ flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, borderRadius: 12, border: 'none', cursor: 'pointer', background: mode === "login" ? 'var(--bg-surface)' : 'transparent', color: mode === "login" ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: mode === "login" ? '0 1px 4px rgba(0,0,0,0.2)' : 'none' }}
                >כניסה</button>
                <button onClick={() => switchMode("register")}
                  style={{ flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, borderRadius: 12, border: 'none', cursor: 'pointer', background: mode === "register" ? 'var(--bg-surface)' : 'transparent', color: mode === "register" ? 'var(--text-primary)' : 'var(--text-muted)', boxShadow: mode === "register" ? '0 1px 4px rgba(0,0,0,0.2)' : 'none' }}
                >הרשמה</button>
              </div>

              {/* Google */}
              <button onClick={handleGoogle} disabled={loading}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer', marginBottom: 16, opacity: loading ? 0.5 : 1, boxSizing: 'border-box' }}>
                <GoogleIcon />
                {mode === "login" ? "כניסה עם Google" : "הרשמה עם Google"}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>או</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }}></div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {mode === "register" && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>שם מלא</label>
                    <input style={authInput}
                      placeholder="Slav Gomelski" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>אימייל</label>
                  <input type="email" style={authInput}
                    placeholder="you@gmail.com" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleEmailLogin()} autoComplete="email" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>סיסמה</label>
                    {mode === "login" && (
                      <button onClick={() => switchMode("reset")}
                        style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}>
                        שכחתי סיסמה
                      </button>
                    )}
                  </div>
                  <input type="password" style={authInput}
                    placeholder={mode === "register" ? "לפחות 6 תווים" : "••••••••"}
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleEmailLogin()}
                    autoComplete={mode === "register" ? "new-password" : "current-password"} />
                </div>
                {error && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--red)', fontSize: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '8px 12px', borderRadius: 10 }}><span>⚠</span><span>{error}</span></div>}
                {success && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', padding: '8px 12px', borderRadius: 10 }}><span>✅</span><span>{success}</span></div>}
                <button onClick={handleEmailLogin} disabled={loading}
                  style={{ width: '100%', padding: '10px 0', borderRadius: 12, fontSize: 13, fontWeight: 700, color: 'white', border: 'none', cursor: loading ? 'default' : 'pointer', marginTop: 4, background: loading ? 'var(--text-muted)' : 'linear-gradient(135deg,#6366f1,#a855f7)', boxShadow: loading ? 'none' : '0 4px 14px rgba(139,92,246,0.35)', opacity: loading ? 0.6 : 1 }}>
                  {loading ? "⏳ מתחבר..." : mode === "login" ? "כניסה" : "יצירת חשבון"}
                </button>
              </div>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 20 }}>LUMA © 2026 · Make Digital Brighter</p>
      </div>
    </div>
  );
};

// ─── Admin Panel ─────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  admin:   { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(124,110,245,0.3)' },
  user:    { background: 'var(--bg-active)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  blocked: { background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.25)' },
};
const ROLE_LABELS = { admin: "אדמין", user: "משתמש", blocked: "חסום" };

const AdminPanel = ({ currentUser, onClose }) => {
  const [tab, setTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [resetMsg, setResetMsg] = useState("");

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("allowed_users").select("*").order("invited_at");
    if (data) setUsers(data);
    setLoading(false);
  };

  const changeRole = async (email, newRole) => {
    if (!supabase) return;
    const { error } = await supabase.from("allowed_users").update({ role: newRole }).eq("email", email);
    if (!error) setUsers(prev => prev.map(u => u.email === email ? { ...u, role: newRole } : u));
  };

  const removeUser = async (email) => {
    if (!supabase) return;
    const { error } = await supabase.from("allowed_users").delete().eq("email", email);
    if (!error) { setUsers(prev => prev.filter(u => u.email !== email)); setConfirmRemove(null); }
  };

  const addToAllowlist = async () => {
    if (!inviteEmail.includes("@") || !supabase) return;
    setInviteLoading(true);
    const { data, error } = await supabase.from("allowed_users").insert([{
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      display_name: inviteName.trim() || inviteEmail.split("@")[0],
    }]).select().single();
    if (!error && data) {
      setUsers(prev => [...prev, data]);
      setInviteMsg("✓ נוסף לרשימה המורשית. המשתמש יוכל להירשם עם האימייל הזה.");
      setInviteEmail(""); setInviteName("");
      setTimeout(() => setInviteMsg(""), 4000);
    } else {
      setInviteMsg(error?.message?.includes("duplicate") ? "⚠ האימייל הזה כבר קיים ברשימה" : `⚠ שגיאה: ${error?.message}`);
    }
    setInviteLoading(false);
  };

  const sendPasswordReset = async (email) => {
    if (!supabase) return;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setResetMsg(email);
    setTimeout(() => setResetMsg(""), 3500);
  };

  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString("he-IL", { day:"2-digit", month:"2-digit", year:"2-digit" }) : "—";

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }} dir="rtl">
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: 'var(--bg-surface)', borderRadius: 20, border: '1px solid var(--border)', width: '100%', maxWidth: 640, margin: '0 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 15, background: 'var(--accent)', flexShrink: 0 }}>⚙</div>
            <div>
              <h2 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 15, margin: 0, lineHeight: 1.2 }}>ניהול משתמשים</h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>LUMA Admin Panel · {users.length} משתמשים מורשים</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: 'var(--text-muted)', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {[{ id:"users", label:`👥 משתמשים (${users.length})` }, { id:"invite", label:"➕ הוסף משתמש" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', marginBottom: -1,
              color: tab===t.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: tab===t.id ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* Users tab */}
          {tab === "users" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0', fontSize: 13 }}>⏳ טוען משתמשים...</div>}
              {!loading && users.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                  <p style={{ fontSize: 13 }}>אין משתמשים ברשימה.</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>הוסף את עצמך דרך לשונית "הוסף משתמש"</p>
                </div>
              )}
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, border: '1px solid', background: u.role==="blocked" ? 'rgba(239,68,68,0.07)' : 'var(--bg-elevated)', borderColor: u.role==="blocked" ? 'rgba(239,68,68,0.2)' : 'var(--border)' }}>
                  {/* Avatar */}
                  <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0, background: u.role==="blocked" ? 'var(--text-muted)' : 'var(--accent)' }}>
                    {(u.display_name || u.email).charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: u.role==="blocked" ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: u.role==="blocked" ? 'line-through' : 'none' }}>{u.display_name || u.email.split("@")[0]}</span>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, border: '1px solid', fontWeight: 700,
                        background: u.role==="admin" ? 'var(--accent-dim)' : u.role==="blocked" ? 'rgba(239,68,68,0.1)' : 'var(--bg-active)',
                        color: u.role==="admin" ? 'var(--accent)' : u.role==="blocked" ? 'var(--red)' : 'var(--text-secondary)',
                        borderColor: u.role==="admin" ? 'var(--accent)' : u.role==="blocked" ? 'var(--red)' : 'var(--border)' }}>{ROLE_LABELS[u.role]}</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>הוזמן: {formatDate(u.invited_at)}</span>
                      {u.last_seen && <><span style={{ color: 'var(--border)' }}>·</span><span style={{ fontSize: 10, color: 'var(--text-muted)' }}>נראה: {formatDate(u.last_seen)}</span></>}
                    </div>
                  </div>
                  {/* Actions */}
                  {u.email !== currentUser?.email ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {u.role !== "blocked" && (
                        <select value={u.role} onChange={e => changeRole(u.email, e.target.value)}
                          style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px', background: 'var(--bg-surface)', color: 'var(--text-secondary)', outline: 'none', cursor: 'pointer' }}>
                          <option value="admin">אדמין</option>
                          <option value="user">משתמש</option>
                        </select>
                      )}
                      <button onClick={() => changeRole(u.email, u.role==="blocked" ? "user" : "blocked")}
                        style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, fontWeight: 700, border: '1px solid', cursor: 'pointer',
                          background: u.role==="blocked" ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                          color: u.role==="blocked" ? 'var(--green)' : '#f59e0b',
                          borderColor: u.role==="blocked" ? 'var(--green)' : '#f59e0b' }}>
                        {u.role==="blocked" ? "בטל חסימה" : "חסום"}
                      </button>
                      <button onClick={() => sendPasswordReset(u.email)} title="שלח מייל לאיפוס סיסמה"
                        style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, fontWeight: 700, border: '1px solid', cursor: 'pointer',
                          background: resetMsg===u.email ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                          color: resetMsg===u.email ? 'var(--green)' : 'var(--blue)',
                          borderColor: resetMsg===u.email ? 'var(--green)' : 'var(--blue)' }}>
                        {resetMsg===u.email ? "✓ נשלח" : "🔑 איפוס"}
                      </button>
                      {confirmRemove === u.email ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => removeUser(u.email)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, background: 'var(--red)', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer' }}>מחק ✓</button>
                          <button onClick={() => setConfirmRemove(null)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, background: 'var(--bg-active)', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>ביטול</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemove(u.email)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid var(--red)', cursor: 'pointer', fontWeight: 700 }}>הסר</button>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', flexShrink: 0, background: 'var(--bg-elevated)', padding: '4px 8px', borderRadius: 8 }}>אתה</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add user tab */}
          {tab === "invite" && (
            <div style={{ maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 12, padding: 16, fontSize: 13, color: 'var(--blue)' }}>
                <p style={{ fontWeight: 700, marginBottom: 4 }}>איך זה עובד?</p>
                <p style={{ fontSize: 11, opacity: 0.8 }}>הוסף אימייל לרשימה המורשית. המשתמש יוכל להירשם עם האימייל הזה ולהיכנס למערכת. אם תסיר אותו — הגישה שלו תיחסם אוטומטית.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>שם תצוגה</label>
                  <input style={fieldInput} placeholder="שם מלא" value={inviteName} onChange={e => setInviteName(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>כתובת אימייל *</label>
                  <input type="email" style={fieldInput} placeholder="user@email.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key==="Enter" && addToAllowlist()} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>תפקיד</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ v:"user", l:"משתמש", d:"גישה לנתונים שלו בלבד" }, { v:"admin", l:"אדמין", d:"גישה מלאה + ניהול" }].map(r => (
                    <button key={r.v} onClick={() => setInviteRole(r.v)}
                      style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid', textAlign: 'right', cursor: 'pointer',
                        background: inviteRole===r.v ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        borderColor: inviteRole===r.v ? 'var(--accent)' : 'var(--border)' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: inviteRole===r.v ? 'var(--accent)' : 'var(--text-primary)', margin: 0 }}>{r.l}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.d}</p>
                    </button>
                  ))}
                </div>
              </div>
              {inviteMsg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '12px 16px', borderRadius: 12, border: '1px solid',
                  background: inviteMsg.startsWith("✓") ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                  color: inviteMsg.startsWith("✓") ? 'var(--green)' : '#f59e0b',
                  borderColor: inviteMsg.startsWith("✓") ? 'var(--green)' : '#f59e0b' }}>
                  {inviteMsg}
                </div>
              )}
              <button onClick={addToAllowlist} disabled={inviteLoading || !inviteEmail.includes("@")}
                style={{ padding: '10px', borderRadius: 12, fontSize: 13, fontWeight: 700, color: 'white', border: 'none', cursor: 'pointer', background: 'var(--accent)', opacity: (inviteLoading || !inviteEmail.includes("@")) ? 0.5 : 1 }}>
                {inviteLoading ? "⏳ מוסיף..." : "➕ הוסף לרשימה המורשית"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Mobile Task Card ────────────────────────────────────────────────────────
const URGENCY_CONFIG = {
  'גבוהה':  { border: '#ef4444', badge: 'linear-gradient(135deg,#ef4444,#f97316)', label: '⚡ דחוף' },
  'בינונית': { border: '#f97316', badge: 'linear-gradient(135deg,#f97316,#fbbf24)', label: '● בינוני' },
  'נמוכה':  { border: '#6366f1', badge: 'linear-gradient(135deg,#6366f1,#8b5cf6)', label: '● נמוך' },
};
const STATUS_COLORS = { 'בביצוע': '#3b82f6', 'ממתין לאישור': '#f59e0b', 'לביצוע': '#94a3b8', 'בוצע': '#10b981' };

const TaskCard = ({ task, onToggleDone, onClientClick, onTaskClick }) => {
  const uc = URGENCY_CONFIG[task.urgency] || URGENCY_CONFIG['נמוכה'];
  const isOverdue = task.date && task.date < TODAY && !task.done;
  const hasFollowUp = task.follow_up_date && task.follow_up_date <= TODAY && !task.done;
  return (
    <div
      onClick={() => onTaskClick && onTaskClick(task)}
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 12,
        padding: '12px 14px',
        border: '1px solid var(--border)',
        borderRight: `3px solid ${task.done ? 'var(--border)' : uc.border}`,
        opacity: task.done ? 0.4 : 1,
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
    >
      {/* Row 1: checkbox + title + urgency */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div onClick={e => { e.stopPropagation(); onToggleDone(task.id); }}>
          <DoneCheckbox done={task.done} onToggle={() => {}} />
        </div>
        <p style={{
          flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0,
          textDecoration: task.done ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.task}</p>
        {!task.done && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: uc.badge, color: 'white', flexShrink: 0,
          }}>{uc.label}</span>
        )}
      </div>

      {/* Row 2: client + platform + date + status */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, paddingRight: 28 }}>
        <button
          onClick={e => { e.stopPropagation(); onClientClick(task.client); }}
          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >{task.client}</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{PLATFORM_ICONS[task.platform]} {task.platform}</span>
        {task.date && (
          <span style={{ fontSize: 11, fontWeight: 500, color: isOverdue ? 'var(--red)' : 'var(--text-muted)' }}>
            {isOverdue ? '⚠️' : '📅'} {task.date}
          </span>
        )}
        {!task.done && task.status !== 'לביצוע' && (
          <span style={{ fontSize: 11, fontWeight: 500, color: STATUS_COLORS[task.status] || 'var(--text-muted)' }}>
            {task.status === 'בביצוע' ? '🔵' : '🟡'} {task.status}
          </span>
        )}
        {task.recurrence && task.recurrence !== 'none' && !task.done && (
          <span style={{ fontSize: 11, color: 'var(--accent)' }}>🔁 חוזרת</span>
        )}
        {hasFollowUp && <span style={{ fontSize: 11, color: '#f59e0b' }}>🔔 פולו-אפ</span>}
      </div>
    </div>
  );
};

// ─── Kanban Board ────────────────────────────────────────────────────────────
const KANBAN_COLUMNS = [
  { key: 'לביצוע', label: 'לביצוע', color: '#94a3b8' },
  { key: 'בביצוע', label: 'בביצוע', color: '#3b82f6' },
  { key: 'ממתין לאישור', label: 'ממתין לאישור', color: '#f59e0b' },
  { key: 'בוצע', label: 'בוצע', color: '#10b981' },
];

const KanbanBoard = ({ tasks, onDropTask, onToggleDone, onClientClick, onTaskClick, mobile }) => {
  const [dragOverCol, setDragOverCol] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const colTasks = (key) => key === 'בוצע' ? tasks.filter(t => t.done) : tasks.filter(t => !t.done && t.status === key);

  const handleDrop = (e, colKey) => {
    e.preventDefault();
    setDragOverCol(null);
    // Clear here rather than relying on onDragEnd — if the drop moves the card to a
    // different column, React can unmount the source element before the browser
    // fires 'dragend' on it, leaving the drag-opacity stuck on permanently.
    setDraggingId(null);
    const id = e.dataTransfer.getData('text/plain');
    const task = tasks.find(t => String(t.id) === id);
    if (task) onDropTask(task, colKey);
  };

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
      {KANBAN_COLUMNS.map(col => {
        const items = colTasks(col.key);
        const isOver = dragOverCol === col.key;
        return (
          <div
            key={col.key}
            onDragOver={e => { e.preventDefault(); if (dragOverCol !== col.key) setDragOverCol(col.key); }}
            onDragLeave={() => setDragOverCol(prev => prev === col.key ? null : prev)}
            onDrop={e => handleDrop(e, col.key)}
            style={{
              flex: mobile ? '0 0 78vw' : '1 1 260px',
              minWidth: mobile ? '78vw' : 260,
              background: isOver ? '#eef2ff' : '#f8fafc',
              border: `1px dashed ${isOver ? '#a5b4fc' : '#e2e8f0'}`,
              borderRadius: 16,
              padding: 10,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 10px' }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{col.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', background: '#fff', border: '1px solid #e8eaf0', borderRadius: 99, padding: '1px 8px', marginRight: 'auto' }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
              {items.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('text/plain', String(task.id)); setDraggingId(task.id); }}
                  onDragEnd={() => setDraggingId(null)}
                  style={{ opacity: draggingId === task.id ? 0.4 : 1, cursor: 'grab' }}
                >
                  <TaskCard task={task} onToggleDone={onToggleDone} onClientClick={onClientClick} onTaskClick={onTaskClick} />
                </div>
              ))}
              {items.length === 0 && (
                <p style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 12, fontStyle: 'italic', padding: '16px 0' }}>ריק</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Main Task Manager ───────────────────────────────────────────────────────
const HOLIDAYS = [
  { id: "h1", date: "2026-03-29", type: "holiday", title: "פסח (ערב חג)", client: "", platform: "", status: "" },
  { id: "h2", date: "2026-03-30", type: "holiday", title: "פסח א׳", client: "", platform: "", status: "" },
  { id: "h3", date: "2026-04-05", type: "holiday", title: "פסח ז׳", client: "", platform: "", status: "" },
  { id: "h4", date: "2026-04-06", type: "holiday", title: "פסח ח׳ / אחרון של פסח", client: "", platform: "", status: "" },
  { id: "h5", date: "2026-04-16", type: "holiday", title: "יום הזיכרון לשואה", client: "", platform: "", status: "" },
  { id: "h6", date: "2026-04-22", type: "holiday", title: "יום הזיכרון לחללים", client: "", platform: "", status: "" },
  { id: "h7", date: "2026-04-23", type: "holiday", title: "יום העצמאות 🇮🇱", client: "", platform: "", status: "" },
];

const TaskManager = () => {
  const mobile = useMobile();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbLoading, setDbLoading] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [calItems, setCalItems] = useState(HOLIDAYS);
  const [clientsData, setClientsData] = useState({});
  const [templates, setTemplates] = useState([]);

  const [showAdmin, setShowAdmin] = useState(false);
  const [screen, setScreen] = useState("home");
  const [chatOpen, setChatOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("כל הלקוחות");
  const [statusFilter, setStatusFilter] = useState(null); // null | { type: 'urgency'|'status', value: string }
  const [taskView, setTaskView] = useState('table'); // 'table' | 'kanban'
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [showManageTemplates, setShowManageTemplates] = useState(false);
  const [newTask, setNewTask] = useState(emptyTask);

  const emptyClientForm = { name: "", phone: "", email: "", website: "", notes: "", type: "", amount: "", contract: "" };
  const [newClientForm, setNewClientForm] = useState(emptyClientForm);

  const currentUser = user ? {
    name: user.user_metadata?.full_name || user.email?.split("@")[0] || "משתמש",
    email: user.email,
    role: "admin",
    provider: user.app_metadata?.provider || "email"
  } : null;

  // ── Auth listener ──
  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }

    const timeout = setTimeout(() => setAuthLoading(false), 5000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout);
      setUser(session?.user ?? null);
      setAuthLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { setIsRecoveryMode(true); }
      else { setUser(session?.user ?? null); }
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  // ── Load data when user logs in ──
  useEffect(() => {
    if (!user || !supabase) return;
    setDbLoading(true);
    Promise.all([loadTasks(), loadClients(), loadCalItems(), loadTemplates()]).finally(() => setDbLoading(false));
  }, [user]);

  // ── Realtime sync ──
  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, ({ new: newRow }) => {
        setTasks(prev => prev.some(t => t.id === newRow.id) ? prev : [...prev, newRow]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, ({ new: newRow }) => {
        setTasks(prev => prev.map(t => t.id === newRow.id ? newRow : t));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, ({ old: oldRow }) => {
        setTasks(prev => prev.filter(t => t.id !== oldRow.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadTasks = async () => {
    const { data } = await supabase.from("tasks").select("*").order("created_at");
    if (data) {
      setTasks(data);
      // Run on next tick so state is settled
      setTimeout(() => checkAndGenerateRecurring(data), 0);
    }
  };

  const loadClients = async () => {
    const { data } = await supabase.from("clients").select("*").order("name");
    if (data) {
      const map = {};
      data.forEach(c => { map[c.name] = { phone: c.phone, email: c.email, website: c.website, notes: c.notes, brief: c.brief || {}, type: c.type || '', amount: c.amount || '', contract: c.contract || '', _id: c.id }; });
      setClientsData(map);
    }
  };

  const loadCalItems = async () => {
    const { data } = await supabase.from("cal_items").select("*").order("date");
    if (data) setCalItems([...HOLIDAYS, ...data]);
  };

  const loadTemplates = async () => {
    const { data } = await supabase.from("task_templates").select("*").order("created_at");
    if (data) setTemplates(data);
  };

  const saveTemplate = async (templateData) => {
    const { data, error } = await supabase
      .from("task_templates")
      .insert([{ ...templateData, user_id: user?.id }])
      .select().single();
    if (!error && data) setTemplates(prev => [...prev, data]);
    return !error;
  };

  const deleteTemplate = async (id) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    await supabase.from("task_templates").delete().eq("id", id);
  };

  const clients = Object.keys(clientsData);

  // ── Recurring task generation ──
  const spawnRecurringInstance = async (sourceTask, allTasks) => {
    if (!sourceTask.recurrence || sourceTask.recurrence === 'none' || !sourceTask.date) return;
    const nextDate = getNextRecurrenceDate(sourceTask.date, sourceTask.recurrence);
    if (!nextDate) return;
    // Don't spawn if an undone sibling with same text+client already exists for that date
    const alreadyExists = allTasks.some(t =>
      !t.done && t.task === sourceTask.task && t.client === sourceTask.client &&
      t.date === nextDate && t.id !== sourceTask.id
    );
    if (alreadyExists) return;
    const { id: _id, created_at: _c, done: _d, status: _s, ...rest } = sourceTask;
    const newTask = { ...rest, date: nextDate, done: false, status: 'לביצוע', user_id: user?.id };
    if (supabase) {
      const { data, error } = await supabase.from("tasks").insert([newTask]).select().single();
      if (!error && data) setTasks(prev => [...prev, data]);
    } else {
      setTasks(prev => [...prev, { ...newTask, id: Date.now() }]);
    }
  };

  const checkAndGenerateRecurring = async (currentTasks) => {
    // 1. Done recurring tasks → spawn next occurrence if missing
    const doneRecurring = currentTasks.filter(t => t.done && t.recurrence && t.recurrence !== 'none' && t.date);
    for (const task of doneRecurring) {
      await spawnRecurringInstance(task, currentTasks);
    }
    // 2. Overdue undone recurring tasks → advance date to next valid future date (no duplicate creation)
    const overdueRecurring = currentTasks.filter(t => !t.done && t.recurrence && t.recurrence !== 'none' && t.date && t.date < TODAY);
    for (const task of overdueRecurring) {
      const nextDate = advanceToNextValidDate(task.date, task.recurrence);
      if (nextDate && nextDate !== task.date) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, date: nextDate } : t));
        if (supabase) await supabase.from("tasks").update({ date: nextDate }).eq("id", task.id);
      }
    }
  };

  const toggleDone = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newDone = !task.done;
    const updates = { done: newDone, ...(newDone ? { status: 'בוצע' } : {}) };
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, ...updates } : t);
    setTasks(updatedTasks);
    if (supabase) await supabase.from("tasks").update(updates).eq("id", id);
    // If marking done, spawn next recurrence
    if (newDone && task.recurrence && task.recurrence !== 'none') {
      await spawnRecurringInstance({ ...task, done: true }, updatedTasks);
    }
  };

  const updateTask = async (updated) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
    if (supabase) {
      const { id, ...rest } = updated;
      await supabase.from("tasks").update(rest).eq("id", id);
    }
  };

  const onDropTask = async (task, targetStatus) => {
    if (targetStatus === 'בוצע') {
      if (!task.done) await toggleDone(task.id);
    } else if (task.done) {
      await updateTask({ id: task.id, done: false, status: targetStatus });
    } else if (task.status !== targetStatus) {
      await updateTask({ id: task.id, status: targetStatus });
    }
  };

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (supabase) await supabase.from("tasks").delete().eq("id", id);
  };

  const stopRecurring = async (taskName, client) => {
    // Delete all open (undone) instances of this recurring task
    const toDelete = tasks.filter(t => t.task === taskName && t.client === client && !t.done && t.recurrence && t.recurrence !== 'none');
    // Neutralize recurrence on all done instances so they stop spawning new ones
    const toNeutralize = tasks.filter(t => t.task === taskName && t.client === client && t.done && t.recurrence && t.recurrence !== 'none');
    setTasks(prev => prev
      .filter(t => !toDelete.some(d => d.id === t.id))
      .map(t => toNeutralize.some(n => n.id === t.id) ? { ...t, recurrence: 'none' } : t)
    );
    if (supabase) {
      for (const t of toDelete) await supabase.from("tasks").delete().eq("id", t.id);
      for (const t of toNeutralize) await supabase.from("tasks").update({ recurrence: 'none' }).eq("id", t.id);
    }
  };

  const addTask = async () => {
    if (!newTask.task || !newTask.client) return;
    const taskData = { ...newTask, user_id: user?.id };
    delete taskData.id;
    if (supabase) {
      const { data, error } = await supabase.from("tasks").insert([taskData]).select().single();
      if (!error && data) setTasks(prev => [...prev, data]);
    } else {
      setTasks(prev => [...prev, { ...newTask, id: Date.now() }]);
    }
    setNewTask(emptyTask);
    setShowTaskModal(false);
  };

  const saveClientData = async (oldName, newName, data) => {
    const isRename = newName && newName !== oldName;
    if (isRename) {
      // Rename: delete old key, add new key, update tasks client field
      setClientsData(prev => {
        const updated = { ...prev };
        delete updated[oldName];
        updated[newName] = { ...data, _id: prev[oldName]?._id };
        return updated;
      });
      setTasks(prev => prev.map(t => t.client === oldName ? { ...t, client: newName } : t));
      if (supabase) {
        const existing = clientsData[oldName];
        if (existing?._id) {
          await supabase.from("clients").update({ name: newName, ...data }).eq("id", existing._id);
        }
        await supabase.from("tasks").update({ client: newName }).eq("client", oldName);
      }
      // Navigate to new client name
      setSelectedClient(newName);
    } else {
      setClientsData(prev => ({ ...prev, [oldName]: { ...data, _id: prev[oldName]?._id } }));
      if (supabase) {
        const existing = clientsData[oldName];
        if (existing?._id) {
          const { _id, ...rest } = data;
          await supabase.from("clients").update(rest).eq("id", existing._id);
        }
      }
    }
  };

  const addClient = async () => {
    const name = newClientForm.name.trim();
    if (!name || clientsData[name]) return;
    const { name: _, ...rest } = newClientForm;
    if (supabase) {
      const { data, error } = await supabase.from("clients").insert([{ name, ...rest, user_id: user?.id }]).select().single();
      if (!error && data) setClientsData(prev => ({ ...prev, [name]: { ...rest, _id: data.id } }));
    } else {
      setClientsData(prev => ({ ...prev, [name]: rest }));
    }
    setNewClientForm(emptyClientForm);
    setShowClientModal(false);
  };

  const addCalItem = async (item) => {
    if (supabase) {
      const { data, error } = await supabase.from("cal_items").insert([{ ...item, user_id: user?.id }]).select().single();
      if (!error && data) setCalItems(prev => [...prev, data]);
    } else {
      setCalItems(prev => [...prev, { ...item, id: Date.now() }]);
    }
  };

  const deleteCalItem = async (id) => {
    setCalItems(prev => prev.filter(i => i.id !== id));
    if (supabase && typeof id === "number" && id > 1000) await supabase.from("cal_items").delete().eq("id", id);
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setTasks([]); setCalItems(HOLIDAYS); setClientsData({});
  };

  // ── Auth / loading gates ──
  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f6fa' }} dir="rtl">
      <div style={{ color: '#94a3b8', fontSize: 16 }}>⏳ טוען...</div>
    </div>
  );

  if (isRecoveryMode) return <SetNewPasswordScreen onDone={() => { setIsRecoveryMode(false); window.location.hash = ''; }} />;

  if (!supabase || !user) return <LoginScreen accessBlocked={accessBlocked} />;

  if (dbLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f6fa' }} dir="rtl">
      <div style={{ color: '#94a3b8', fontSize: 16 }}>⏳ טוען נתונים...</div>
    </div>
  );

  // Stats — only active (not done) tasks
  const activeTasks = tasks.filter(t => !t.done);
  const weekEnd = new Date(TODAY);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const thisWeek = activeTasks.filter(t => t.date >= TODAY && t.date <= weekEnd.toISOString().slice(0, 10));
  const overdue = activeTasks.filter(t => t.date < TODAY);
  const pipeline = {
    todo: activeTasks.filter(t => t.status === "לביצוע").length,
    doing: activeTasks.filter(t => t.status === "בביצוע").length,
    waiting: activeTasks.filter(t => t.status === "ממתין לאישור").length,
  };
  const nextTask = [...activeTasks].filter(t => t.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date))[0];
  const doneTasks = tasks.filter(t => t.done);

  const lookaheadDate = (() => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() + RECURRENCE_LOOKAHEAD_DAYS);
    return d.toISOString().slice(0, 10);
  })();

  const baseFiltered = activeFilter === "כל הלקוחות" ? tasks : tasks.filter(t => t.client === activeFilter);
  const statusFiltered = statusFilter
    ? baseFiltered.filter(t => {
        if (statusFilter.type === 'urgency') return t.urgency === statusFilter.value;
        if (statusFilter.type === 'recurrence') return t.recurrence && t.recurrence !== 'none';
        return t.status === statusFilter.value;
      })
    : baseFiltered;
  // Recurring tasks are hidden until 2 days before their due date
  const lookaheadFiltered = statusFiltered.filter(t => {
    if (t.done) return true;
    if (!t.recurrence || t.recurrence === 'none') return true;
    if (!t.date) return true;
    return t.date <= lookaheadDate;
  });
  const activeFiltered = lookaheadFiltered.filter(t => !t.done);
  const doneFiltered = lookaheadFiltered.filter(t => t.done);
  // Kanban ignores the status/urgency pill filter (columns already split by status) but keeps the client filter
  const kanbanTasks = baseFiltered.filter(t => t.done || !t.recurrence || t.recurrence === 'none' || !t.date || t.date <= lookaheadDate);


  const COL_HEADERS = ["", "לקוח", "משימה", "פלטפורמה", "דחיפות", "סטטוס", "תאריך יעד"];

  // ── Shared task detail modal (rendered on top of any screen) ──
  const taskDetailModal = selectedTask ? (
    <TaskDetailModal
      task={selectedTask}
      clients={clients}
      onClose={() => setSelectedTask(null)}
      onSave={(updated) => { updateTask(updated); setSelectedTask(null); }}
      onDelete={(id) => { deleteTask(id); setSelectedTask(null); }}
      onStopRecurring={(taskName, client) => { stopRecurring(taskName, client); setSelectedTask(null); }}
      onLinkToCalendar={(item) => setCalItems(prev => [...prev, item])}
      onSaveTemplate={saveTemplate}
      onFollowUp={({ client, platform }) => {
        setSelectedTask(null);
        setNewTask({ ...emptyTask, client, platform });
        setShowTaskModal(true);
      }}
    />
  ) : null;

  // ── Shared new-task modal — uses full TaskDetailModal ──
  const newTaskModal = showTaskModal && (
    <TaskDetailModal
      task={newTask}
      clients={clients}
      isNew={true}
      templates={templates}
      onApplyTemplate={(t) => setNewTask(p => ({ ...p, task: t.task, platform: t.platform, urgency: t.urgency, status: t.status, notes: t.notes || '' }))}
      onClose={() => { setShowTaskModal(false); setNewTask(emptyTask); }}
      onSave={async (form) => {
        if (!form.task || !form.client) return;
        const { id: _id, ...rest } = form;
        const taskData = { ...rest, user_id: user?.id };
        if (supabase) {
          const { data, error } = await supabase.from("tasks").insert([taskData]).select().single();
          if (!error && data) setTasks(prev => [...prev, data]);
        } else {
          setTasks(prev => [...prev, { ...rest, id: Date.now() }]);
        }
        setNewTask(emptyTask);
        setShowTaskModal(false);
      }}
      onDelete={null}
      onLinkToCalendar={(item) => setCalItems(prev => [...prev, item])}
      onSaveTemplate={saveTemplate}
      onFollowUp={null}
    />
  );

  // ── Manage templates modal ──
  const manageTemplatesModal = showManageTemplates && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setShowManageTemplates(false)}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 20, border: '1px solid var(--border)', padding: 24, width: '100%', maxWidth: 380, margin: '0 16px' }} dir="rtl" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📋 תבניות שמורות</h2>
          <button onClick={() => setShowManageTemplates(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {templates.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontStyle: 'italic', margin: 0 }}>אין תבניות שמורות</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, background: 'var(--bg-elevated)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, margin: '2px 0 0' }}>{PLATFORM_ICONS[t.platform]} {t.platform} · {t.urgency}</p>
                </div>
                <button onClick={() => deleteTemplate(t.id)} style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, padding: 4, borderRadius: 6 }}>🗑</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowManageTemplates(false)} style={{ marginTop: 16, width: '100%', padding: '9px 0', fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer' }}>סגור</button>
      </div>
    </div>
  );

  // ── Render screen content ──
  const renderContent = () => {
    if (selectedClient) {
      return (
        <ClientScreen
          clientName={selectedClient}
          clientData={clientsData[selectedClient] || {}}
          tasks={tasks}
          onBack={() => setSelectedClient(null)}
          onToggleDone={toggleDone}
          onSaveClientData={saveClientData}
          onTaskClick={setSelectedTask}
          onAddTask={() => {
            setNewTask({ ...emptyTask, client: selectedClient });
            setShowTaskModal(true);
          }}
        />
      );
    }
    if (screen === "home") {
      return (
        <>
          <HomeScreen
            tasks={tasks}
            clientsData={clientsData}
            onGoToTasks={() => setScreen("tasks")}
            onGoToClients={() => setScreen("clients")}
            onSelectClient={(name) => setSelectedClient(name)}
            onAddTask={() => setShowTaskModal(true)}
            user={currentUser}
            onNavigateWithFilter={(filter) => { setStatusFilter(filter); setScreen("tasks"); }}
            onTaskClick={setSelectedTask}
            onCreateTemplate={saveTemplate}
          />
        </>
      );
    }
    if (screen === "clients") {
      return (
        <>
          <ClientsListScreen
            clientsData={clientsData}
            tasks={tasks}
            onSelectClient={setSelectedClient}
            onAddClient={() => setShowClientModal(true)}
          />
          {showClientModal && <NewClientModal
            newClientForm={newClientForm}
            setNewClientForm={setNewClientForm}
            emptyClientForm={emptyClientForm}
            onClose={() => { setShowClientModal(false); setNewClientForm(emptyClientForm); }}
            onAdd={addClient}
          />}
        </>
      );
    }
    if (screen === "calendar") {
      return (
        <CalendarScreen
          calItems={calItems}
          clients={clients}
          onAddItem={addCalItem}
          onDeleteItem={deleteCalItem}
        />
      );
    }
    // ── Tasks screen (default) ──
    return (
    <div className={mobile ? "p-3" : "p-6"}>

      {/* Premium desktop page title bar */}
      {!mobile && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>משימות</h1>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400 }}>ניהול וורקפלואו</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ background: '#ffffff', border: '1px solid #e8eaf0', borderRadius: 8, padding: '4px 12px', fontWeight: 500, color: '#64748b' }}>
              {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="mb-4">
        {mobile ? (
          /* Mobile: כפתור + סיכום מינימלי */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {overdue.length > 0 && (
                <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, background: 'rgba(239,68,68,0.12)', color: 'var(--red)', fontWeight: 600 }}>⚠️ {overdue.length} באיחור</span>
              )}
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 600 }}>{activeTasks.length} פתוחות</span>
            </div>
            <button onClick={() => setShowTaskModal(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: 'var(--accent)', color: 'white',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> משימה
            </button>
          </div>
        ) : (
          /* Desktop: stats + buttons */
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>פתוחות</span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{activeTasks.length}</span>
                </div>
                {overdue.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', padding: '5px 12px', borderRadius: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>⚠️ באיחור</span>
                    <span style={{ fontWeight: 700, color: 'var(--red)' }}>{overdue.length}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: 8, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>בביצוע</span>
                  <span style={{ fontWeight: 700, color: '#60a5fa' }}>{pipeline.doing}</span>
                  <span style={{ color: 'var(--border-strong)' }}>·</span>
                  <span style={{ color: 'var(--text-secondary)' }}>ממתין</span>
                  <span style={{ fontWeight: 700, color: '#fbbf24' }}>{pipeline.waiting}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowClientModal(true)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> לקוח חדש
                </button>
                <button onClick={() => setShowTaskModal(true)} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                  background: 'var(--accent)', color: 'white',
                  borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> משימה חדשה
                </button>
              </div>
            </div>
          </>
        )}
      </header>

      {/* View toggle — table / kanban */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 12, background: 'var(--bg-elevated)', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {[['table', '📋 טבלה'], ['kanban', '🗂 קאנבן']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTaskView(key)}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'all 0.12s',
              background: taskView === key ? 'var(--bg-active)' : 'transparent',
              color: taskView === key ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters — לקוח */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ flexWrap: 'nowrap' }}>
        {['כל הלקוחות', ...clients].map(client => (
          <button
            key={client}
            onClick={() => setActiveFilter(client)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid', whiteSpace: 'nowrap', transition: 'all 0.12s', cursor: 'pointer', flexShrink: 0,
              background: activeFilter === client ? 'var(--accent-dim)' : 'var(--bg-elevated)',
              borderColor: activeFilter === client ? 'rgba(124,110,245,0.3)' : 'var(--border)',
              color: activeFilter === client ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {client}
          </button>
        ))}
      </div>

      {/* Filters — סטטוס/דחיפות */}
      {taskView === 'table' && (
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1" style={{ flexWrap: 'nowrap' }}>
          {[
            { label: 'הכל', filter: null },
            { label: '⚡ דחוף', filter: { type: 'urgency', value: 'גבוהה' } },
            { label: '⏳ ממתין', filter: { type: 'status', value: 'ממתין לאישור' } },
            { label: '🔵 בביצוע', filter: { type: 'status', value: 'בביצוע' } },
            { label: 'לביצוע', filter: { type: 'status', value: 'לביצוע' } },
            { label: '🔁 חוזרות', filter: { type: 'recurrence', value: true } },
          ].map(({ label, filter }) => {
            const isActive = !filter ? !statusFilter : (statusFilter?.type === filter.type && statusFilter?.value === filter.value);
            return (
              <button
                key={label}
                onClick={() => setStatusFilter(filter)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, border: '1px solid', whiteSpace: 'nowrap', transition: 'all 0.12s', cursor: 'pointer', flexShrink: 0,
                  background: isActive ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  borderColor: isActive ? 'rgba(124,110,245,0.3)' : 'var(--border)',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {taskView === 'kanban' && (
        <div style={{ marginBottom: 12 }}>
          <KanbanBoard
            tasks={kanbanTasks}
            onDropTask={onDropTask}
            onToggleDone={toggleDone}
            onClientClick={setSelectedClient}
            onTaskClick={setSelectedTask}
            mobile={mobile}
          />
        </div>
      )}

      {/* Task Table / Cards */}
      {taskView === 'kanban' ? null : mobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeFiltered.map(task => (
            <TaskCard key={task.id} task={task} onToggleDone={toggleDone} onClientClick={setSelectedClient} onTaskClick={setSelectedTask} />
          ))}
          {doneFiltered.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '8px 4px 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                ✓ בוצעו ({doneFiltered.length})
              </p>
              {doneFiltered.map(task => (
                <TaskCard key={task.id} task={task} onToggleDone={toggleDone} onClientClick={setSelectedClient} onTaskClick={setSelectedTask} />
              ))}
            </>
          )}
          {activeFiltered.length === 0 && doneFiltered.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>אין משימות להצגה</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <table className="w-full text-right border-collapse">
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                {COL_HEADERS.map((h, i) => (
                  <th key={i} className="px-3 py-3 text-right" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeFiltered.map(task => (
                <TaskRow key={task.id} task={task} onToggleDone={toggleDone} onClientClick={setSelectedClient} onTaskClick={setSelectedTask} />
              ))}

              {doneFiltered.length > 0 && (
                <>
                  <tr>
                    <td colSpan={7} style={{ padding: '12px 16px 6px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        ✓ משימות שבוצעו ({doneFiltered.length})
                      </span>
                    </td>
                  </tr>
                  {doneFiltered.map(task => (
                    <TaskRow key={task.id} task={task} onToggleDone={toggleDone} onClientClick={setSelectedClient} onTaskClick={setSelectedTask} />
                  ))}
                </>
              )}

              {activeFiltered.length === 0 && doneFiltered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>אין משימות להצגה</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-6 text-center text-sm pb-6" style={{ color: 'var(--text-muted)' }}>
        מעוצב לשימוש אישי כאיש שיווק דיגיטלי • 2026
      </footer>

      {showClientModal && <NewClientModal
        newClientForm={newClientForm}
        setNewClientForm={setNewClientForm}
        emptyClientForm={emptyClientForm}
        onClose={() => { setShowClientModal(false); setNewClientForm(emptyClientForm); }}
        onAdd={addClient}
      />}
    </div>
    );
  };

  // ── Unified Layout return ──
  return (
    <Layout
      screen={selectedClient ? "clients" : screen}
      setScreen={setScreen}
      user={currentUser}
      onSignOut={signOut}
      onOpenAdmin={() => setShowAdmin(true)}
      tasks={tasks}
    >
      {taskDetailModal}
      {manageTemplatesModal}
      {newTaskModal}
      {renderContent()}
      {/* ─── Claude AI Chat (floating, all screens) ─── */}
      <ClaudeChat
        tasks={tasks}
        clientsData={clientsData}
        isOpen={chatOpen}
        onOpen={() => setChatOpen(true)}
        onClose={() => setChatOpen(false)}
        isMobile={mobile}
      />
      {/* ─── Admin Panel (modal, admin only) ─── */}
      {showAdmin && (
        <AdminPanel
          currentUser={currentUser}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </Layout>
  );
};

export default TaskManager;
