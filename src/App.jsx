import { useState, useEffect, useRef, useCallback } from 'react';
import { COLUMNS, SELECT_OPTIONS, BADGE_COLORS, INITIAL_DATA } from './data';
import './App.css';

const STORAGE_KEY = 'ms-clinical-trials-v1';

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

function SelectCell({ value, colKey, onChange, onClose }) {
  const opts = SELECT_OPTIONS[colKey] || [];
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="select-dropdown" ref={ref}>
      <div className="select-option select-option--clear" onClick={() => { onChange(''); onClose(); }}>
        — Clear —
      </div>
      {opts.map(opt => (
        <div
          key={opt}
          className={`select-option ${value === opt ? 'select-option--active' : ''}`}
          onClick={() => { onChange(opt); onClose(); }}
        >
          {BADGE_COLORS[colKey]?.[opt] ? <Badge value={opt} type={colKey} /> : opt}
        </div>
      ))}
    </div>
  );
}

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

  const commit = useCallback(() => {
    onCommit(key, draft);
  }, [key, draft, onCommit]);

  if (type === 'select') {
    return (
      <td
        className={`cell cell--select ${isEditing ? 'cell--editing' : ''}`}
        style={{ width: col.width, minWidth: col.width }}
        onClick={() => { onStartEdit(); setShowSelect(true); }}
      >
        <div className="cell-inner">
          <Badge value={value} type={key} />
          <span className="select-caret">▾</span>
        </div>
        {isEditing && showSelect && (
          <SelectCell
            value={value}
            colKey={key}
            onChange={v => { onCommit(key, v); setShowSelect(false); }}
            onClose={() => { setShowSelect(false); }}
          />
        )}
      </td>
    );
  }

  if (type === 'url') {
    if (!isEditing) {
      return (
        <td className="cell cell--url" style={{ width: col.width, minWidth: col.width }}
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
        <input
          ref={ref}
          className="cell-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') { commit(); onKeyNav('down'); }
            if (e.key === 'Escape') { setDraft(value); onCommit(key, value); }
            if (e.key === 'Tab') { e.preventDefault(); commit(); onKeyNav(e.shiftKey ? 'left' : 'right'); }
          }}
        />
      </td>
    );
  }

  if (type === 'textarea') {
    if (!isEditing) {
      return (
        <td className="cell cell--textarea" style={{ width: col.width, minWidth: col.width }}
            onDoubleClick={onStartEdit}>
          <div className="cell-inner cell-inner--clamp">{value || <span className="cell-empty">—</span>}</div>
        </td>
      );
    }
    return (
      <td className="cell cell--editing cell--textarea" style={{ width: col.width, minWidth: col.width }}>
        <textarea
          ref={ref}
          className="cell-textarea"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Escape') { setDraft(value); onCommit(key, value); }
            if (e.key === 'Tab') { e.preventDefault(); commit(); onKeyNav(e.shiftKey ? 'left' : 'right'); }
          }}
          rows={5}
        />
      </td>
    );
  }

  if (!isEditing) {
    return (
      <td className="cell" style={{ width: col.width, minWidth: col.width }}
          onDoubleClick={type === 'text' ? undefined : undefined}
          onClick={onStartEdit}>
        <div className="cell-inner">{value || <span className="cell-empty">—</span>}</div>
      </td>
    );
  }

  return (
    <td className="cell cell--editing" style={{ width: col.width, minWidth: col.width }}>
      <input
        ref={ref}
        className="cell-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(); onKeyNav('down'); }
          if (e.key === 'Escape') { setDraft(value); onCommit(key, value); }
          if (e.key === 'Tab') { e.preventDefault(); commit(); onKeyNav(e.shiftKey ? 'left' : 'right'); }
          if (e.key === 'ArrowDown') { commit(); onKeyNav('down'); }
          if (e.key === 'ArrowUp') { commit(); onKeyNav('up'); }
        }}
      />
    </td>
  );
}

function exportCSV(rows) {
  const headers = COLUMNS.map(c => `"${c.label}"`).join(',');
  const lines = rows.map(row =>
    COLUMNS.map(c => `"${(row[c.key] ?? '').toString().replace(/"/g, '""')}"`).join(',')
  );
  const csv = [headers, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ms-clinical-trials.csv';
  a.click();
}

const PRIORITY_ORDER = { '⭐⭐⭐ Top Priority': 0, '⭐⭐ Strong Option': 1, '⭐ Consider': 2, '': 3 };

export default function App() {
  const [rows, setRows] = useState(loadData);
  const [editCell, setEditCell] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: 'trialName', dir: 'asc' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  }, [rows]);

  const updateCell = useCallback((rowId, colKey, value) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, [colKey]: value } : r));
    setEditCell(null);
  }, []);

  const addRow = () => {
    const newRow = { id: String(Date.now()), ...Object.fromEntries(COLUMNS.map(c => [c.key, ''])) };
    newRow.status = 'Recruiting';
    newRow.location = 'USA 🇺🇸';
    setRows(prev => [...prev, newRow]);
    setTimeout(() => setEditCell({ rowId: newRow.id, colKey: 'trialName' }), 50);
  };

  const deleteRow = (id) => {
    setRows(prev => prev.filter(r => r.id !== id));
    setConfirmDelete(null);
  };

  const handleSort = (key) => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const setFilter = (key, val) => {
    setFilters(prev => val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  };

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
      if (sort.key === 'priority') {
        av = PRIORITY_ORDER[av] ?? 99; bv = PRIORITY_ORDER[bv] ?? 99;
        return sort.dir === 'asc' ? av - bv : bv - av;
      }
      if (sort.key === 'enrollment') {
        return sort.dir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
      }
      return sort.dir === 'asc'
        ? av.toString().localeCompare(bv.toString())
        : bv.toString().localeCompare(av.toString());
    });

  const navigateCell = useCallback((rowId, colKey, dir) => {
    const rowIdx = filtered.findIndex(r => r.id === rowId);
    const colIdx = COLUMNS.findIndex(c => c.key === colKey);
    let nr = rowIdx, nc = colIdx;
    if (dir === 'down') nr = Math.min(rowIdx + 1, filtered.length - 1);
    if (dir === 'up') nr = Math.max(rowIdx - 1, 0);
    if (dir === 'right') nc = Math.min(colIdx + 1, COLUMNS.length - 1);
    if (dir === 'left') nc = Math.max(colIdx - 1, 0);
    if (filtered[nr]) setEditCell({ rowId: filtered[nr].id, colKey: COLUMNS[nc].key });
  }, [filtered]);

  const topCount = rows.filter(r => r.priority === '⭐⭐⭐ Top Priority').length;
  const recruitingCount = rows.filter(r => r.status === 'Recruiting').length;

  return (
    <div className="app" onClick={() => setEditCell(null)}>
      <header className="header">
        <div className="header-title">
          <span className="header-emoji">🧬</span>
          <div>
            <h1>MS Clinical Trials</h1>
            <p className="header-sub">Shabnam Sedigh — Active Tracker</p>
          </div>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-num">{rows.length}</span>
            <span className="stat-label">Total</span>
          </div>
          <div className="stat stat--green">
            <span className="stat-num">{recruitingCount}</span>
            <span className="stat-label">Recruiting</span>
          </div>
          <div className="stat stat--purple">
            <span className="stat-num">{topCount}</span>
            <span className="stat-label">Top Priority</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn--ghost" onClick={() => exportCSV(filtered)}>
            ↓ Export CSV
          </button>
          <button className="btn btn--primary" onClick={addRow}>
            + Add Trial
          </button>
        </div>
      </header>

      <div className="toolbar" onClick={e => e.stopPropagation()}>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search all columns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>
        <div className="filter-pills">
          {['status', 'treatmentType', 'msTypeEligible'].map(key => {
            const col = COLUMNS.find(c => c.key === key);
            return (
              <select
                key={key}
                className={`filter-select ${filters[key] ? 'filter-select--active' : ''}`}
                value={filters[key] || ''}
                onChange={e => setFilter(key, e.target.value)}
              >
                <option value="">All {col.label}</option>
                {SELECT_OPTIONS[key].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            );
          })}
          {Object.keys(filters).length > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={() => setFilters({})}>
              Clear filters
            </button>
          )}
        </div>
        <span className="row-count">{filtered.length} of {rows.length} rows</span>
      </div>

      <div className="table-container">
        <table className="sheet" onClick={e => e.stopPropagation()}>
          <thead>
            <tr>
              <th className="col-actions" style={{ width: 40, minWidth: 40 }}></th>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  style={{ width: col.width, minWidth: col.width }}
                  className={`col-header ${sort.key === col.key ? 'col-header--sorted' : ''}`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="col-label">{col.label}</span>
                  <span className="sort-icon">
                    {sort.key === col.key ? (sort.dir === 'asc' ? '↑' : '↓') : '⇅'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, rowIdx) => (
              <tr key={row.id} className={`row row--${rowIdx % 2 === 0 ? 'even' : 'odd'}`}>
                <td className="col-actions">
                  <button
                    className="delete-btn"
                    title="Delete row"
                    onClick={e => { e.stopPropagation(); setConfirmDelete(row.id); }}
                  >✕</button>
                </td>
                {COLUMNS.map(col => (
                  <Cell
                    key={col.key}
                    row={row}
                    col={col}
                    isEditing={editCell?.rowId === row.id && editCell?.colKey === col.key}
                    onStartEdit={() => setEditCell({ rowId: row.id, colKey: col.key })}
                    onCommit={(k, v) => updateCell(row.id, k, v)}
                    onKeyNav={(dir) => navigateCell(row.id, col.key, dir)}
                  />
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="empty-state">
                  No trials match your search or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
