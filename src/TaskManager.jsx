import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";

const TODAY = new Date().toISOString().slice(0, 10);
const PLATFORMS = ["גוגל אדס", "מטא - ממומן", "סושיאל", "גרפיקה/וידאו", "כללי"];
const URGENCIES = ["גבוהה", "בינונית", "נמוכה"];
const STATUSES = ["לביצוע", "בביצוע", "ממתין לאישור"];
const emptyTask = { client: "", platform: PLATFORMS[0], task: "", urgency: "בינונית", status: "לביצוע", date: "", done: false, notes: "" };

const PLATFORM_ICONS = {
  "גוגל אדס": "🔍",
  "מטא - ממומן": "📘",
  "סושיאל": "📱",
  "גרפיקה/וידאו": "🎬",
  "כללי": "📋",
};

const getUrgencyColor = (urgency) => {
  switch (urgency) {
    case 'גבוהה': return 'bg-red-100 text-red-700 border-red-200';
    case 'בינונית': return 'bg-orange-100 text-orange-700 border-orange-200';
    default: return 'bg-blue-100 text-blue-700 border-blue-200';
  }
};

const getStatusStyle = (status) => {
  switch (status) {
    case 'בביצוע': return 'text-blue-600';
    case 'ממתין לאישור': return 'text-orange-500';
    default: return 'text-gray-500';
  }
};

// ─── Checkbox Button ────────────────────────────────────────────────────────
const DoneCheckbox = ({ done, onToggle }) => (
  <button
    onClick={onToggle}
    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
      done
        ? 'bg-green-500 border-green-500 text-white'
        : 'border-gray-300 hover:border-green-400 bg-white'
    }`}
  >
    {done && (
      <svg viewBox="0 0 10 8" className="w-3 h-3 fill-none stroke-current stroke-2">
        <polyline points="1,4 4,7 9,1" />
      </svg>
    )}
  </button>
);

// ─── Task Row ────────────────────────────────────────────────────────────────
const ClientBadge = ({ name, onClick, done }) => {
  const colors = ['bg-blue-100 text-blue-700','bg-violet-100 text-violet-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700','bg-cyan-100 text-cyan-700'];
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
  return (
    <button onClick={onClick} className={`px-2.5 py-1 rounded-full text-xs font-semibold tracking-tight transition-opacity hover:opacity-75 ${colors[idx]} ${done ? 'opacity-40' : ''}`}>
      {name}
    </button>
  );
};

const TaskRow = ({ task, onToggleDone, onClientClick, onTaskClick, showClient = true }) => (
  <tr className={`border-b border-slate-50 transition-all duration-150 group ${
    task.done ? 'opacity-40' : task.date < TODAY ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50/80'
  }`}>
    <td className="pl-5 pr-3 py-3.5">
      <DoneCheckbox done={task.done} onToggle={() => onToggleDone(task.id)} />
    </td>
    {showClient && (
      <td className="px-3 py-3.5">
        <ClientBadge name={task.client} onClick={() => onClientClick(task.client)} done={task.done} />
      </td>
    )}
    <td className="px-3 py-3.5 cursor-pointer" onClick={() => onTaskClick && onTaskClick(task)}>
      <div className="flex items-center gap-2">
        <span className={`text-sm text-slate-700 leading-snug ${task.done ? 'line-through text-slate-300' : ''}`}>
          {task.task}
        </span>
        {task.notes && <span className="text-slate-300 text-xs flex-shrink-0">📝</span>}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 text-xs flex-shrink-0">✏</span>
      </div>
    </td>
    <td className="px-3 py-3.5">
      <span className="text-xs text-slate-400">{PLATFORM_ICONS[task.platform]} {task.platform}</span>
    </td>
    <td className="px-3 py-3.5">
      {!task.done && (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getUrgencyColor(task.urgency)}`}>
          {task.urgency}
        </span>
      )}
    </td>
    <td className="px-3 py-3.5">
      {!task.done && (
        task.status === 'בביצוע' ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-blue-600">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>בביצוע
          </span>
        ) : (
          <span className={`text-xs font-medium ${getStatusStyle(task.status)}`}>{task.status}</span>
        )
      )}
    </td>
    <td className={`px-3 py-3.5 text-xs font-mono ${
      task.done ? 'text-slate-300 line-through' : task.date < TODAY ? 'text-red-500 font-bold' : 'text-slate-400'
    }`}>
      {task.date}
    </td>
  </tr>
);

// ─── Task Detail Modal ───────────────────────────────────────────────────────
const TaskDetailModal = ({ task, clients, onClose, onSave, onDelete, onLinkToCalendar }) => {
  const [form, setForm] = useState({ ...task });
  const [linkedToCalendar, setLinkedToCalendar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => { onSave(form); onClose(); };

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

  const Field = ({ label, children }) => (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-screen overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`px-6 pt-5 pb-4 border-b border-gray-50 ${task.urgency === 'גבוהה' ? 'bg-red-50' : task.urgency === 'בינונית' ? 'bg-orange-50' : 'bg-blue-50'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-1">{task.client} · {PLATFORM_ICONS[task.platform]} {task.platform}</p>
              <input
                className="text-lg font-bold text-gray-800 bg-transparent border-none outline-none w-full placeholder-gray-300"
                value={form.task}
                onChange={e => setForm(f => ({...f, task: e.target.value}))}
                placeholder="שם המשימה"
              />
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl flex-shrink-0 mt-1">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">

          {/* Row 1: client + platform */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="לקוח">
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.client} onChange={e => setForm(f => ({...f, client: e.target.value}))}>
                <option value="">בחר לקוח</option>
                {clients.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="פלטפורמה">
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.platform} onChange={e => setForm(f => ({...f, platform: e.target.value}))}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>

          {/* Row 2: urgency + status + date */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="דחיפות">
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.urgency} onChange={e => setForm(f => ({...f, urgency: e.target.value}))}>
                {URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="סטטוס">
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="תאריך יעד">
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
            </Field>
          </div>

          {/* Notes */}
          <Field label="📝 הערות">
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              rows={3}
              placeholder="פרטים נוספים, לינקים, הנחיות..."
              value={form.notes || ""}
              onChange={e => setForm(f => ({...f, notes: e.target.value}))}
            />
          </Field>

          {/* Link to calendar */}
          <div className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${linkedToCalendar ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
            <div>
              <p className="text-sm font-medium text-gray-700">📅 לוח תוכן</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {linkedToCalendar ? "המשימה קושרה ללוח התוכן ✓" : "הוסף את המשימה הזו ללוח התוכן"}
              </p>
            </div>
            {!linkedToCalendar ? (
              <button
                onClick={handleLinkCalendar}
                disabled={!form.date}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-full text-xs font-medium hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {form.date ? "קשר ללוח" : "נדרש תאריך"}
              </button>
            ) : (
              <span className="text-green-600 text-sm">✓</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between border-t border-gray-50 pt-4">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500">בטוח?</span>
              <button onClick={() => { onDelete(task.id); onClose(); }} className="px-3 py-1.5 bg-red-500 text-white rounded-full text-xs hover:bg-red-600">מחק</button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700">ביטול</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">🗑 מחק משימה</button>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">ביטול</button>
            <button onClick={handleSave} className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors">שמור</button>
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
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 text-lg">‹</button>
          <h2 className="text-xl font-bold text-gray-800 min-w-32 text-center">{HEBREW_MONTHS[viewMonth]} {viewYear}</h2>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 text-lg">›</button>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="flex gap-3 text-xs text-gray-500">
            {Object.entries(CAL_ITEM_COLORS).map(([key, c]) => (
              <span key={key} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${c.dot}`}></span>{c.label}</span>
            ))}
          </div>
          <button onClick={() => { setDayModal({ dateStr: TODAY, items: calItems.filter(i => i.date === TODAY) }); setAddForm({...emptyForm}); }} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            + הוסף תוכן
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {HEBREW_DAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400">{d}</div>
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
                className={`min-h-20 p-1.5 border-b border-l border-gray-50 transition-colors ${
                  day ? 'cursor-pointer hover:bg-blue-50' : 'bg-gray-50'
                } ${isToday ? 'bg-blue-50' : ''}`}
              >
                {day && (
                  <>
                    <span className={`text-xs font-semibold mb-1 block ${isToday ? 'text-blue-600' : 'text-gray-500'}`}>
                      {isToday ? <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">{day}</span> : day}
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
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => { setDayModal(null); setAddForm(null); }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md max-h-screen overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">{dayModal.dateStr}</h3>
              <button onClick={() => { setDayModal(null); setAddForm(null); }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {/* Items list */}
            {dayModal.items.length === 0 && !addForm && (
              <p className="text-sm text-gray-400 italic mb-4 text-center">אין תוכן מתוכנן ליום זה</p>
            )}
            {dayModal.items.map(item => (
              <div key={item.id} className={`flex items-start justify-between gap-2 p-3 rounded-xl mb-2 ${CAL_ITEM_COLORS[item.type]?.bg}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${CAL_ITEM_COLORS[item.type]?.text}`}>{item.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {CAL_ITEM_COLORS[item.type]?.label}
                    {item.client && ` · ${item.client}`}
                    {item.platform && ` · ${item.platform}`}
                    {item.status && ` · ${item.status}`}
                  </p>
                </div>
                <button onClick={() => { onDeleteItem(item.id); setDayModal(prev => ({ ...prev, items: prev.items.filter(i => i.id !== item.id) })); }} className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0">✕</button>
              </div>
            ))}

            {/* Add form */}
            {addForm ? (
              <div className="border-t border-gray-100 pt-4 mt-2 flex flex-col gap-3">
                <p className="text-xs font-semibold text-gray-600">הוספת תוכן</p>
                <div className="flex gap-2">
                  {Object.entries(CAL_ITEM_COLORS).map(([key, c]) => (
                    <button key={key} onClick={() => setAddForm(f => ({...f, type: key}))}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${addForm.type === key ? `${c.bg} ${c.text} border-current` : 'bg-white text-gray-400 border-gray-200'}`}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="כותרת / תיאור" value={addForm.title} onChange={e => setAddForm(f => ({...f, title: e.target.value}))} autoFocus />
                {addForm.type !== 'holiday' && (
                  <div className="grid grid-cols-2 gap-2">
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={addForm.client} onChange={e => setAddForm(f => ({...f, client: e.target.value}))}>
                      <option value="">לקוח (אופציונלי)</option>
                      {clients.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={addForm.platform} onChange={e => setAddForm(f => ({...f, platform: e.target.value}))}>
                      {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
                {addForm.type === 'post' && (
                  <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={addForm.status} onChange={e => setAddForm(f => ({...f, status: e.target.value}))}>
                    {["טיוטה","ממתין לאישור","מאושר","פורסם"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAddForm(null)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">ביטול</button>
                  <button onClick={submitAdd} disabled={!addForm.title.trim()} className="px-4 py-1.5 bg-blue-600 text-white rounded-full text-sm hover:bg-blue-700 disabled:opacity-40">הוסף</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddForm({...emptyForm})} className="w-full mt-3 py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
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
    {/* Wordmark */}
    <svg
      viewBox="0 0 108 36"
      xmlns="http://www.w3.org/2000/svg"
      style={{ height: showTagline ? 32 : 22, width: 'auto', display: 'block' }}
      aria-label="LUMA"
    >
      <defs>
        {/* Crystalline gradient matching the actual logo: cyan→blue→purple */}
        <linearGradient id="lumaAGrad" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#22d3ee" />
          <stop offset="40%"  stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        {/* Geometric line texture inside the A */}
        <clipPath id="lumaAClip">
          <text x="78" y="32" fontFamily="'Helvetica Neue',Arial,sans-serif" fontWeight="900" fontSize="36">A</text>
        </clipPath>
      </defs>
      {/* LUM in black */}
      <text
        x="0" y="32"
        fontFamily="'Helvetica Neue',Helvetica,Arial,sans-serif"
        fontWeight="900"
        fontSize="36"
        letterSpacing="-1"
        fill="#111"
      >LUM</text>
      {/* A base with gradient */}
      <text
        x="78" y="32"
        fontFamily="'Helvetica Neue',Helvetica,Arial,sans-serif"
        fontWeight="900"
        fontSize="36"
        letterSpacing="-1"
        fill="url(#lumaAGrad)"
      >A</text>
      {/* Geometric crystalline lines clipped to the A shape */}
      <g clipPath="url(#lumaAClip)" opacity="0.35">
        <line x1="78" y1="32" x2="108" y2="0"  stroke="white" strokeWidth="1"/>
        <line x1="84" y1="32" x2="108" y2="8"  stroke="white" strokeWidth="0.8"/>
        <line x1="90" y1="32" x2="108" y2="16" stroke="white" strokeWidth="0.8"/>
        <line x1="96" y1="0"  x2="78"  y2="24" stroke="white" strokeWidth="0.7"/>
        <line x1="108" y1="4" x2="82"  y2="32" stroke="white" strokeWidth="0.7"/>
      </g>
    </svg>
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

const Sidebar = ({ screen, setScreen, user, onSignOut, onOpenAdmin }) => {
  const isAdmin = user?.role === "admin" || user?.provider === "google";
  const initials = (user?.name || "U").trim().charAt(0).toUpperCase();

  return (
    <aside
      dir="rtl"
      style={{
        width: 68,
        minWidth: 68,
        background: 'linear-gradient(180deg, #0f172a 0%, #1a1040 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100vh',
        position: 'sticky',
        top: 0,
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: 12,
        zIndex: 10,
      }}
    >
      {/* Logo mark */}
      <div style={{
        width: '100%', padding: '18px 0 14px',
        display: 'flex', justifyContent: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style={{ width: 32, height: 32 }}>
          <defs>
            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee"/>
              <stop offset="50%" stopColor="#6366f1"/>
              <stop offset="100%" stopColor="#a855f7"/>
            </linearGradient>
          </defs>
          <rect width="36" height="36" rx="10" fill="url(#logoGrad)" opacity="0.15"/>
          <text x="5" y="27" fontFamily="'Helvetica Neue',Arial,sans-serif" fontWeight="900" fontSize="22" letterSpacing="-1" fill="white">L</text>
          <text x="17" y="27" fontFamily="'Helvetica Neue',Arial,sans-serif" fontWeight="900" fontSize="22" letterSpacing="-1" fill="url(#logoGrad)">A</text>
        </svg>
      </div>

      {/* Nav icons */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 0', width: '100%' }}>
        {NAV_ITEMS.map(item => {
          const active = screen === item.id;
          const colors = NAV_COLORS[item.id] || NAV_COLORS.home;
          return (
            <div key={item.id} style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
              {/* Active indicator bar on right */}
              {active && (
                <span style={{
                  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 28, borderRadius: '0 3px 3px 0',
                  background: `linear-gradient(180deg, ${colors.from}, ${colors.to})`,
                  boxShadow: `0 0 8px ${colors.glow}`,
                }}/>
              )}
              <button
                onClick={() => setScreen(item.id)}
                title={item.label}
                style={{
                  width: 44, height: 44, borderRadius: 12, cursor: 'pointer', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.18s',
                  background: active
                    ? `linear-gradient(135deg, ${colors.from}33, ${colors.to}22)`
                    : 'transparent',
                  color: active ? colors.from : 'rgba(255,255,255,0.35)',
                  boxShadow: active ? `0 0 16px ${colors.glow}` : 'none',
                  transform: active ? 'scale(1.08)' : 'scale(1)',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.75)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.icon}
                </span>
              </button>
            </div>
          );
        })}

        {/* Divider */}
        <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

        {/* Admin gear */}
        {isAdmin && (
          <button
            onClick={onOpenAdmin}
            title="ניהול"
            style={{
              width: 44, height: 44, borderRadius: 12, cursor: 'pointer', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', color: 'rgba(255,255,255,0.25)', transition: 'all 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 18, height: 18 }}>
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
            </svg>
          </button>
        )}
      </nav>

      {/* User avatar + sign out */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {/* Avatar with gradient ring */}
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: 14,
            boxShadow: '0 0 0 2px rgba(99,102,241,0.3), 0 0 12px rgba(168,85,247,0.25)',
            cursor: 'default',
          }} title={user?.name || "משתמש"}>
            {initials}
          </div>
          {isAdmin && (
            <span style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 12, height: 12, borderRadius: '50%',
              background: '#6366f1', border: '2px solid #0f172a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 7, color: 'white', fontWeight: 700,
            }}>★</span>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={onSignOut}
          title="יציאה"
          style={{
            width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', color: 'rgba(255,255,255,0.2)', transition: 'all 0.15s',
            fontSize: 15,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; }}
        >↩</button>
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
const BottomNav = ({ screen, setScreen, user, onSignOut, onOpenAdmin }) => {
  const isAdmin = user?.role === "admin" || user?.provider === "google";
  return (
    <nav dir="rtl" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'white',
      borderTop: '1px solid #e2e8f0',
      display: 'flex', alignItems: 'center',
      padding: '0 4px',
      height: 60,
      paddingBottom: 'env(safe-area-inset-bottom)',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.07)',
    }}>
      {NAV_ITEMS.map(item => {
        const active = screen === item.id;
        const colors = NAV_COLORS[item.id] || NAV_COLORS.home;
        return (
          <button
            key={item.id}
            onClick={() => setScreen(item.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 3, padding: '6px 0', border: 'none', background: 'transparent',
              cursor: 'pointer', transition: 'all 0.15s',
              color: active ? colors.from : '#94a3b8',
            }}
          >
            <span style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, letterSpacing: '0.01em' }}>{item.label}</span>
            {active && <span style={{ width: 18, height: 2.5, borderRadius: 2, background: colors.from, position: 'absolute', bottom: 6 }}/>}
          </button>
        );
      })}
      {/* Admin + sign-out for mobile */}
      {isAdmin && (
        <button
          onClick={onOpenAdmin}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '6px 0', border: 'none', background: 'transparent',
            cursor: 'pointer', color: '#94a3b8',
          }}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 20, height: 20 }}>
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
          </svg>
          <span style={{ fontSize: 10 }}>ניהול</span>
        </button>
      )}
      <button
        onClick={onSignOut}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 3, padding: '6px 0', border: 'none', background: 'transparent',
          cursor: 'pointer', color: '#94a3b8',
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>↩</span>
        <span style={{ fontSize: 10 }}>יציאה</span>
      </button>
    </nav>
  );
};

// ── Layout wrapper ──────────────────────────────────────────────────────────
const Layout = ({ screen, setScreen, user, onSignOut, onOpenAdmin, children }) => {
  const mobile = useMobile();
  return (
    <div dir="rtl" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f1f5f9' }}>
      <main style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden', background: '#f1f5f9',
        paddingBottom: mobile ? 64 : 0,
      }}>
        {children}
      </main>
      {mobile
        ? <BottomNav screen={screen} setScreen={setScreen} user={user} onSignOut={onSignOut} onOpenAdmin={onOpenAdmin} />
        : <Sidebar screen={screen} setScreen={setScreen} user={user} onSignOut={onSignOut} onOpenAdmin={onOpenAdmin} />
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
    insights.push({ icon: '🔁', color: 'purple', text: `"${recurring[0]}" מופיעה ${recurring[1]} פעמים — שקול ליצור תבנית משימה קבועה` });
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

const AIInsightsPanel = ({ tasks, clientsData }) => {
  const insights = analyzePatterns(tasks, clientsData);
  if (insights.length === 0) return null;
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">תובנות AI 🤖</p>
      <div className="flex flex-col gap-2">
        {insights.map((ins, i) => (
          <div key={i} className={`flex items-start gap-2 text-sm px-3 py-2 rounded-xl border ${AI_COLORS[ins.color] || AI_COLORS.gray}`}>
            <span className="flex-shrink-0 mt-0.5">{ins.icon}</span>
            <span>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Claude AI Chat ─────────────────────────────────────────────────────────
const ClaudeChat = ({ tasks, clientsData, isOpen, onClose, onOpen }) => {
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

  if (!isOpen) {
    return (
      <button
        onClick={onOpen}
        className="fixed bottom-6 left-6 z-50 bg-gradient-to-br from-purple-600 to-blue-500 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg hover:scale-110 transition-transform text-2xl"
        title="שאל קלוד AI"
      >
        🤖
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 left-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ maxHeight: '520px' }} dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-500 flex-shrink-0">
        <div className="flex items-center gap-2 text-white">
          <span className="text-lg">🤖</span>
          <span className="font-semibold text-sm">קלוד AI — עוזר שיווק</span>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
      </div>

      {!keyEntered ? (
        <div className="p-4 flex flex-col gap-3">
          <p className="text-sm text-gray-600 leading-relaxed">הכנס מפתח API של Anthropic כדי לשוחח עם קלוד על המשימות שלך:</p>
          <input
            type="password"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="sk-ant-api03-..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && apiKey.startsWith('sk-') && setKeyEntered(true)}
          />
          <p className="text-xs text-gray-400">המפתח נשמר בזיכרון הסשן בלבד ולא מועבר לשום מקום אחר</p>
          <button
            onClick={() => setKeyEntered(true)}
            disabled={!apiKey.startsWith('sk-')}
            className="bg-purple-600 text-white rounded-full py-2 text-sm font-medium disabled:opacity-40 hover:bg-purple-700 transition-colors"
          >
            התחל שיחה
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2" style={{ minHeight: '200px', maxHeight: '320px' }}>
            {messages.length === 0 && (
              <div className="text-center text-gray-400 text-xs mt-3 flex flex-col items-center gap-2">
                <div className="text-3xl">💡</div>
                <p className="text-gray-500">שאל אותי על המשימות, הלקוחות, או תכנון השבוע</p>
                <div className="flex flex-col gap-1 mt-1 w-full">
                  {QUICK_QUESTIONS.map(q => (
                    <button key={q} onClick={() => setInput(q)} className="text-purple-500 text-xs hover:text-purple-700 hover:underline text-right">▶ {q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`text-sm px-3 py-2 rounded-xl whitespace-pre-wrap leading-relaxed max-w-[92%] ${m.role === 'user' ? 'bg-purple-600 text-white self-start' : 'bg-gray-100 text-gray-800 self-end'}`}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="bg-gray-100 text-gray-500 text-xs px-3 py-2 rounded-xl self-end">⏳ קלוד חושב...</div>
            )}
            {error && <div className="text-red-500 text-xs px-2 py-1 bg-red-50 rounded-lg">{error}</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-100 p-2 flex gap-2 flex-shrink-0">
            <input
              className="flex-1 border border-gray-200 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:border-purple-400"
              placeholder="שאל שאלה..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="bg-purple-600 text-white rounded-full w-8 h-8 flex items-center justify-center disabled:opacity-40 flex-shrink-0 hover:bg-purple-700 transition-colors text-sm"
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
const HomeScreen = ({ tasks, clientsData, onGoToTasks, onGoToClients, onSelectClient, onAddTask, user }) => {
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

  const KpiCard = ({ label, value, sub, accent, icon }) => (
    <div style={{ background: 'white', borderRadius: 14, padding: '20px 22px', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderRight: `3px solid ${accent}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, marginBottom: 4 }}>{label}</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>{sub}</p>}
        </div>
        <div style={{ fontSize: 22, opacity: 0.15 }}>{icon}</div>
      </div>
    </div>
  );

  return (
    <div style={{ background: '#f8fafc', minHeight: '100%', padding: '28px 32px' }} dir="rtl">

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>
              שלום, {user?.name?.split(' ')[0] || 'Slav'} 👋
            </h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>יום {dayName} · {d}/{m}/{y}</p>
          </div>
          <button
            onClick={onAddTask}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              color: 'white', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
            }}
          >
            <span style={{ fontSize: 16 }}>+</span> משימה חדשה
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard label="משימות פתוחות" value={activeTasks.length} sub={`${overdue.length} באיחור`} accent="#6366f1" icon="≡" />
        <KpiCard label="דחוף ומיידי" value={highUrgency.length} sub="דורש טיפול עכשיו" accent="#ef4444" icon="⚡" />
        <KpiCard label="ממתין לאישור" value={waiting.length} sub="לקוחות ממתינים" accent="#f59e0b" icon="⏳" />
        <KpiCard label="אחוז השלמה" value={`${doneRate}%`} sub={`${doneTasks.length} מתוך ${tasks.length} בוצעו`} accent="#10b981" icon="✓" />
      </div>

      {/* Progress bar */}
      {tasks.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, padding: '16px 22px', border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>התקדמות כוללת</span>
            <span style={{ fontSize: 13, color: '#6366f1', fontWeight: 700 }}>{doneRate}%</span>
          </div>
          <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${doneRate}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)', borderRadius: 99, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            {[
              { label: 'לביצוע', count: activeTasks.filter(t=>t.status==='לביצוע').length, color: '#94a3b8' },
              { label: 'בביצוע', count: activeTasks.filter(t=>t.status==='בביצוע').length, color: '#6366f1' },
              { label: 'ממתין', count: waiting.length, color: '#f59e0b' },
              { label: 'בוצע', count: doneTasks.length, color: '#10b981' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }}></span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.label} <strong style={{ color: '#475569' }}>{s.count}</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2-col grid: urgent + upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>

        {/* Urgent tasks */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f8fafc' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: 0 }}>🔥 דחוף ומיידי</h3>
            <button onClick={onGoToTasks} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>כל המשימות ←</button>
          </div>
          {[...todayTasks, ...highUrgency.filter(t => !todayTasks.includes(t))].slice(0, 5).length === 0 ? (
            <p style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 13, padding: '24px 0', fontStyle: 'italic' }}>אין משימות דחופות 🎉</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {[...todayTasks, ...highUrgency.filter(t => !todayTasks.includes(t))].slice(0, 5).map(task => (
                <li key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #f8fafc', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.task}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{task.client} · {task.platform}</p>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: task.urgency === 'גבוהה' ? '#fef2f2' : '#fff7ed', color: task.urgency === 'גבוהה' ? '#dc2626' : '#ea580c', fontWeight: 600, flexShrink: 0 }}>{task.urgency}</span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ padding: '10px 20px', borderTop: '1px solid #f8fafc' }}>
            <button onClick={onAddTask} style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>+ הוסף משימה</button>
          </div>
        </div>

        {/* Upcoming deadlines */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f8fafc' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: 0 }}>📅 דדליינים קרובים</h3>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>7 ימים קדימה</span>
          </div>
          {upcoming.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 13, padding: '24px 0', fontStyle: 'italic' }}>אין דדליינים קרובים</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {upcoming.map(task => {
                const daysLeft = Math.ceil((new Date(task.date) - new Date(TODAY)) / 86400000);
                const chip = daysLeft === 0 ? { bg: '#f3e8ff', c: '#7c3aed', t: 'היום' } : daysLeft === 1 ? { bg: '#fee2e2', c: '#dc2626', t: 'מחר' } : daysLeft <= 3 ? { bg: '#ffedd5', c: '#ea580c', t: `${daysLeft} ימים` } : { bg: '#f1f5f9', c: '#64748b', t: `${daysLeft} ימים` };
                return (
                  <li key={task.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #f8fafc', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#334155', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.task}</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{task.client}</p>
                    </div>
                    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: chip.bg, color: chip.c, fontWeight: 700, flexShrink: 0 }}>{chip.t}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* 2-col: client load + AI insights */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* Client workload */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f8fafc' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: 0 }}>👥 עומס לפי לקוח</h3>
            <button onClick={onGoToClients} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>כל הלקוחות ←</button>
          </div>
          {clientLoad.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#cbd5e1', fontSize: 13, padding: '24px 0', fontStyle: 'italic' }}>אין משימות פעילות</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {clientLoad.map(({ name, count, urgent }) => {
                const pct = Math.round((count / clientLoad[0].count) * 100);
                return (
                  <li key={name} style={{ padding: '10px 20px', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }} onClick={() => onSelectClient(name)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{name}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {urgent > 0 && <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>⚡ {urgent}</span>}
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{count} משימות</span>
                      </div>
                    </div>
                    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: urgent > 0 ? 'linear-gradient(90deg, #f87171, #ef4444)' : 'linear-gradient(90deg, #818cf8, #6366f1)', borderRadius: 99 }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <AIInsightsPanel tasks={tasks} clientsData={clientsData} />

      </div>
    </div>
  );
};

// ─── New Client Modal (shared) ────────────────────────────────────────────────
const NewClientModal = ({ newClientForm, setNewClientForm, emptyClientForm, onClose, onAdd }) => (
  <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
    <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" dir="rtl" onClick={e => e.stopPropagation()}>
      <h2 className="text-lg font-bold text-gray-800 mb-5">➕ הקמת לקוח חדש</h2>
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">שם הלקוח <span className="text-red-400">*</span></label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="שם הלקוח" value={newClientForm.name} onChange={e => setNewClientForm(f => ({ ...f, name: e.target.value }))} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">📞 טלפון</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="05X-XXXXXXX" value={newClientForm.phone} onChange={e => setNewClientForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">✉️ דוא"ל</label>
            <input type="email" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="email@example.com" value={newClientForm.email} onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">🌐 אתר</label>
          <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="www.example.com" value={newClientForm.website} onChange={e => setNewClientForm(f => ({ ...f, website: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">📝 הערות</label>
          <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" rows={3} placeholder="פרטים נוספים על הלקוח..." value={newClientForm.notes} onChange={e => setNewClientForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2 mt-5 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">ביטול</button>
        <button onClick={onAdd} disabled={!newClientForm.name.trim()} className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">הוסף לקוח</button>
      </div>
    </div>
  </div>
);

// ─── Clients List Screen ─────────────────────────────────────────────────────
const ClientsListScreen = ({ clientsData, tasks, onSelectClient, onAddClient }) => {
  const clients = Object.keys(clientsData);

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">רשימת לקוחות</h2>
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
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-blue-100 transition-all group"
              >
                {/* Card header */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                    {name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">{name}</h3>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {activePlatforms.slice(0, 3).map(p => (
                        <span key={p} className="text-xs text-gray-400">{PLATFORM_ICONS[p]}</span>
                      ))}
                      {activePlatforms.length === 0 && <span className="text-xs text-gray-300 italic">אין פלטפורמות</span>}
                    </div>
                  </div>
                  <span className="text-gray-300 group-hover:text-blue-400 transition-colors text-xl">←</span>
                </div>

                {/* Contact info */}
                <div className="flex flex-col gap-1 mb-4 text-xs text-gray-400">
                  {data.phone && <span>📞 {data.phone}</span>}
                  {data.email && <span>✉️ {data.email}</span>}
                  {data.website && <span>🌐 {data.website}</span>}
                  {!data.phone && !data.email && !data.website && (
                    <span className="italic text-gray-300">אין פרטי קשר</span>
                  )}
                </div>

                {/* Notes preview */}
                {data.notes && (
                  <p className="text-xs text-gray-400 italic mb-4 line-clamp-1 border-r-2 border-gray-100 pr-2">
                    {data.notes}
                  </p>
                )}

                {/* Stats chips */}
                <div className="flex gap-2 flex-wrap border-t border-gray-50 pt-3">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-medium">
                    {clientTasks.length} משימות פתוחות
                  </span>
                  {highUrgency > 0 && (
                    <span className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-full font-medium">
                      {highUrgency} דחוף
                    </span>
                  )}
                  {waiting > 0 && (
                    <span className="text-xs bg-orange-50 text-orange-500 px-2.5 py-1 rounded-full font-medium">
                      {waiting} ממתין לאישור
                    </span>
                  )}
                  {clientTasks.length === 0 && (
                    <span className="text-xs bg-green-50 text-green-500 px-2.5 py-1 rounded-full font-medium">✓ נקי</span>
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

// ─── Client Detail Screen ────────────────────────────────────────────────────
const ClientScreen = ({ clientName, clientData, tasks, onBack, onAddTask, onToggleDone, onSaveClientData, onTaskClick }) => {
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ ...clientData });

  const allClientTasks = tasks.filter(t => t.client === clientName);
  const activeTasks = allClientTasks.filter(t => !t.done);
  const doneTasks = allClientTasks.filter(t => t.done);
  const overdue = activeTasks.filter(t => t.date < TODAY);
  const activePlatforms = [...new Set(allClientTasks.map(t => t.platform))];

  const COL_HEADERS = ["", "משימה", "פלטפורמה", "דחיפות", "סטטוס", "תאריך יעד"];

  const handleSave = () => {
    onSaveClientData(clientName, editForm);
    setEditMode(false);
  };

  const data = editMode ? editForm : clientData;

  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 mb-6 transition-colors">
        <span className="text-lg">→</span> חזרה לכל המשימות
      </button>

      {/* Client header card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-sm">
              {clientName.charAt(0)}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{clientName}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {activePlatforms.map(p => (
                  <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {PLATFORM_ICONS[p] || "📋"} {p}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Edit / Save buttons */}
          <div className="flex gap-2">
            {editMode ? (
              <>
                <button onClick={() => { setEditMode(false); setEditForm({ ...clientData }); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-full bg-white">ביטול</button>
                <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors">שמור</button>
              </>
            ) : (
              <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-full bg-white hover:bg-gray-50 transition-colors">
                ✏️ עריכת פרטים
              </button>
            )}
          </div>
        </div>

        {/* Contact fields */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: "📞", label: "טלפון", key: "phone" },
            { icon: "✉️", label: 'דוא"ל', key: "email" },
            { icon: "🌐", label: "אתר", key: "website" },
          ].map(({ icon, label, key }) => (
            <div key={key}>
              <p className="text-xs text-gray-400 mb-1">{icon} {label}</p>
              {editMode ? (
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={editForm[key]}
                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={`הזן ${label}`}
                />
              ) : (
                <p className={`text-sm ${data[key] ? 'text-gray-700' : 'text-gray-300 italic'}`}>{data[key] || "לא הוזן"}</p>
              )}
            </div>
          ))}
        </div>

        {/* Notes */}
        <div className="mt-4 pt-4 border-t border-gray-50">
          <p className="text-xs text-gray-400 mb-1">📝 הערות</p>
          {editMode ? (
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
              rows={3}
              value={editForm.notes}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="הוסף הערות על הלקוח..."
            />
          ) : (
            <p className={`text-sm ${data.notes ? 'text-gray-500' : 'text-gray-300 italic'}`}>{data.notes || "אין הערות"}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{activeTasks.length}</p>
          <p className="text-xs text-gray-400 mt-1">משימות פתוחות</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{activeTasks.filter(t => t.urgency === 'גבוהה').length}</p>
          <p className="text-xs text-gray-400 mt-1">דחיפות גבוהה</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-green-500">{doneTasks.length}</p>
          <p className="text-xs text-gray-400 mt-1">בוצעו</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{overdue.length}</p>
          <p className="text-xs text-gray-400 mt-1">פג תוקף</p>
        </div>
      </div>

      {/* Tasks table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50">
          <h3 className="font-semibold text-gray-700">משימות</h3>
          <button onClick={onAddTask} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-medium hover:bg-blue-700 transition-colors">
            <span>+</span> משימה חדשה
          </button>
        </div>
        {allClientTasks.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">אין משימות ללקוח זה עדיין</div>
        ) : (
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {COL_HEADERS.map((h, i) => (
                  <th key={i} className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
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
                    <td colSpan={6} className="px-4 pt-5 pb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">✓ בוצעו ({doneTasks.length})</span>
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

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      dir="rtl"
      style={{
        background: "radial-gradient(ellipse at 70% 20%, rgba(139,92,246,0.12) 0%, transparent 60%), radial-gradient(ellipse at 20% 80%, rgba(34,211,238,0.10) 0%, transparent 55%), #f8fafc"
      }}
    >
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-2">
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
            <text x="0" y="48" fontFamily="'Helvetica Neue',Helvetica,Arial,sans-serif" fontWeight="900" fontSize="54" letterSpacing="-1.5" fill="#0f172a">LUM</text>
            <text x="116" y="48" fontFamily="'Helvetica Neue',Helvetica,Arial,sans-serif" fontWeight="900" fontSize="54" letterSpacing="-1.5" fill="url(#loginAGrad)">A</text>
            <g clipPath="url(#loginAClip)" opacity="0.3">
              <line x1="116" y1="48" x2="160" y2="0"  stroke="white" strokeWidth="1.5"/>
              <line x1="125" y1="48" x2="160" y2="12" stroke="white" strokeWidth="1"/>
              <line x1="135" y1="48" x2="160" y2="24" stroke="white" strokeWidth="1"/>
              <line x1="145" y1="0"  x2="116" y2="36" stroke="white" strokeWidth="1"/>
            </g>
          </svg>
          <p className="text-xs tracking-widest text-slate-400 uppercase font-medium">Make Digital Brighter</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-7" style={{ boxShadow: '0 8px 40px rgba(99,102,241,0.10), 0 1px 3px rgba(0,0,0,0.06)' }}>

          {mode === "reset" ? (
            /* ── Reset password view ── */
            <>
              <div className="text-center mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3"
                  style={{ background: 'linear-gradient(135deg,#6366f120,#a855f720)' }}>🔑</div>
                <h2 className="font-bold text-slate-800 text-base">איפוס סיסמה</h2>
                <p className="text-xs text-slate-400 mt-1">נשלח אליך קישור לאיפוס במייל</p>
              </div>
              <div className="flex flex-col gap-3">
                <input
                  type="email"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 transition-all"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleEmailLogin()}
                  autoComplete="email"
                />
                {error && <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 border border-red-100 px-3 py-2 rounded-xl"><span>⚠</span><span>{error}</span></div>}
                {success && <div className="flex items-center gap-2 text-green-600 text-xs bg-green-50 border border-green-100 px-3 py-2 rounded-xl"><span>✅</span><span>{success}</span></div>}
                <button onClick={handleEmailLogin} disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#a855f7)', boxShadow: '0 4px 14px rgba(139,92,246,0.35)' }}>
                  {loading ? "⏳ שולח..." : "שלח קישור לאיפוס"}
                </button>
                <button onClick={() => switchMode("login")} className="text-xs text-slate-400 hover:text-slate-600 text-center mt-1">
                  ← חזרה לכניסה
                </button>
              </div>
            </>
          ) : (
            /* ── Login / Register view ── */
            <>
              {/* Mode toggle */}
              <div className="flex bg-slate-50 rounded-2xl p-1 mb-6 border border-slate-100">
                <button onClick={() => switchMode("login")}
                  className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${mode === "login" ? "bg-white shadow-sm text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
                >כניסה</button>
                <button onClick={() => switchMode("register")}
                  className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${mode === "register" ? "bg-white shadow-sm text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
                >הרשמה</button>
              </div>

              {/* Google */}
              <button onClick={handleGoogle} disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-sm font-medium text-slate-700 shadow-sm disabled:opacity-50 mb-4"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <GoogleIcon />
                {mode === "login" ? "כניסה עם Google" : "הרשמה עם Google"}
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-slate-100"></div>
                <span className="text-xs text-slate-400 font-medium">או</span>
                <div className="flex-1 h-px bg-slate-100"></div>
              </div>

              <div className="flex flex-col gap-3">
                {mode === "register" && (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block">שם מלא</label>
                    <input className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 transition-all"
                      placeholder="Slav Gomelski" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">אימייל</label>
                  <input type="email"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 transition-all"
                    placeholder="you@gmail.com" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleEmailLogin()} autoComplete="email" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-500">סיסמה</label>
                    {mode === "login" && (
                      <button onClick={() => switchMode("reset")}
                        className="text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors">
                        שכחתי סיסמה
                      </button>
                    )}
                  </div>
                  <input type="password"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 transition-all"
                    placeholder={mode === "register" ? "לפחות 6 תווים" : "••••••••"}
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleEmailLogin()}
                    autoComplete={mode === "register" ? "new-password" : "current-password"} />
                </div>
                {error && <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 border border-red-100 px-3 py-2 rounded-xl"><span>⚠</span><span>{error}</span></div>}
                {success && <div className="flex items-center gap-2 text-green-600 text-xs bg-green-50 border border-green-100 px-3 py-2 rounded-xl"><span>✅</span><span>{success}</span></div>}
                <button onClick={handleEmailLogin} disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60 mt-1"
                  style={{ background: loading ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#a855f7)', boxShadow: loading ? 'none' : '0 4px 14px rgba(139,92,246,0.35)' }}>
                  {loading ? "⏳ מתחבר..." : mode === "login" ? "כניסה" : "יצירת חשבון"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">LUMA © 2026 · Make Digital Brighter</p>
      </div>
    </div>
  );
};

// ─── Admin Panel ─────────────────────────────────────────────────────────────
const ROLE_COLORS = {
  admin:  "bg-violet-100 text-violet-700 border-violet-200",
  user:   "bg-slate-100 text-slate-600 border-slate-200",
  blocked:"bg-red-100 text-red-600 border-red-200",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base"
              style={{ background: "linear-gradient(135deg,#6366f1,#a855f7)" }}>⚙</div>
            <div>
              <h2 className="font-bold text-slate-800 text-base leading-tight">ניהול משתמשים</h2>
              <p className="text-xs text-slate-400">LUMA Admin Panel · {users.length} משתמשים מורשים</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors text-lg">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 flex-shrink-0 border-b border-slate-100">
          {[{ id:"users", label:`👥 משתמשים (${users.length})` }, { id:"invite", label:"➕ הוסף משתמש" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-xl border-b-2 transition-all ${tab===t.id ? "border-violet-500 text-violet-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Users tab */}
          {tab === "users" && (
            <div className="flex flex-col gap-2.5">
              {loading && <div className="text-center text-slate-400 py-8 text-sm">⏳ טוען משתמשים...</div>}
              {!loading && users.length === 0 && (
                <div className="text-center text-slate-400 py-8">
                  <p className="text-sm">אין משתמשים ברשימה.</p>
                  <p className="text-xs mt-1">הוסף את עצמך דרך לשונית "הוסף משתמש"</p>
                </div>
              )}
              {users.map(u => (
                <div key={u.id} className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${u.role==="blocked" ? "bg-red-50/50 border-red-100" : "bg-slate-50 border-slate-100 hover:border-slate-200"}`}>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: u.role==="blocked" ? "#94a3b8" : "linear-gradient(135deg,#6366f1,#a855f7)" }}>
                    {(u.display_name || u.email).charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${u.role==="blocked" ? "text-slate-400 line-through" : "text-slate-800"}`}>{u.display_name || u.email.split("@")[0]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[u.role]}`}>{ROLE_LABELS[u.role]}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-300">הוזמן: {formatDate(u.invited_at)}</span>
                      {u.last_seen && <><span className="text-slate-200">·</span><span className="text-xs text-slate-300">נראה: {formatDate(u.last_seen)}</span></>}
                    </div>
                  </div>
                  {/* Actions */}
                  {u.email !== currentUser?.email ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      {u.role !== "blocked" && (
                        <select value={u.role} onChange={e => changeRole(u.email, e.target.value)}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none cursor-pointer">
                          <option value="admin">אדמין</option>
                          <option value="user">משתמש</option>
                        </select>
                      )}
                      <button onClick={() => changeRole(u.email, u.role==="blocked" ? "user" : "blocked")}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${u.role==="blocked" ? "bg-green-50 text-green-600 border-green-200 hover:bg-green-100" : "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100"}`}>
                        {u.role==="blocked" ? "בטל חסימה" : "חסום"}
                      </button>
                      <button onClick={() => sendPasswordReset(u.email)} title="שלח מייל לאיפוס סיסמה"
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${resetMsg===u.email ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-blue-50 text-blue-500 border-blue-100 hover:bg-blue-100"}`}>
                        {resetMsg===u.email ? "✓ נשלח" : "🔑 איפוס"}
                      </button>
                      {confirmRemove === u.email ? (
                        <div className="flex gap-1">
                          <button onClick={() => removeUser(u.email)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600">מחק ✓</button>
                          <button onClick={() => setConfirmRemove(null)} className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500">ביטול</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemove(u.email)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-500 border border-red-100 hover:bg-red-100 font-medium">הסר</button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 italic flex-shrink-0 bg-slate-100 px-2 py-1 rounded-lg">אתה</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add user tab */}
          {tab === "invite" && (
            <div className="max-w-md flex flex-col gap-4">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-700 leading-relaxed">
                <p className="font-semibold mb-1">איך זה עובד?</p>
                <p className="text-xs text-blue-600">הוסף אימייל לרשימה המורשית. המשתמש יוכל להירשם עם האימייל הזה ולהיכנס למערכת. אם תסיר אותו — הגישה שלו תיחסם אוטומטית.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">שם תצוגה</label>
                  <input className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400"
                    placeholder="שם מלא" value={inviteName} onChange={e => setInviteName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">כתובת אימייל *</label>
                  <input type="email"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400"
                    placeholder="user@email.com" value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && addToAllowlist()} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">תפקיד</label>
                <div className="flex gap-2">
                  {[{ v:"user", l:"משתמש", d:"גישה לנתונים שלו בלבד" }, { v:"admin", l:"אדמין", d:"גישה מלאה + ניהול" }].map(r => (
                    <button key={r.v} onClick={() => setInviteRole(r.v)}
                      className={`flex-1 p-3 rounded-xl border-2 text-right transition-all ${inviteRole===r.v ? "border-violet-400 bg-violet-50" : "border-slate-100 bg-slate-50 hover:border-slate-200"}`}>
                      <p className={`text-sm font-semibold ${inviteRole===r.v ? "text-violet-700" : "text-slate-700"}`}>{r.l}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{r.d}</p>
                    </button>
                  ))}
                </div>
              </div>
              {inviteMsg && (
                <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${inviteMsg.startsWith("✓") ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-orange-600 bg-orange-50 border-orange-200"}`}>
                  {inviteMsg}
                </div>
              )}
              <button onClick={addToAllowlist} disabled={inviteLoading || !inviteEmail.includes("@")}
                className="py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
                style={{ background:"linear-gradient(135deg,#6366f1,#a855f7)", boxShadow:"0 4px 14px rgba(139,92,246,0.3)" }}>
                {inviteLoading ? "⏳ מוסיף..." : "➕ הוסף לרשימה המורשית"}
              </button>
            </div>
          )}
        </div>
      </div>
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
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbLoading, setDbLoading] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [calItems, setCalItems] = useState(HOLIDAYS);
  const [clientsData, setClientsData] = useState({});

  const [showAdmin, setShowAdmin] = useState(false);
  const [screen, setScreen] = useState("home");
  const [chatOpen, setChatOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState("כל הלקוחות");
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [newTask, setNewTask] = useState(emptyTask);

  const emptyClientForm = { name: "", phone: "", email: "", website: "", notes: "" };
  const [newClientForm, setNewClientForm] = useState(emptyClientForm);

  const currentUser = user ? {
    name: user.user_metadata?.full_name || user.email?.split("@")[0] || "משתמש",
    email: user.email,
    role: "admin",
    provider: user.app_metadata?.provider || "email"
  } : null;

  // ── Auth listener with allowed_users gate ──
  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }

    const checkAccess = async (sessionUser) => {
      if (!sessionUser) return null;
      const { data } = await supabase.from("allowed_users").select("role, display_name").eq("email", sessionUser.email).single();
      if (!data || data.role === "blocked") {
        await supabase.auth.signOut();
        setAccessBlocked(true);
        return null;
      }
      // Update last_seen
      supabase.from("allowed_users").update({ last_seen: new Date().toISOString() }).eq("email", sessionUser.email);
      setAccessBlocked(false);
      return sessionUser;
    };

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        const u = await checkAccess(session?.user ?? null);
        setUser(u);
      } catch (e) {
        console.error('Auth check error:', e);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      try {
        const u = await checkAccess(session?.user ?? null);
        setUser(u);
      } catch (e) {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Load data when user logs in ──
  useEffect(() => {
    if (!user || !supabase) return;
    setDbLoading(true);
    Promise.all([loadTasks(), loadClients(), loadCalItems()]).finally(() => setDbLoading(false));
  }, [user]);

  const loadTasks = async () => {
    const { data } = await supabase.from("tasks").select("*").order("created_at");
    if (data) setTasks(data);
  };

  const loadClients = async () => {
    const { data } = await supabase.from("clients").select("*").order("name");
    if (data) {
      const map = {};
      data.forEach(c => { map[c.name] = { phone: c.phone, email: c.email, website: c.website, notes: c.notes, _id: c.id }; });
      setClientsData(map);
    }
  };

  const loadCalItems = async () => {
    const { data } = await supabase.from("cal_items").select("*").order("date");
    if (data) setCalItems([...HOLIDAYS, ...data]);
  };

  const clients = Object.keys(clientsData);

  const toggleDone = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const newDone = !task.done;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: newDone } : t));
    if (supabase) await supabase.from("tasks").update({ done: newDone }).eq("id", id);
  };

  const updateTask = async (updated) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
    if (supabase) {
      const { id, ...rest } = updated;
      await supabase.from("tasks").update(rest).eq("id", id);
    }
  };

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    if (supabase) await supabase.from("tasks").delete().eq("id", id);
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

  const saveClientData = async (name, data) => {
    setClientsData(prev => ({ ...prev, [name]: data }));
    if (supabase) {
      const existing = clientsData[name];
      if (existing?._id) {
        const { _id, ...rest } = data;
        await supabase.from("clients").update(rest).eq("id", existing._id);
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
      <div className="text-slate-400 text-lg">⏳ טוען...</div>
    </div>
  );

  if (!supabase || !user) return <LoginScreen accessBlocked={accessBlocked} />;

  if (dbLoading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
      <div className="text-slate-400 text-lg">⏳ טוען נתונים...</div>
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

  const baseFiltered = activeFilter === "כל הלקוחות" ? tasks : tasks.filter(t => t.client === activeFilter);
  const activeFiltered = baseFiltered.filter(t => !t.done);
  const doneFiltered = baseFiltered.filter(t => t.done);


  const COL_HEADERS = ["", "לקוח", "משימה", "פלטפורמה", "דחיפות", "סטטוס", "תאריך יעד"];

  // ── Shared task detail modal (rendered on top of any screen) ──
  const taskDetailModal = selectedTask ? (
    <TaskDetailModal
      task={selectedTask}
      clients={clients}
      onClose={() => setSelectedTask(null)}
      onSave={(updated) => { updateTask(updated); setSelectedTask(null); }}
      onDelete={(id) => { deleteTask(id); setSelectedTask(null); }}
      onLinkToCalendar={(item) => setCalItems(prev => [...prev, item])}
    />
  ) : null;

  // ── Shared new-task modal (reused across screens) ──
  const newTaskModal = showTaskModal && (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => setShowTaskModal(false)}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" dir="rtl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-800 mb-4">➕ משימה חדשה</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">לקוח</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={newTask.client} onChange={e => setNewTask(p => ({...p, client: e.target.value}))}>
              <option value="">בחר לקוח</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">תיאור משימה</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="מה צריך לעשות?" value={newTask.task} onChange={e => setNewTask(p => ({...p, task: e.target.value}))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">פלטפורמה</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={newTask.platform} onChange={e => setNewTask(p => ({...p, platform: e.target.value}))}>
                {PLATFORMS.map(pl => <option key={pl} value={pl}>{pl}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">דחיפות</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={newTask.urgency} onChange={e => setNewTask(p => ({...p, urgency: e.target.value}))}>
                {URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">סטטוס</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={newTask.status} onChange={e => setNewTask(p => ({...p, status: e.target.value}))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">תאריך יעד</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={newTask.date} onChange={e => setNewTask(p => ({...p, date: e.target.value}))} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">ביטול</button>
          <button onClick={addTask} className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition-colors">הוסף משימה</button>
        </div>
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
            setSelectedClient(null);
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
          />
          {newTaskModal}
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
    <div className="p-6">

      {/* Header Row 1 */}
      <header className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">משימות</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 text-sm">
              <span className="text-gray-400">משימות פתוחות</span>
              <span className="font-bold text-blue-600">{activeTasks.length}</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 text-sm">
              <span className="text-gray-400">דחיפות גבוהה</span>
              <span className="font-bold text-red-500">{activeTasks.filter(t => t.urgency === 'גבוהה').length}</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 text-sm">
              <span className="text-gray-400">ממתין לאישור</span>
              <span className="font-bold text-orange-500">{pipeline.waiting}</span>
            </div>
            {doneTasks.length > 0 && (
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 text-sm">
                <span className="text-gray-400">בוצעו היום</span>
                <span className="font-bold text-green-500">{doneTasks.length}</span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100 text-sm">
              <span className="text-gray-400">הספק שבועי</span>
              <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-2 bg-green-500 rounded-full" style={{ width: '65%' }}></div>
              </div>
              <span className="font-bold text-green-600">65%</span>
            </div>
          </div>
        </div>

        {/* Header Row 2 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg text-xs text-blue-700">
              <span>📅</span>
              <span><strong>{thisWeek.length}</strong> משימות השבוע</span>
            </div>
            {overdue.length > 0 && (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg text-xs text-red-700">
                <span>⚠️</span>
                <span><strong>{overdue.length}</strong> משימות פג תוקף</span>
              </div>
            )}
            <div className="flex items-center gap-2 bg-white border border-gray-100 px-3 py-1.5 rounded-lg text-xs shadow-sm">
              <span className="text-gray-400">pipeline:</span>
              <span className="text-gray-500">לביצוע <strong className="text-gray-700">{pipeline.todo}</strong></span>
              <span className="text-gray-300">|</span>
              <span className="text-blue-500">בביצוע <strong>{pipeline.doing}</strong></span>
              <span className="text-gray-300">|</span>
              <span className="text-orange-500">ממתין <strong>{pipeline.waiting}</strong></span>
            </div>
            {nextTask && (
              <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-100 px-3 py-1.5 rounded-lg text-xs text-purple-700">
                <span>🔔</span>
                <span>הבא: <strong>{nextTask.client}</strong> — {nextTask.date}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowClientModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-full text-sm font-medium shadow-sm hover:bg-gray-50 transition-colors">
              <span className="text-lg leading-none">+</span> לקוח חדש
            </button>
            <button onClick={() => setShowTaskModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium shadow-sm hover:bg-blue-700 transition-colors">
              <span className="text-lg leading-none">+</span> משימה חדשה
            </button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-2 flex-wrap">
        {['כל הלקוחות', ...clients].map(client => (
          <button
            key={client}
            onClick={() => setActiveFilter(client)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 whitespace-nowrap ${
              activeFilter === client
                ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700'
            }`}
          >
            {client}
          </button>
        ))}
      </div>

      {/* Task Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.06)] overflow-hidden">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              {COL_HEADERS.map((h, i) => (
                <th key={i} className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
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
                  <td colSpan={7} className="px-5 pt-5 pb-2 bg-gray-50 border-t border-gray-100">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
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
                <td colSpan={7} className="p-10 text-center text-gray-400 text-sm">אין משימות להצגה</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="mt-6 text-center text-gray-400 text-sm pb-6">
        מעוצב לשימוש אישי כאיש שיווק דיגיטלי • 2026
      </footer>

      {newTaskModal}
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
    >
      {taskDetailModal}
      {renderContent()}
      {/* ─── Claude AI Chat (floating, all screens) ─── */}
      <ClaudeChat
        tasks={tasks}
        clientsData={clientsData}
        isOpen={chatOpen}
        onOpen={() => setChatOpen(true)}
        onClose={() => setChatOpen(false)}
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
