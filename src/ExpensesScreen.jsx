import { useState } from "react";
import {
  EXPENSE_CATEGORIES, CYCLE_LABELS, USD_TO_ILS, monthlyIls, formatMoney, addDays, localToday,
} from "./lib/taskCore.js";
import { relativeDate } from "./TodayScreen.jsx";

const emptyExpense = { name: '', amount: '', currency: 'ILS', cycle: 'monthly', next_date: '', category: 'AI', client: '', notes: '', active: true };

const ils = (n) => `₪${Math.round(n).toLocaleString('he-IL')}`;

const inputStyle = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '9px 11px', fontSize: 14, color: 'var(--text-primary)', boxSizing: 'border-box',
};
const Label = ({ children }) => <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>{children}</label>;

// ─── Edit / add modal ───────────────────────────────────────────────────────
const ExpenseModal = ({ expense, clients, onClose, onSave, onDelete }) => {
  const [f, setF] = useState({ ...emptyExpense, ...expense, amount: expense.amount ?? '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isNew = !expense.id;
  const valid = f.name.trim();

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} dir="rtl" className="modal-sheet" style={{
        background: 'var(--bg-surface)', borderRadius: 18, border: '1px solid var(--border)', width: '100%', maxWidth: 460, padding: 20, overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--text-primary)' }}>{isNew ? 'הוצאה קבועה חדשה' : 'עריכת הוצאה'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-muted)' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Label>שם</Label>
            <input style={inputStyle} value={f.name} onChange={e => set('name', e.target.value)} placeholder="למשל: Vercel Pro" autoFocus={isNew} />
          </div>
          <div>
            <Label>סכום</Label>
            <input style={inputStyle} type="number" step="0.01" inputMode="decimal" dir="ltr" value={f.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <Label>מטבע</Label>
            <select style={inputStyle} value={f.currency} onChange={e => set('currency', e.target.value)}>
              <option value="ILS">₪ שקל</option>
              <option value="USD">$ דולר</option>
            </select>
          </div>
          <div>
            <Label>מחזור חיוב</Label>
            <select style={inputStyle} value={f.cycle} onChange={e => set('cycle', e.target.value)}>
              <option value="monthly">חודשי</option>
              <option value="yearly">שנתי</option>
            </select>
          </div>
          <div>
            <Label>חיוב הבא</Label>
            <input style={inputStyle} type="date" dir="ltr" value={f.next_date} onChange={e => set('next_date', e.target.value)} />
          </div>
          <div>
            <Label>קטגוריה</Label>
            <select style={inputStyle} value={f.category} onChange={e => set('category', e.target.value)}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label>לקוח (אם ההוצאה שלו)</Label>
            <select style={inputStyle} value={f.client} onChange={e => set('client', e.target.value)}>
              <option value="">— כללי —</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Label>הערות</Label>
            <input style={inputStyle} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="כרטיס, מה כלול, מתי לבטל…" />
          </div>
          {!isNew && (
            <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={f.active !== false} onChange={e => set('active', e.target.checked)} />
              פעיל (בטל סימון כשמבטלים את המנוי)
            </label>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button disabled={!valid} onClick={() => onSave({ ...f, amount: f.amount === '' ? null : Number(f.amount), name: f.name.trim() })} style={{
            flex: 1, background: valid ? 'var(--accent)' : 'var(--bg-elevated)', color: valid ? 'white' : 'var(--text-muted)',
            border: 'none', borderRadius: 10, padding: '11px 0', fontWeight: 700, fontSize: 14,
          }}>שמור</button>
          {!isNew && (
            <button onClick={() => onDelete(f.id)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: '0 14px', color: 'var(--red)', fontSize: 13 }}>מחק</button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function ExpensesScreen({ expenses, clients, mobile, onSave, onDelete, today = localToday() }) {
  const [editing, setEditing] = useState(null);
  const [catFilter, setCatFilter] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const active = expenses.filter(e => e.active !== false);
  const monthly = active.reduce((s, e) => s + monthlyIls(e), 0);
  const byCat = EXPENSE_CATEGORIES
    .map(c => ({ c, sum: active.filter(e => e.category === c).reduce((s, e) => s + monthlyIls(e), 0) }))
    .filter(x => x.sum > 0)
    .sort((a, b) => b.sum - a.sum);
  const soon = active.filter(e => e.next_date && e.next_date >= today && e.next_date <= addDays(today, 14))
    .sort((a, b) => a.next_date.localeCompare(b.next_date));
  const missingAmount = active.filter(e => e.amount === null || e.amount === undefined).length;

  const list = expenses
    .filter(e => showInactive || e.active !== false)
    .filter(e => !catFilter || e.category === catFilter)
    .sort((a, b) => monthlyIls(b) - monthlyIls(a));

  const card = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow-card)' };

  return (
    <div dir="rtl" style={{ maxWidth: 820, margin: '0 auto', padding: mobile ? '18px 14px 110px' : '36px 28px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18, gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: mobile ? 24 : 30, fontWeight: 800, color: 'var(--text-primary)' }}>הוצאות קבועות</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>מנויים, כלים ודומיינים של העסק</p>
        </div>
        <button onClick={() => setEditing({ ...emptyExpense, next_date: today })} style={{
          background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 14, flexShrink: 0,
        }}>+ הוצאה</button>
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10 }}>
        <div style={card}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>בחודש</p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{ils(monthly)}</p>
        </div>
        <div style={card}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>בשנה</p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{ils(monthly * 12)}</p>
        </div>
        {!mobile && (
          <div style={card}>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>מנויים פעילים</p>
            <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{active.length}</p>
          </div>
        )}
      </div>
      <p style={{ margin: '8px 4px 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
        דולר מחושב לפי ≈₪{USD_TO_ILS}. שנתיים מחולקים ל-12.{missingAmount ? ` ${missingAmount} בלי סכום — לא נכללו.` : ''}
      </p>

      {/* Categories */}
      {byCat.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
          <button onClick={() => setCatFilter(null)} style={chip(!catFilter)}>הכל</button>
          {byCat.map(({ c, sum }) => (
            <button key={c} onClick={() => setCatFilter(catFilter === c ? null : c)} style={chip(catFilter === c)}>
              {c} · {ils(sum)}
            </button>
          ))}
        </div>
      )}

      {/* Upcoming */}
      {soon.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ margin: '0 4px 8px', fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)' }}>💳 חיובים ב-14 הימים הקרובים</h2>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {soon.map(e => (
              <button key={e.id} onClick={() => setEditing(e)} style={{
                ...card, padding: '10px 14px', flexShrink: 0, textAlign: 'right', cursor: 'pointer',
                borderColor: e.next_date <= addDays(today, 1) ? 'rgba(var(--accent-rgb),0.5)' : 'var(--border)',
              }}>
                <p style={{ margin: 0, fontSize: 12, color: e.next_date <= addDays(today, 1) ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700 }}>{relativeDate(e.next_date, today)}</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{e.name} · {formatMoney(e.amount, e.currency)}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* List */}
      <section style={{ marginTop: 22 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
          {list.length === 0 && (
            <p style={{ margin: 0, padding: 28, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>אין הוצאות להצגה</p>
          )}
          {list.map(e => (
            <div key={e.id} onClick={() => setEditing(e)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border)', cursor: 'pointer', opacity: e.active === false ? 0.45 : 1,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.name}{e.active === false && ' (בוטל)'}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{e.category}</span>
                  {e.client && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{e.client}</span>}
                  {e.next_date && e.active !== false && <span>חיוב הבא: {relativeDate(e.next_date, today)}</span>}
                  {e.notes && <span>· {e.notes}</span>}
                </p>
              </div>
              <div style={{ textAlign: 'left', flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: e.amount == null ? 'var(--red)' : 'var(--text-primary)' }} dir="ltr">
                  {formatMoney(e.amount, e.currency)}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{CYCLE_LABELS[e.cycle] || e.cycle}</p>
              </div>
            </div>
          ))}
        </div>
        {expenses.some(e => e.active === false) && (
          <button onClick={() => setShowInactive(s => !s)} style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, textDecoration: 'underline' }}>
            {showInactive ? 'הסתר מנויים שבוטלו' : 'הצג מנויים שבוטלו'}
          </button>
        )}
      </section>

      {editing && (
        <ExpenseModal
          expense={editing}
          clients={clients}
          onClose={() => setEditing(null)}
          onSave={async (e) => { await onSave(e); setEditing(null); }}
          onDelete={async (id) => { if (window.confirm('למחוק את ההוצאה?')) { await onDelete(id); setEditing(null); } }}
        />
      )}
    </div>
  );
}

function chip(active) {
  return {
    padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, border: '1px solid',
    background: active ? 'var(--accent-dim)' : 'var(--bg-surface)',
    borderColor: active ? 'rgba(var(--accent-rgb),0.35)' : 'var(--border)',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
  };
}

// Compact strip for the Today screen
export const UpcomingCharges = ({ expenses, today = localToday(), onOpen }) => {
  const soon = (expenses || [])
    .filter(e => e.active !== false && e.next_date && e.next_date >= today && e.next_date <= addDays(today, 3))
    .sort((a, b) => a.next_date.localeCompare(b.next_date));
  if (!soon.length) return null;
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={{ margin: '0 4px 8px', fontSize: 13, fontWeight: 800, color: 'var(--text-secondary)' }}>💳 חיובים קרובים <span style={{ color: 'var(--text-muted)' }}>{soon.length}</span></h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {soon.map(e => (
          <button key={e.id} onClick={onOpen} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 12px',
            fontSize: 13, color: 'var(--text-primary)', boxShadow: 'var(--shadow-card)',
          }}>
            <b style={{ color: e.next_date === today ? 'var(--accent)' : 'var(--text-secondary)' }}>{relativeDate(e.next_date, today)}</b> · {e.name} {formatMoney(e.amount, e.currency)}
          </button>
        ))}
      </div>
    </section>
  );
};
