import { useState, useEffect, useRef, useCallback } from 'react';
import { COLUMNS, SELECT_OPTIONS, BADGE_COLORS, INITIAL_DATA } from './data';
import './App.css';

const STORAGE_KEY = 'ms-clinical-trials-v1';

/* ── Data helpers ── */
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const savedNcts = new Set(parsed.map(r => r.nctNumber).filter(Boolean));
      const newTrials = INITIAL_DATA.filter(r => r.nctNumber && !savedNcts.has(r.nctNumber));
      return newTrials.length > 0 ? [...parsed, ...newTrials] : parsed;
    }
  } catch {}
  return INITIAL_DATA;
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

/* ── Mobile detection hook ── */
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

/* ── Desktop select dropdown ── */
function SelectDropdown({ value, colKey, onChange, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div className="select-dropdown" ref={ref}>
      <div className="select-option select-option--clear" onClick={() => { onChange(''); onClose(); }}>— Clear —</div>
      {(SELECT_OPTIONS[colKey] || []).map(opt => (
        <div key={opt}
          className={`select-option ${value === opt ? 'select-option--active' : ''}`}
          onClick={() => { onChange(opt); onClose(); }}>
          {BADGE_COLORS[colKey]?.[opt] ? <Badge value={opt} type={colKey} /> : opt}
        </div>
      ))}
    </div>
  );
}

/* ── Mobile full-screen edit modal ── */
function MobileEditModal({ row, col, onSave, onClose }) {
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
    <div className="mobile-modal-overlay" onClick={onClose}>
      <div className="mobile-modal" onClick={e => e.stopPropagation()}>
        <div className="mobile-modal-header">
          <button className="mobile-modal-btn mobile-modal-btn--cancel" onClick={onClose}>Cancel</button>
          <span className="mobile-modal-title">{label}</span>
          <button className="mobile-modal-btn mobile-modal-btn--save" onClick={save}>Save</button>
        </div>
        <div className="mobile-modal-context">{row.trialName}</div>
        <div className="mobile-modal-body">
          {type === 'select' && (
            <div className="mobile-select-grid">
              {(SELECT_OPTIONS[key] || []).map(opt => (
                <button key={opt}
                  className={`mobile-select-opt ${draft === opt ? 'mobile-select-opt--active' : ''}`}
                  onClick={() => { onSave(key, opt); onClose(); }}>
                  {BADGE_COLORS[key]?.[opt] ? <Badge value={opt} type={key} /> : opt}
                </button>
              ))}
              <button className="mobile-select-opt mobile-select-opt--clear"
                onClick={() => { onSave(key, ''); onClose(); }}>— Clear —</button>
            </div>
          )}
          {type === 'url' && (
            <div className="mobile-url-wrap">
              <input ref={inputRef} className="mobile-input" type="url"
                value={draft} onChange={e => setDraft(e.target.value)}
                placeholder="https://clinicaltrials.gov/study/NCT…" />
              {draft && (
                <a href={draft} target="_blank" rel="noreferrer" className="mobile-url-open">
                  🔗 Open in ClinicalTrials.gov
                </a>
              )}
            </div>
          )}
          {type === 'textarea' && (
            <textarea ref={inputRef} className="mobile-textarea"
              value={draft} onChange={e => setDraft(e.target.value)}
              placeholder={`Enter ${label}…`} rows={8} />
          )}
          {type === 'text' && (
            <input ref={inputRef} className="mobile-input"
              value={draft} onChange={e => setDraft(e.target.value)}
              placeholder={`Enter ${label}…`} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Mobile accordion list ── */
function MobileList({ rows, onEdit, onDelete }) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="mobile-list">
      {rows.map((row, idx) => {
        const isOpen = expandedId === row.id;
        return (
          <div key={row.id} className={`mobile-card ${isOpen ? 'mobile-card--open' : ''}`}>
            {/* ── Header row (always visible) ── */}
            <button
              className="mobile-card-header"
              onClick={() => setExpandedId(isOpen ? null : row.id)}
            >
              <span className="mobile-card-num">{idx + 1}</span>
              <span className="mobile-card-name">{row.trialName || <em>Untitled Trial</em>}</span>
              <span className="mobile-card-status">
                {row.status ? <Badge value={row.status} type="status" /> : null}
              </span>
              <span className="mobile-card-chevron">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* ── Expanded detail panel ── */}
            {isOpen && (
              <div className="mobile-card-body">
                {COLUMNS.filter(c => c.key !== 'trialName').map(col => {
                  const val = row[col.key] ?? '';
                  return (
                    <div key={col.key} className="mobile-field"
                      onClick={() => onEdit(row, col)}>
                      <span className="mobile-field-label">{col.label}</span>
                      <span className="mobile-field-value">
                        {col.type === 'select'
                          ? <Badge value={val} type={col.key} />
                          : col.type === 'url'
                            ? val
                              ? <a href={val} target="_blank" rel="noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="mobile-field-link">🔗 Open Trial</a>
                              : <span className="mobile-field-empty">—</span>
                            : val || <span className="mobile-field-empty">—</span>
                        }
                      </span>
                      <span className="mobile-field-edit">✏️</span>
                    </div>
                  );
                })}

                {/* Trial name field (editable too) */}
                <div className="mobile-field mobile-field--name"
                  onClick={() => onEdit(row, COLUMNS.find(c => c.key === 'trialName'))}>
                  <span className="mobile-field-label">Trial Name</span>
                  <span className="mobile-field-value">{row.trialName || <span className="mobile-field-empty">—</span>}</span>
                  <span className="mobile-field-edit">✏️</span>
                </div>

                <button className="mobile-delete-btn"
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

/* ── Desktop inline Cell ── */
function Cell({ row, col, isEditing, onStartEdit, onCommit, onKeyNav }) {
  const { key, type } = col;
  const value = row[key] ?? '';
  const ref = useRef(null);
  const [draft, setDraft] = useState(value);
  const [showSelect, setShowSelect] = useState(false);

  useEffect(() => {
    if (isEditing && ref.current && type !== 'select') {
      ref.current.focus();
      if (ref.current.select) ref.current.select();
    }
  }, [isEditing, type]);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = useCallback(() => onCommit(key, draft), [key, draft, onCommit]);

  /* Select */
  if (type === 'select') {
    return (
      <td className={`cell cell--select ${isEditing ? 'cell--editing' : ''}`}
        style={{ width: col.width, minWidth: col.width }}
        onClick={() => { onStartEdit(); setShowSelect(true); }}>
        <div className="cell-inner">
          <Badge value={value} type={key} />
          <span className="select-caret">▾</span>
        </div>
        {isEditing && showSelect && (
          <SelectDropdown value={value} colKey={key}
            onChange={v => { onCommit(key, v); setShowSelect(false); }}
            onClose={() => setShowSelect(false)} />
        )}
      </td>
    );
  }

  /* URL */
  if (type === 'url') {
    if (!isEditing) {
      return (
        <td className="cell cell--url"
          style={{ width: col.width, minWidth: col.width }}
          onDoubleClick={onStartEdit}>
          <div className="cell-inner">
            {value
              ? <a href={value} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                  {value.replace('https://clinicaltrials.gov/study/', 'NCT → ')}
                </a>
              : <span className="cell-empty">—</span>}
          </div>
        </td>
      );
    }
    return (
      <td className="cell cell--editing" style={{ width: col.width, minWidth: col.width }}>
        <input ref={ref} className="cell-input" value={draft}
          onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { commit(); onKeyNav('down'); }
            if (e.key === 'Escape') { setDraft(value); onCommit(key, value); }
            if (e.key === 'Tab') { e.preventDefault(); commit(); onKeyNav(e.shiftKey ? 'left' : 'right'); }
          }} />
      </td>
    );
  }

  /* Textarea */
  if (type === 'textarea') {
    if (!isEditing) {
      return (
        <td className="cell cell--textarea"
          style={{ width: col.width, minWidth: col.width }}
          onDoubleClick={onStartEdit}>
          <div className="cell-inner cell-inner--clamp">{value || <span className="cell-empty">—</span>}</div>
        </td>
      );
    }
    return (
      <td className="cell cell--editing cell--textarea" style={{ width: col.width, minWidth: col.width }}>
        <textarea ref={ref} className="cell-textarea" value={draft}
          onChange={e => setDraft(e.target.value)} onBlur={commit} rows={5}
          onKeyDown={e => {
            if (e.key === 'Escape') { setDraft(value); onCommit(key, value); }
            if (e.key === 'Tab') { e.preventDefault(); commit(); onKeyNav(e.shiftKey ? 'left' : 'right'); }
          }} />
      </td>
    );
  }

  /* Text (default) */
  if (!isEditing) {
    return (
      <td className="cell" style={{ width: col.width, minWidth: col.width }}
        onClick={onStartEdit}>
        <div className="cell-inner">{value || <span className="cell-empty">—</span>}</div>
      </td>
    );
  }
  return (
    <td className="cell cell--editing" style={{ width: col.width, minWidth: col.width }}>
      <input ref={ref} className="cell-input" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(); onKeyNav('down'); }
          if (e.key === 'Escape') { setDraft(value); onCommit(key, value); }
          if (e.key === 'Tab') { e.preventDefault(); commit(); onKeyNav(e.shiftKey ? 'left' : 'right'); }
          if (e.key === 'ArrowDown') { commit(); onKeyNav('down'); }
          if (e.key === 'ArrowUp') { commit(); onKeyNav('up'); }
        }} />
    </td>
  );
}

/* ── Main App ── */
const PRIORITY_ORDER = { '⭐⭐⭐ Top Priority': 0, '⭐⭐ Strong Option': 1, '⭐ Consider': 2, '': 3 };

export default function App() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(loadData);
  const [editCell, setEditCell] = useState(null);
  const [mobileEdit, setMobileEdit] = useState(null);   // { row, col }
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: 'trialName', dir: 'asc' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }, [rows]);

  const updateCell = useCallback((rowId, colKey, value) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [colKey]: value } : r));
    setEditCell(null);
  }, []);

  const addRow = () => {
    const newRow = { id: String(Date.now()), ...Object.fromEntries(COLUMNS.map(c => [c.key, ''])) };
    newRow.status = 'Not Contacted';
    setRows(prev => [...prev, newRow]);
    if (isMobile) {
      // open the edit modal for the trial name of the new row
      setTimeout(() => setMobileEdit({ row: newRow, col: COLUMNS.find(c => c.key === 'trialName') }), 50);
    } else {
      setTimeout(() => setEditCell({ rowId: newRow.id, colKey: 'trialName' }), 50);
    }
  };

  const deleteRow = id => { setRows(prev => prev.filter(r => r.id !== id)); setConfirmDelete(null); };

  const handleSort = key => setSort(prev =>
    prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  );

  const setFilter = (key, val) => setFilters(prev =>
    val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
  );

  const filtered = rows
    .filter(row => {
      if (search) {
        const q = search.toLowerCase();
        if (!COLUMNS.some(c => (row[c.key] ?? '').toString().toLowerCase().includes(q))) return false;
      }
      return Object.entries(filters).every(([k, v]) => row[k] === v);
    })
    .sort((a, b) => {
      let av = a[sort.key] ?? '', bv = b[sort.key] ?? '';
      if (sort.key === 'priority') { av = PRIORITY_ORDER[av] ?? 99; bv = PRIORITY_ORDER[bv] ?? 99; return sort.dir === 'asc' ? av - bv : bv - av; }
      if (sort.key === 'enrollment') return sort.dir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
      return sort.dir === 'asc' ? av.toString().localeCompare(bv.toString()) : bv.toString().localeCompare(av.toString());
    });

  const navigateCell = useCallback((rowId, colKey, dir) => {
    const ri = filtered.findIndex(r => r.id === rowId);
    const ci = COLUMNS.findIndex(c => c.key === colKey);
    let nr = ri, nc = ci;
    if (dir === 'down') nr = Math.min(ri + 1, filtered.length - 1);
    if (dir === 'up') nr = Math.max(ri - 1, 0);
    if (dir === 'right') nc = Math.min(ci + 1, COLUMNS.length - 1);
    if (dir === 'left') nc = Math.max(ci - 1, 0);
    if (filtered[nr]) setEditCell({ rowId: filtered[nr].id, colKey: COLUMNS[nc].key });
  }, [filtered]);

  const contactedCount = rows.filter(r => r.status === 'Contacted' || r.status === 'In Talks').length;
  const inTalksCount = rows.filter(r => r.status === 'In Talks').length;
  const activeFilters = Object.keys(filters).length;

  // Keep mobileEdit row in sync with latest saved data
  const mobileEditRow = mobileEdit
    ? (rows.find(r => r.id === mobileEdit.row.id) ?? mobileEdit.row)
    : null;

  return (
    <div className="app" onClick={() => !isMobile && setEditCell(null)}>

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
              <button className="btn btn--icon" onClick={() => setShowSearch(s => !s)} title="Search">🔍</button>
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
      <div className="toolbar" onClick={e => e.stopPropagation()}>
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
        {!isMobile && <span className="row-count">{filtered.length} of {rows.length} rows</span>}
      </div>

      {/* ── MOBILE: Accordion list ── */}
      {isMobile ? (
        <div className="mobile-list-container">
          {filtered.length === 0
            ? <div className="mobile-empty">No trials match your search.</div>
            : <MobileList
                rows={filtered}
                onEdit={(row, col) => setMobileEdit({ row, col })}
                onDelete={id => setConfirmDelete(id)}
              />
          }
          <div className="mobile-list-footer">
            <span>{filtered.length} of {rows.length} trials</span>
            <button className="btn btn--ghost btn--sm" onClick={() => exportCSV(filtered)}>↓ CSV</button>
          </div>
        </div>
      ) : (
        /* ── DESKTOP: Spreadsheet table ── */
        <div className="table-container">
          <table className="sheet" onClick={e => e.stopPropagation()}>
            <thead>
              <tr>
                <th className="col-actions col-actions--header" style={{ width: 40, minWidth: 40 }}></th>
                {COLUMNS.map((col, ci) => (
                  <th key={col.key}
                    style={{ width: col.width, minWidth: col.width }}
                    className={`col-header ${sort.key === col.key ? 'col-header--sorted' : ''} ${ci === 0 ? 'col-header--frozen' : ''}`}
                    onClick={() => handleSort(col.key)}>
                    <span className="col-label">{col.label}</span>
                    <span className="sort-icon">{sort.key === col.key ? (sort.dir === 'asc' ? '↑' : '↓') : '⇅'}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, rowIdx) => (
                <tr key={row.id} className={`row row--${rowIdx % 2 === 0 ? 'even' : 'odd'}`}>
                  <td className="col-actions">
                    <button className="delete-btn" title="Delete"
                      onClick={e => { e.stopPropagation(); setConfirmDelete(row.id); }}>✕</button>
                  </td>
                  {COLUMNS.map((col, ci) => (
                    <Cell key={col.key} row={row} col={col}
                      isEditing={editCell?.rowId === row.id && editCell?.colKey === col.key}
                      onStartEdit={() => setEditCell({ rowId: row.id, colKey: col.key })}
                      onCommit={(k, v) => updateCell(row.id, k, v)}
                      onKeyNav={dir => navigateCell(row.id, col.key, dir)} />
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={COLUMNS.length + 1} className="empty-state">No trials match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Mobile edit modal ── */}
      {isMobile && mobileEdit && mobileEditRow && (
        <MobileEditModal
          row={mobileEditRow}
          col={mobileEdit.col}
          onSave={(k, v) => updateCell(mobileEditRow.id, k, v)}
          onClose={() => setMobileEdit(null)} />
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
