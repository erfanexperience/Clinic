import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, set, onValue } from 'firebase/database';
import { db } from './firebase';
import { COLUMNS, SELECT_OPTIONS, BADGE_COLORS, INITIAL_DATA } from './data';
import { HOSPITAL_FIELDS, INITIAL_HOSPITALS } from './hospitalsData';
import './App.css';

/* ══════════════════════════════════════════
   CONSTANTS & HELPERS
══════════════════════════════════════════ */
const TRIALS_PATH   = 'trials';
const HOSPITALS_PATH = 'hospitals';
const OLD_STATUSES  = new Set(['Recruiting', 'Not Yet Recruiting', 'Completed', 'Suspended', 'Active, not recruiting']);
const USER_FIELDS   = new Set(['status', 'notes', 'contactEmail', 'contactPhone']);
const INITIAL_MAP   = Object.fromEntries(INITIAL_DATA.map(r => [r.nctNumber, r]));

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
      if (USER_FIELDS.has(key)) { if (!merged[key]) merged[key] = seed[key]; }
      else { if (seed[key]) merged[key] = seed[key]; }
    }
    return merged;
  });
}

function saveTrials(rows) {
  const obj = {};
  rows.forEach(r => { obj[r.id] = r; });
  set(ref(db, TRIALS_PATH), obj);
}

const INITIAL_HOSP_MAP = Object.fromEntries(INITIAL_HOSPITALS.map(h => [h.id, h]));

function mergeWithInitialHospitals(firebaseHospitals) {
  return firebaseHospitals.map(hosp => {
    const seed = INITIAL_HOSP_MAP[hosp.id];
    if (!seed) return hosp;
    const merged = { ...hosp };
    // Seed contacts only if the hospital currently has none
    if ((!merged.contacts || merged.contacts.length === 0) && seed.contacts?.length > 0) {
      merged.contacts = seed.contacts;
    }
    return merged;
  });
}

function saveHospitals(hospitals) {
  const obj = {};
  hospitals.forEach(h => { obj[h.id] = h; });
  set(ref(db, HOSPITALS_PATH), obj);
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

/* ══════════════════════════════════════════
   SHARED COMPONENTS
══════════════════════════════════════════ */
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

/* ── Universal edit modal ── */
function EditModal({ row, fields, onSave, onClose, isMobile }) {
  const [editing, setEditing] = useState(null); // { key, draft }
  const inputRef = useRef(null);

  const openField = (field) => {
    setEditing({ key: field.key, draft: row[field.key] ?? '' });
  };

  const saveField = () => {
    if (!editing) return;
    onSave(editing.key, editing.draft);
    setEditing(null);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      const f = fields.find(f => f.key === editing.key);
      if (f?.type !== 'select') setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [editing, fields]);

  const field = editing ? fields.find(f => f.key === editing.key) : null;

  return (
    <div className="edit-modal-overlay" onClick={onClose}>
      <div className={`edit-modal ${isMobile ? 'edit-modal--bottom' : 'edit-modal--center'}`}
        onClick={e => e.stopPropagation()}>

        {/* Inner field edit */}
        {editing && field ? (
          <>
            <div className="edit-modal-header">
              <button className="edit-modal-btn edit-modal-btn--cancel" onClick={() => setEditing(null)}>← Back</button>
              <span className="edit-modal-title">{field.label}</span>
              <button className="edit-modal-btn edit-modal-btn--save" onClick={saveField}>Save</button>
            </div>
            <div className="edit-modal-context">{row.name || row.trialName}</div>
            <div className="edit-modal-body">
              {field.type === 'select' && (
                <div className="edit-select-grid">
                  {(SELECT_OPTIONS[field.key === 'contactStatus' ? 'status' : field.key] || SELECT_OPTIONS.status).map(opt => (
                    <button key={opt}
                      className={`edit-select-opt ${editing.draft === opt ? 'edit-select-opt--active' : ''}`}
                      onClick={() => { onSave(field.key, opt); setEditing(null); }}>
                      {BADGE_COLORS['status']?.[opt]
                        ? <Badge value={opt} type="status" />
                        : BADGE_COLORS[field.key]?.[opt]
                          ? <Badge value={opt} type={field.key} />
                          : opt}
                    </button>
                  ))}
                  <button className="edit-select-opt edit-select-opt--clear"
                    onClick={() => { onSave(field.key, ''); setEditing(null); }}>— Clear —</button>
                </div>
              )}
              {field.type === 'url' && (
                <div className="edit-url-wrap">
                  <input ref={inputRef} className="edit-input" type="url"
                    value={editing.draft} onChange={e => setEditing(p => ({ ...p, draft: e.target.value }))}
                    placeholder="https://…" />
                  {editing.draft && (
                    <a href={editing.draft} target="_blank" rel="noreferrer" className="edit-url-open">
                      🔗 Open link
                    </a>
                  )}
                </div>
              )}
              {field.type === 'textarea' && (
                <textarea ref={inputRef} className="edit-textarea"
                  value={editing.draft}
                  onChange={e => setEditing(p => ({ ...p, draft: e.target.value }))}
                  placeholder={`Enter ${field.label}…`} rows={8} />
              )}
              {field.type === 'text' && (
                <input ref={inputRef} className="edit-input"
                  value={editing.draft}
                  onChange={e => setEditing(p => ({ ...p, draft: e.target.value }))}
                  placeholder={`Enter ${field.label}…`} />
              )}
            </div>
          </>
        ) : (
          /* Field list view */
          <>
            <div className="edit-modal-header">
              <button className="edit-modal-btn edit-modal-btn--cancel" onClick={onClose}>Close</button>
              <span className="edit-modal-title">{row.name || row.trialName || 'Edit'}</span>
              <div />
            </div>
            <div className="edit-modal-body edit-modal-body--list">
              {fields.map(f => {
                const val = row[f.key] ?? '';
                return (
                  <div key={f.key} className="edit-field-row" onClick={() => openField(f)}>
                    <span className="edit-field-label">{f.label}</span>
                    <span className="edit-field-val">
                      {f.type === 'select'
                        ? <Badge value={val} type={f.key === 'contactStatus' ? 'status' : f.key} />
                        : f.type === 'url' && val
                          ? <a href={val} target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()} className="accord-field-link">🔗 Link</a>
                          : val || <span className="accord-field-empty">—</span>}
                    </span>
                    <span className="edit-field-arrow">›</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Link Study modal ── */
function LinkStudyModal({ hospital, allTrials, onSave, onClose, isMobile }) {
  const [linked, setLinked] = useState(new Set(hospital.linkedStudies || []));
  const [search, setSearch] = useState('');

  const isCarT = t => t === 'CAR-T Cell Therapy' || t === 'Allogeneic CAR-T';
  const sorted = [...allTrials].sort((a, b) => {
    const ac = isCarT(a.treatmentType) ? 0 : 1, bc = isCarT(b.treatmentType) ? 0 : 1;
    if (ac !== bc) return ac - bc;
    return a.trialName.localeCompare(b.trialName);
  });
  const filtered = sorted.filter(t =>
    !search || t.trialName.toLowerCase().includes(search.toLowerCase()) ||
    (t.nctNumber || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggle = id => setLinked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="edit-modal-overlay" onClick={onClose}>
      <div className={`edit-modal link-modal ${isMobile ? 'edit-modal--bottom' : 'edit-modal--center'}`}
        onClick={e => e.stopPropagation()}>
        <div className="edit-modal-header">
          <button className="edit-modal-btn edit-modal-btn--cancel" onClick={onClose}>Cancel</button>
          <span className="edit-modal-title">Link Studies</span>
          <button className="edit-modal-btn edit-modal-btn--save"
            onClick={() => { onSave([...linked]); onClose(); }}>Save</button>
        </div>
        <div className="link-search-wrap">
          <input className="search-input" placeholder="Search studies…"
            value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="link-list">
          {filtered.map(trial => (
            <label key={trial.id} className={`link-row ${linked.has(trial.id) ? 'link-row--checked' : ''}`}>
              <input type="checkbox" checked={linked.has(trial.id)}
                onChange={() => toggle(trial.id)} className="link-checkbox" />
              <div className="link-row-info">
                <span className="link-row-name">{trial.trialName}</span>
                <div className="link-row-badges">
                  {trial.treatmentType && <Badge value={trial.treatmentType} type="treatmentType" />}
                  {trial.nctNumber && <span className="link-nct">{trial.nctNumber}</span>}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   CONTACT EDIT MODAL
══════════════════════════════════════════ */
function ContactEditModal({ contact, hospital, isNew, onSave, onClose, isMobile }) {
  const [draft, setDraft] = useState({ ...contact });
  const nameRef = useRef(null);
  useEffect(() => { setTimeout(() => nameRef.current?.focus(), 60); }, []);

  return (
    <div className="edit-modal-overlay" onClick={onClose}>
      <div className={`edit-modal ${isMobile ? 'edit-modal--bottom' : 'edit-modal--center'}`}
        onClick={e => e.stopPropagation()}>
        <div className="edit-modal-header">
          <button className="edit-modal-btn edit-modal-btn--cancel" onClick={onClose}>Cancel</button>
          <span className="edit-modal-title">{isNew ? 'Add Contact' : 'Edit Contact'}</span>
          <button className="edit-modal-btn edit-modal-btn--save"
            onClick={() => { onSave(draft); onClose(); }}>Save</button>
        </div>
        <div className="edit-modal-context">{hospital.name}</div>
        <div className="edit-modal-body">
          <div className="contact-form">
            <label className="contact-form-label">Name</label>
            <input ref={nameRef} className="edit-input" value={draft.name}
              onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
              placeholder="Contact name…" />

            <label className="contact-form-label">Email</label>
            <input className="edit-input" type="email" value={draft.email}
              onChange={e => setDraft(p => ({ ...p, email: e.target.value }))}
              placeholder="email@hospital.com" />

            <label className="contact-form-label">Email Status</label>
            <div className="edit-select-grid">
              {['Email Not Sent', 'Email Sent'].map(opt => (
                <button key={opt}
                  className={`edit-select-opt ${draft.emailStatus === opt ? 'edit-select-opt--active' : ''}`}
                  onClick={() => setDraft(p => ({ ...p, emailStatus: opt }))}>
                  <span className={`email-status-dot email-status-dot--${opt === 'Email Sent' ? 'sent' : 'not-sent'}`} />
                  {opt}
                </button>
              ))}
            </div>

            <label className="contact-form-label">Phone</label>
            <input className="edit-input" type="tel" value={draft.phone}
              onChange={e => setDraft(p => ({ ...p, phone: e.target.value }))}
              placeholder="(555) 000-0000" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   STUDIES TAB — Accordion
══════════════════════════════════════════ */
function StudiesAccordion({ rows, onEdit, onDelete, isMobile }) {
  const [expandedId, setExpandedId] = useState(null);
  return (
    <div className="accordion-list">
      {rows.map((row, idx) => {
        const isOpen = expandedId === row.id;
        return (
          <div key={row.id} className={`accord-card ${isOpen ? 'accord-card--open' : ''}`}>
            <button className="accord-header" onClick={() => setExpandedId(isOpen ? null : row.id)}>
              <span className="accord-num">{idx + 1}</span>
              <span className="accord-name">{row.trialName || <em>Untitled</em>}</span>
              <div className="accord-badges">
                {row.status        && <Badge value={row.status}        type="status" />}
                {row.treatmentType && <Badge value={row.treatmentType} type="treatmentType" />}
                {row.msTypeEligible && !isMobile && <Badge value={row.msTypeEligible} type="msTypeEligible" />}
              </div>
              <span className="accord-chevron">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="accord-body">
                <div className="accord-fields">
                  {COLUMNS.filter(c => c.key !== 'trialName').map(col => {
                    const val = row[col.key] ?? '';
                    return (
                      <div key={col.key}
                        className={`accord-field ${col.type === 'textarea' ? 'accord-field--wide' : ''}`}
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
                              : val || <span className="accord-field-empty">—</span>}
                        </span>
                        <span className="accord-field-edit">✏️</span>
                      </div>
                    );
                  })}
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

/* ══════════════════════════════════════════
   HOSPITALS TAB
══════════════════════════════════════════ */
function HospitalsTab({ hospitals, allTrials, onUpdateHospital, onAddHospital, onDeleteHospital, isMobile }) {
  const [expandedId, setExpandedId] = useState(null);
  const [editingHospital, setEditingHospital] = useState(null);
  const [linkingHospital, setLinkingHospital] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingContact, setEditingContact] = useState(null); // { hospital, contact, isNew }

  const handleSaveField = (hospital, key, value) => {
    onUpdateHospital({ ...hospital, [key]: value });
  };

  const handleSaveLinked = (hospital, linkedStudies) => {
    onUpdateHospital({ ...hospital, linkedStudies });
  };

  const addContact = (hosp) => {
    const blank = { id: `c-${Date.now()}`, name: '', email: '', emailStatus: 'Email Not Sent', phone: '' };
    setEditingContact({ hospital: hosp, contact: blank, isNew: true });
  };

  const saveContact = (hosp, contact, isNew) => {
    const contacts = [...(hosp.contacts || [])];
    if (isNew) {
      contacts.push(contact);
    } else {
      const idx = contacts.findIndex(c => c.id === contact.id);
      if (idx >= 0) contacts[idx] = contact;
    }
    onUpdateHospital({ ...hosp, contacts });
  };

  const updateContactField = (hosp, contactId, key, value) => {
    const contacts = (hosp.contacts || []).map(c => c.id === contactId ? { ...c, [key]: value } : c);
    onUpdateHospital({ ...hosp, contacts });
  };

  const removeContact = (hosp, contactId) => {
    const contacts = (hosp.contacts || []).filter(c => c.id !== contactId);
    onUpdateHospital({ ...hosp, contacts });
  };

  return (
    <div className="list-container">
      <div className="accordion-list">
        {hospitals.map((hosp) => {
          const isOpen = expandedId === hosp.id;
          const linkedTrials = allTrials.filter(t => (hosp.linkedStudies || []).includes(t.id));
          const contacts = hosp.contacts || [];
          return (
            <div key={hosp.id} className={`accord-card ${isOpen ? 'accord-card--open' : ''}`}>
              {/* Collapsed header */}
              <button className="accord-header" onClick={() => setExpandedId(isOpen ? null : hosp.id)}>
                <span className="accord-num">🏥</span>
                <span className="accord-name">{hosp.name || <em>Unnamed Hospital</em>}</span>
                <div className="accord-badges">
                  {hosp.contactStatus && <Badge value={hosp.contactStatus} type="status" />}
                  {contacts.length > 0 && (
                    <span className="hosp-contact-count">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
                  )}
                  {linkedTrials.length > 0 && (
                    <span className="hosp-study-count">{linkedTrials.length} stud{linkedTrials.length === 1 ? 'y' : 'ies'}</span>
                  )}
                </div>
                <span className="accord-chevron">{isOpen ? '▲' : '▼'}</span>
              </button>

              {/* Expanded */}
              {isOpen && (
                <div className="accord-body">
                  {/* Hospital info fields (website, contactStatus, notes) */}
                  <div className="accord-fields">
                    {HOSPITAL_FIELDS.filter(f => f.key !== 'name').map(f => {
                      const val = hosp[f.key] ?? '';
                      return (
                        <div key={f.key}
                          className={`accord-field ${f.type === 'textarea' ? 'accord-field--wide' : ''}`}
                          onClick={() => setEditingHospital({ hospital: hosp, field: f })}>
                          <span className="accord-field-label">{f.label}</span>
                          <span className="accord-field-value">
                            {f.type === 'select'
                              ? <Badge value={val} type="status" />
                              : f.type === 'url' && val
                                ? <a href={val} target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()} className="accord-field-link">🔗 Website</a>
                                : val || <span className="accord-field-empty">—</span>}
                          </span>
                          <span className="accord-field-edit">✏️</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Contacts section ── */}
                  <div className="hosp-contacts-section">
                    <div className="hosp-contacts-header">
                      <span className="hosp-contacts-title">👤 Contacts</span>
                      <button className="btn btn--primary btn--sm" onClick={e => { e.stopPropagation(); addContact(hosp); }}>
                        + Add Contact
                      </button>
                    </div>
                    {contacts.length === 0
                      ? <p className="hosp-no-contacts">No contacts yet — click "+ Add Contact" to add one.</p>
                      : contacts.map(contact => (
                          <div key={contact.id} className="contact-row">
                            <div className="contact-info">
                              <span className="contact-name">
                                {contact.name || <em className="accord-field-empty">Unnamed</em>}
                              </span>
                              {contact.email && (
                                <div className="contact-email-row">
                                  <a href={`mailto:${contact.email}`} className="contact-email"
                                    onClick={e => e.stopPropagation()}>{contact.email}</a>
                                  <select
                                    className={`email-status-select email-status-select--${contact.emailStatus === 'Email Sent' ? 'sent' : 'not-sent'}`}
                                    value={contact.emailStatus || 'Email Not Sent'}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => updateContactField(hosp, contact.id, 'emailStatus', e.target.value)}>
                                    <option value="Email Not Sent">Email Not Sent</option>
                                    <option value="Email Sent">Email Sent</option>
                                  </select>
                                </div>
                              )}
                              {contact.phone && (
                                <div className="contact-phone-row">
                                  <span className="contact-phone">{contact.phone}</span>
                                  <a href={`tel:${contact.phone.replace(/\D/g,'')}`}
                                    className="contact-call-btn" onClick={e => e.stopPropagation()}>
                                    📞 Call
                                  </a>
                                </div>
                              )}
                            </div>
                            <div className="contact-actions">
                              <button className="contact-edit-btn"
                                onClick={e => { e.stopPropagation(); setEditingContact({ hospital: hosp, contact, isNew: false }); }}>
                                ✏️
                              </button>
                              <button className="contact-remove-btn"
                                onClick={e => { e.stopPropagation(); removeContact(hosp, contact.id); }}>
                                ✕
                              </button>
                            </div>
                          </div>
                        ))
                    }
                  </div>

                  {/* ── Linked studies section ── */}
                  <div className="hosp-studies-section">
                    <div className="hosp-studies-header">
                      <span className="hosp-studies-title">🧬 Linked Studies</span>
                      <button className="btn btn--primary btn--sm"
                        onClick={e => { e.stopPropagation(); setLinkingHospital(hosp); }}>+ Link Study</button>
                    </div>
                    {linkedTrials.length === 0
                      ? <p className="hosp-no-studies">No studies linked yet — click "+ Link Study" to add.</p>
                      : linkedTrials.map(trial => (
                          <div key={trial.id} className="hosp-study-row">
                            <div className="hosp-study-info">
                              <span className="hosp-study-name">{trial.trialName}</span>
                              <div className="hosp-study-badges">
                                {trial.status        && <Badge value={trial.status}        type="status" />}
                                {trial.treatmentType && <Badge value={trial.treatmentType} type="treatmentType" />}
                                {trial.nctNumber     && <span className="link-nct">{trial.nctNumber}</span>}
                              </div>
                            </div>
                          </div>
                        ))
                    }
                  </div>

                  {/* Hospital name edit */}
                  <div className="accord-field accord-field--wide accord-field--name"
                    onClick={() => setEditingHospital({ hospital: hosp, field: HOSPITAL_FIELDS[0] })}>
                    <span className="accord-field-label">Hospital Name</span>
                    <span className="accord-field-value">{hosp.name || <span className="accord-field-empty">—</span>}</span>
                    <span className="accord-field-edit">✏️</span>
                  </div>

                  <button className="accord-delete-btn"
                    onClick={e => { e.stopPropagation(); setConfirmDelete(hosp.id); }}>
                    🗑 Delete this hospital
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button className="hosp-add-btn" onClick={onAddHospital}>+ Add Hospital</button>
      </div>

      <div className="list-footer">
        <span>{hospitals.length} hospital{hospitals.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Edit hospital field modal */}
      {editingHospital && (
        <div className="edit-modal-overlay" onClick={() => setEditingHospital(null)}>
          <div className={`edit-modal ${isMobile ? 'edit-modal--bottom' : 'edit-modal--center'}`}
            onClick={e => e.stopPropagation()}>
            <div className="edit-modal-header">
              <button className="edit-modal-btn edit-modal-btn--cancel" onClick={() => setEditingHospital(null)}>Cancel</button>
              <span className="edit-modal-title">{editingHospital.field.label}</span>
              <button className="edit-modal-btn edit-modal-btn--save"
                onClick={() => {
                  handleSaveField(editingHospital.hospital, editingHospital.field.key, editingHospital.draft ?? (editingHospital.hospital[editingHospital.field.key] || ''));
                  setEditingHospital(null);
                }}>Save</button>
            </div>
            <div className="edit-modal-context">{editingHospital.hospital.name}</div>
            <HospFieldEditor
              field={editingHospital.field}
              value={editingHospital.draft ?? (editingHospital.hospital[editingHospital.field.key] || '')}
              onChange={draft => setEditingHospital(p => ({ ...p, draft }))}
              onQuickSave={(val) => {
                handleSaveField(editingHospital.hospital, editingHospital.field.key, val);
                setEditingHospital(null);
              }} />
          </div>
        </div>
      )}

      {/* Contact edit modal */}
      {editingContact && (
        <ContactEditModal
          contact={editingContact.contact}
          hospital={editingContact.hospital}
          isNew={editingContact.isNew}
          isMobile={isMobile}
          onSave={draft => saveContact(editingContact.hospital, draft, editingContact.isNew)}
          onClose={() => setEditingContact(null)} />
      )}

      {/* Link study modal */}
      {linkingHospital && (
        <LinkStudyModal
          hospital={linkingHospital}
          allTrials={allTrials}
          isMobile={isMobile}
          onSave={linked => handleSaveLinked(linkingHospital, linked)}
          onClose={() => setLinkingHospital(null)} />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete this hospital?</h3>
            <p>This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn--danger" onClick={() => { onDeleteHospital(confirmDelete); setConfirmDelete(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Small inline field editor used inside hospital edit modal */
function HospFieldEditor({ field, value, onChange, onQuickSave }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (inputRef.current && field.type !== 'select') setTimeout(() => inputRef.current?.focus(), 60);
  }, [field.type]);

  if (field.type === 'select') {
    const opts = SELECT_OPTIONS['status'];
    return (
      <div className="edit-modal-body">
        <div className="edit-select-grid">
          {opts.map(opt => (
            <button key={opt}
              className={`edit-select-opt ${value === opt ? 'edit-select-opt--active' : ''}`}
              onClick={() => onQuickSave(opt)}>
              <Badge value={opt} type="status" />
            </button>
          ))}
          <button className="edit-select-opt edit-select-opt--clear"
            onClick={() => onQuickSave('')}>— Clear —</button>
        </div>
      </div>
    );
  }
  if (field.type === 'textarea') {
    return (
      <div className="edit-modal-body">
        <textarea ref={inputRef} className="edit-textarea" value={value}
          onChange={e => onChange(e.target.value)} rows={8} placeholder={`Enter ${field.label}…`} />
      </div>
    );
  }
  if (field.type === 'url') {
    return (
      <div className="edit-modal-body">
        <div className="edit-url-wrap">
          <input ref={inputRef} className="edit-input" type="url" value={value}
            onChange={e => onChange(e.target.value)} placeholder="https://…" />
          {value && <a href={value} target="_blank" rel="noreferrer" className="edit-url-open">🔗 Open</a>}
        </div>
      </div>
    );
  }
  return (
    <div className="edit-modal-body">
      <input ref={inputRef} className="edit-input" value={value}
        onChange={e => onChange(e.target.value)} placeholder={`Enter ${field.label}…`} />
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════ */
export default function App() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('studies');

  // Studies state
  const [rows, setRows]       = useState([]);
  const [trialsLoading, setTrialsLoading] = useState(true);
  const [editModal, setEditModal]   = useState(null);
  const [search, setSearch]     = useState('');
  const [filters, setFilters]   = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showSearch, setShowSearch]   = useState(false);

  // Hospitals state
  const [hospitals, setHospitals]   = useState([]);
  const [hospsLoading, setHospsLoading] = useState(true);

  /* ── Firebase: trials ── */
  useEffect(() => {
    const trialsRef = ref(db, TRIALS_PATH);
    return onValue(trialsRef, snapshot => {
      const data = snapshot.val();
      if (!data) {
        saveTrials(INITIAL_DATA); setRows(INITIAL_DATA);
      } else {
        const arr = migrateRows(Object.values(data));
        const withUpdates = mergeWithInitial(arr);
        const savedNcts = new Set(withUpdates.map(r => r.nctNumber).filter(Boolean));
        const newTrials = INITIAL_DATA.filter(r => r.nctNumber && !savedNcts.has(r.nctNumber));
        const final = newTrials.length ? [...withUpdates, ...newTrials] : withUpdates;
        saveTrials(final); setRows(final);
      }
      setTrialsLoading(false);
    });
  }, []);

  /* ── Firebase: hospitals ── */
  useEffect(() => {
    const hospsRef = ref(db, HOSPITALS_PATH);
    return onValue(hospsRef, snapshot => {
      const data = snapshot.val();
      if (!data) {
        saveHospitals(INITIAL_HOSPITALS); setHospitals(INITIAL_HOSPITALS);
      } else {
        const arr = Object.values(data);
        const merged = mergeWithInitialHospitals(arr);
        // Check if new hospitals in INITIAL_HOSPITALS are missing from Firebase
        const savedIds = new Set(merged.map(h => h.id));
        const newHosps = INITIAL_HOSPITALS.filter(h => !savedIds.has(h.id));
        const final = newHosps.length ? [...merged, ...newHosps] : merged;
        saveHospitals(final); setHospitals(final);
      }
      setHospsLoading(false);
    });
  }, []);

  /* ── Trial helpers ── */
  const updateCell = useCallback((rowId, colKey, value) => {
    setRows(prev => {
      const updated = prev.map(r => r.id === rowId ? { ...r, [colKey]: value } : r);
      saveTrials(updated);
      return updated;
    });
  }, []);

  const addTrial = () => {
    const newRow = { id: String(Date.now()), ...Object.fromEntries(COLUMNS.map(c => [c.key, ''])) };
    newRow.status = 'Not Contacted';
    const next = [...rows, newRow];
    setRows(next); saveTrials(next);
    setTimeout(() => setEditModal({ row: newRow, col: COLUMNS.find(c => c.key === 'trialName') }), 50);
  };

  const deleteTrial = id => {
    const next = rows.filter(r => r.id !== id);
    setRows(next); saveTrials(next); setConfirmDelete(null);
  };

  /* ── Hospital helpers ── */
  const updateHospital = useCallback((updated) => {
    setHospitals(prev => {
      const next = prev.map(h => h.id === updated.id ? updated : h);
      saveHospitals(next);
      return next;
    });
  }, []);

  const addHospital = () => {
    const h = { id: `hosp-${Date.now()}`, name: '', address: '', phone: '', email: '',
      website: '', contactStatus: 'Not Contacted', notes: '', linkedStudies: [] };
    const next = [...hospitals, h];
    setHospitals(next); saveHospitals(next);
  };

  const deleteHospital = id => {
    const next = hospitals.filter(h => h.id !== id);
    setHospitals(next); saveHospitals(next);
  };

  /* ── Filtered/sorted trials ── */
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
      const ac = isCarT(a.treatmentType) ? 0 : 1, bc = isCarT(b.treatmentType) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.trialName.localeCompare(b.trialName);
    });

  const setFilter = (key, val) => setFilters(prev =>
    val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key))
  );

  const contactedCount = rows.filter(r => r.status === 'Contacted' || r.status === 'In Talks').length;
  const inTalksCount   = rows.filter(r => r.status === 'In Talks').length;
  const activeFilters  = Object.keys(filters).length;
  const loading = trialsLoading || hospsLoading;

  if (loading) {
    return (
      <div className="app">
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:15 }}>
          Loading…
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
          <div className="stat"><span className="stat-num">{rows.length}</span><span className="stat-label">Trials</span></div>
          <div className="stat stat--green"><span className="stat-num">{contactedCount}</span><span className="stat-label">Contacted</span></div>
          <div className="stat stat--purple"><span className="stat-num">{inTalksCount}</span><span className="stat-label">In Talks</span></div>
        </div>
        <div className="header-actions">
          {isMobile ? (
            <>
              <button className="btn btn--icon" onClick={() => setShowSearch(s => !s)}>🔍</button>
              <button className="btn btn--primary" onClick={activeTab === 'studies' ? addTrial : addHospital}>＋</button>
            </>
          ) : (
            <>
              {activeTab === 'studies' && (
                <button className="btn btn--ghost" onClick={() => exportCSV(filtered)}>↓ CSV</button>
              )}
              <button className="btn btn--primary" onClick={activeTab === 'studies' ? addTrial : addHospital}>
                + {activeTab === 'studies' ? 'Add Trial' : 'Add Hospital'}
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'studies' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('studies')}>
          🧬 Studies <span className="tab-count">{rows.length}</span>
        </button>
        <button className={`tab-btn ${activeTab === 'hospitals' ? 'tab-btn--active' : ''}`}
          onClick={() => setActiveTab('hospitals')}>
          🏥 Hospitals <span className="tab-count">{hospitals.length}</span>
        </button>
      </div>

      {/* ── Studies tab ── */}
      {activeTab === 'studies' && (
        <>
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
                    <option value="">{isMobile ? col.label.replace('Treatment Type','Type').replace('MS Type Eligible','MS') : `All ${col.label}`}</option>
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

          <div className="list-container">
            {filtered.length === 0
              ? <div className="empty-state">No trials match your search.</div>
              : <StudiesAccordion rows={filtered} isMobile={isMobile}
                  onEdit={(row, col) => setEditModal({ row, col })}
                  onDelete={id => setConfirmDelete(id)} />
            }
            <div className="list-footer">
              <span>{filtered.length} of {rows.length} trials</span>
              {isMobile && <button className="btn btn--ghost btn--sm" onClick={() => exportCSV(filtered)}>↓ CSV</button>}
            </div>
          </div>

          {/* Study edit modal */}
          {editModal && (
            <div className="edit-modal-overlay" onClick={() => setEditModal(null)}>
              <div className={`edit-modal ${isMobile ? 'edit-modal--bottom' : 'edit-modal--center'}`}
                onClick={e => e.stopPropagation()}>
                <div className="edit-modal-header">
                  <button className="edit-modal-btn edit-modal-btn--cancel" onClick={() => setEditModal(null)}>Cancel</button>
                  <span className="edit-modal-title">{editModal.col.label}</span>
                  <button className="edit-modal-btn edit-modal-btn--save"
                    onClick={() => {
                      updateCell(editModal.row.id, editModal.col.key, editModal.draft ?? (editModal.row[editModal.col.key] || ''));
                      setEditModal(null);
                    }}>Save</button>
                </div>
                <div className="edit-modal-context">{editModal.row.trialName}</div>
                <HospFieldEditor
                  field={editModal.col}
                  value={editModal.draft ?? (editModal.row[editModal.col.key] || '')}
                  onChange={draft => setEditModal(p => ({ ...p, draft }))}
                  onQuickSave={(val) => { updateCell(editModal.row.id, editModal.col.key, val); setEditModal(null); }} />
              </div>
            </div>
          )}

          {confirmDelete && (
            <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <h3>Delete this trial?</h3>
                <p>This action cannot be undone.</p>
                <div className="modal-actions">
                  <button className="btn btn--ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  <button className="btn btn--danger" onClick={() => deleteTrial(confirmDelete)}>Delete</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Hospitals tab ── */}
      {activeTab === 'hospitals' && (
        <HospitalsTab
          hospitals={hospitals}
          allTrials={rows}
          isMobile={isMobile}
          onUpdateHospital={updateHospital}
          onAddHospital={addHospital}
          onDeleteHospital={deleteHospital} />
      )}
    </div>
  );
}
