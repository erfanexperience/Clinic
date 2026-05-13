import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { db } from './firebase';
import { COLUMNS, SELECT_OPTIONS, BADGE_COLORS, INITIAL_DATA } from './data';
import './App.css';

const DB_PATH = 'trials';
const OLD_STATUSES = new Set(['Recruiting', 'Not Yet Recruiting', 'Completed', 'Suspended', 'Active, not recruiting']);
const USER_FIELDS = new Set(['status', 'notes', 'contactEmail', 'contactPhone']);
const INITIAL_MAP = Object.fromEntries(INITIAL_DATA.map(r => [r.nctNumber, r]));

/* ── Helpers ── */
function migrateRows(rows) {
  return rows.map(r => OLD_STATUSES.has(r.status) ? { ...r, status: 'Not Contacted' } : r);
}

function mergeWithInitial(firebaseRows) {
  return firebaseRows.map(row => {
    const seed = INITIAL_MAP[row.nctNumber];
    if (!seed) return row;
    const merged = { ...row };
    for (const key of Object.keys(seed)) {
      if (key === 'id') continue;
      if (USER_FIELDS.has(key)) {
        if (!merged[key]) merged[key] = seed[key];
      } else {
        if (seed[key]) merged[key] = seed[key];
      }
    }
    return merged;
  });
}

function saveToFirebase(rows) {
  const obj = {};
  rows.forEach(r => { obj[r.id] = r; });
  set(ref(db, DB_PATH), obj);
}

function exportCSV(rows) {
  const headers = COLUMNS.map(c => `"${c.label}"`).join(',');
  const lines = rows.map(row =>
    COLUMNS.map(c => `"${(row[c.key] ?? '').toString().replace(/"/g, '""')}"`).join(',')
  );
  const blob = new Blob([[headers, ...lines].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ms-clinical-trials.csv'; a.click();
}

/* ── Mobile detection ── */
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const h = e => setMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return mobile;
}

/* ── Badge ── */
function Badge({ value, type }) {
  if (!value) return <span className="cell-empty">—</span>;
  const colors = BADGE_COLORS[type]?.[value];
  if (!colors) return <span>{value}</span>;
  return (
    <span className="badge" style={{ background: colors.bg, color: colors.color, borderColor: colors.border }}>
      {value}
    </span>
  );
}

/* ── Edit modal (works on both desktop + mobile) ── */
function EditModal({ row, col, onSave, onClose, isMobile }) {
  const [draft, setDraft] = useState(row[col.key] ?? '');
  const { type, label, key } = col;
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current && type !== 'select') {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [type]);

  const save = () => { onSave(key, draft); onClose(); };

  return (
    <div className="edit-modal-overlay" onClick={onClose}>
      <div className={`edit-modal ${isMobile ? 'edit-modal--bottom' : 'edit-modal--center'}`}
        onClick={e => e.stopPropagation()}>
        <div className="edit-modal-header">
          <button className="edit-modal-btn edit-modal-btn--cancel" onClick={onClose}>Cancel</button>
          <span className="edit-modal-title">{label}</span>
          <button className="edit-modal-btn edit-modal-btn--save" onClick={save}>Save</button>
        </div>
        <div className="edit-modal-context">{row.trialName}</div>
        <div className="edit-modal-body">
          {type === 'select' && (
            <div className="edit-select-grid">
              {(SELECT_OPTIONS[key] || []).map(opt => (
                <button key={opt}
                  className={`edit-select-opt ${draft === opt ? 'edit-select-opt--active' : ''}`}
                  onClick={() => { onSave(key, opt); onClose(); }}>
                  {BADGE_COLORS[key]?.[opt] ? <Badge value={opt} type={key} /> : opt}
                </button>
              ))}
              <button className="edit-select-opt edit-select-opt--clear"
                onClick={() => { onSave(key, ''); onClose(); }}>— Clear —</button>
            </div>
          )}
          {type === 'url' && (
            <div className="edit-url-wrap">
              <input ref={inputRef} className="edit-input" type="url"
                value={draft} onChange={e => setDraft(e.target.value)}
                placeholder="https://clinicaltrials.gov/study/NCT…" />
              {draft && (
                <a href={draft} target="_blank" rel="noreferrer" className="edit-url-open">
                  🔗 Open in ClinicalTrials.gov
                </a>
              )}
            </div>
          )}
          {type === 'textarea' && (
            <textarea ref={inputRef} className="edit-textarea"
              value={draft} onChange={e => setDraft(e.target.value)}
              placeholder={`Enter ${label}…`} rows={8} />
          )}
          {type === 'text' && (
            <input ref={inputRef} className="edit-input"
              value={draft} onChange={e => setDraft(e.target.value)}
              placeholder={`Enter ${label}…`} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Accordion list (shared desktop + mobile) ── */
function AccordionList({ rows, onEdit, onDelete, isMobile }) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="accordion-list">
      {rows.map((row, idx) => {
        const isOpen = expandedId === row.id;
        return (
          <div key={row.id} className={`accord-card ${isOpen ? 'accord-card--open' : ''}`}>
            {/* ── Collapsed header ── */}
            <button className="accord-header"
              onClick={() => setExpandedId(isOpen ? null : row.id)}>
              <span className="accord-num">{idx + 1}</span>
              <span className="accord-name">{row.trialName || <em>Untitled Trial</em>}</span>
              <div className="accord-badges">
                {row.status   && <Badge value={row.status}   type="status" />}
                {row.treatmentType && <Badge value={row.treatmentType} type="treatmentType" />}
                {row.msTypeEligible && !isMobile && <Badge value={row.msTypeEligible} type="msTypeEligible" />}
              </div>
              <span className="accord-chevron">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* ── Expanded body ── */}
            {isOpen && (
              <div className="accord-body">
                <div className="accord-fields">
                  {COLUMNS.filter(c => c.key !== 'trialName').map(col => {
                    const val = row[col.key] ?? '';
                    return (
                      <div key={col.key} className={`accord-field ${col.type === 'textarea' ? 'accord-field--wide' : ''}`}
                        onClick={() => onEdit(row, col)}>
                        <span className="accord-field-label">{col.label}</span>
                        <span className="accord-field-value">
                          {col.type === 'select'
                            ? <Badge value={val} type={col.key} />
                            : col.type === 'url'
                              ? val
                                ? <a href={val} target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()} className="accord-field-link">🔗 Open Trial</a>
                                : <span className="accord-field-empty">—</span>
                              : val || <span className="accord-field-empty">—</span>
                          }
                        </span>
                        <span className="accord-field-edit">✏️</span>
                      </div>
                    );
                  })}
                  {/* Trial name editable too */}
                  <div className="accord-field accord-field--wide accord-field--name"
                    onClick={() => onEdit(row, COLUMNS.find(c => c.key === 'trialName'))}>
                    <span className="accord-field-label">Trial Name</span>
                    <span className="accord-field-value">{row.trialName || <span className="accord-field-empty">—</span>}</span>
                    <span className="accord-field-edit">✏️</span>
                  </div>
                </div>
                <button className="accord-delete-btn"
                  onClick={e => { e.stopPropagation(); onDelete(row.id); }}>
                  🗑 Delete this trial
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main App ── */
export default function App() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(null);   // { row, col }
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: 'trialName', dir: 'asc' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showSearch, setShowSearch] = useState(false);

  /* ── Firebase listener ── */
  useEffect(() => {
    const trialsRef = ref(db, DB_PATH);
    const unsub = onValue(trialsRef, snapshot => {
      const data = snapshot.val();
      if (!data) {
        saveToFirebase(INITIAL_DATA);
        setRows(INITIAL_DATA);
      } else {
        const arr = migrateRows(Object.values(data));
        const withUpdates = mergeWithInitial(arr);
        const savedNcts = new Set(withUpdates.map(r => r.nctNumber).filter(Boolean));
        const newTrials = INITIAL_DATA.filter(r => r.nctNumber && !savedNcts.has(r.nctNumber));
        const final = newTrials.length > 0 ? [...withUpdates, ...newTrials] : withUpdates;
        saveToFirebase(final);
        setRows(final);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const updateCell = useCallback((rowId, colKey, value) => {
    setRows(prev => {
      const updated = prev.map(r => r.id === rowId ? { ...r, [colKey]: value } : r);
      saveToFirebase(updated);
      return updated;
    });
  }, []);

  const addRow = () => {
    const newRow = { id: String(Date.now()), ...Object.fromEntries(COLUMNS.map(c => [c.key, ''])) };
    newRow.status = 'Not Contacted';
    const next = [...rows, newRow];
    setRows(next);
    saveToFirebase(next);
    setTimeout(() => setEditModal({ row: newRow, col: COLUMNS.find(c => c.key === 'trialName') }), 50);
  };

  const deleteRow = id => {
    const next = rows.filter(r => r.id !== id);
    setRows(next);
    saveToFirebase(next);
    setConfirmDelete(null);
  };

  const setFilter = (key, val) => setFilters(prev =>
    val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
  );

  const isCarT = t => t === 'CAR-T Cell Therapy' || t === 'Allogeneic CAR-T';

  const filtered = rows
    .filter(row => {
      if (search) {
        const q = search.toLowerCase();
        if (!COLUMNS.some(c => (row[c.key] ?? '').toString().toLowerCase().includes(q))) return false;
      }
      return Object.entries(filters).every(([k, v]) => row[k] === v);
    })
    .sort((a, b) => {
      // CAR-T always first
      const aCart = isCarT(a.treatmentType) ? 0 : 1;
      const bCart = isCarT(b.treatmentType) ? 0 : 1;
      if (aCart !== bCart) return aCart - bCart;
      // Within each group, sort by trial name
      return a.trialName.localeCompare(b.trialName);
    });

  const contactedCount = rows.filter(r => r.status === 'Contacted' || r.status === 'In Talks').length;
  const inTalksCount = rows.filter(r => r.status === 'In Talks').length;
  const activeFilters = Object.keys(filters).length;

  const editRow = editModal ? (rows.find(r => r.id === editModal.row?.id) ?? editModal.row) : null;

  if (loading) {
    return (
      <div className="app">
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 15 }}>
          Loading trials…
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-title">
          <span className="header-emoji">🧬</span>
          <div>
            <h1>MS Clinical Trials</h1>
            <p className="header-sub">Shabnam Sedigh</p>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat"><span className="stat-num">{rows.length}</span><span className="stat-label">Total</span></div>
          <div className="stat stat--green"><span className="stat-num">{contactedCount}</span><span className="stat-label">Contacted</span></div>
          <div className="stat stat--purple"><span className="stat-num">{inTalksCount}</span><span className="stat-label">In Talks</span></div>
        </div>
        <div className="header-actions">
          {isMobile ? (
            <>
              <button className="btn btn--icon" onClick={() => setShowSearch(s => !s)}>🔍</button>
              <button className="btn btn--primary" onClick={addRow}>＋</button>
            </>
          ) : (
            <>
              <button className="btn btn--ghost" onClick={() => exportCSV(filtered)}>↓ CSV</button>
              <button className="btn btn--primary" onClick={addRow}>+ Add Trial</button>
            </>
          )}
        </div>
      </header>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        {(!isMobile || showSearch) && (
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="Search all columns…"
              value={search} onChange={e => setSearch(e.target.value)} autoFocus={isMobile && showSearch} />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        )}
        <div className="filter-pills">
          {['status', 'treatmentType', 'msTypeEligible'].map(key => {
            const col = COLUMNS.find(c => c.key === key);
            return (
              <select key={key}
                className={`filter-select ${filters[key] ? 'filter-select--active' : ''}`}
                value={filters[key] || ''} onChange={e => setFilter(key, e.target.value)}>
                <option value="">{isMobile ? col.label.replace('Treatment Type', 'Type').replace('MS Type Eligible', 'MS') : `All ${col.label}`}</option>
                {SELECT_OPTIONS[key].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            );
          })}
          {activeFilters > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={() => setFilters({})}>
              {isMobile ? `✕ ${activeFilters}` : 'Clear filters'}
            </button>
          )}
        </div>
        {!isMobile && <span className="row-count">{filtered.length} of {rows.length} trials</span>}
      </div>

      {/* ── Accordion list (desktop + mobile) ── */}
      <div className="list-container">
        {filtered.length === 0
          ? <div className="empty-state">No trials match your search.</div>
          : <AccordionList
              rows={filtered}
              isMobile={isMobile}
              onEdit={(row, col) => setEditModal({ row, col })}
              onDelete={id => setConfirmDelete(id)}
            />
        }
        <div className="list-footer">
          <span>{filtered.length} of {rows.length} trials</span>
          {isMobile && <button className="btn btn--ghost btn--sm" onClick={() => exportCSV(filtered)}>↓ CSV</button>}
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editModal && editRow && (
        <EditModal
          row={editRow}
          col={editModal.col}
          isMobile={isMobile}
          onSave={(k, v) => updateCell(editRow.id, k, v)}
          onClose={() => setEditModal(null)} />
      )}

      {/* ── Delete confirm ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete this trial?</h3>
            <p>This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn--danger" onClick={() => deleteRow(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
