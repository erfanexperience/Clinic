export const HOSPITAL_FIELDS = [
  { key: 'name',          label: 'Hospital Name',  type: 'text' },
  { key: 'website',       label: 'Website',        type: 'url' },
  { key: 'contactStatus', label: 'Contact Status', type: 'select' },
  { key: 'notes',         label: 'Notes',          type: 'textarea' },
];

export const INITIAL_HOSPITALS = [
  {
    id: 'hosp-ucsd',
    name: 'UC San Diego Health — Altman Clinical & Translational Research Institute',
    website: 'https://health.ucsd.edu',
    contactStatus: 'Not Contacted',
    notes: '',
    contacts: [],
    linkedStudies: [],
  },
];
