export const HOSPITAL_FIELDS = [
  { key: 'name',          label: 'Hospital Name',  type: 'text' },
  { key: 'address',       label: 'Address',        type: 'textarea' },
  { key: 'phone',         label: 'Phone',          type: 'text' },
  { key: 'email',         label: 'Email',          type: 'text' },
  { key: 'website',       label: 'Website',        type: 'url' },
  { key: 'contactStatus', label: 'Contact Status', type: 'select' },
  { key: 'notes',         label: 'Notes',          type: 'textarea' },
];

export const INITIAL_HOSPITALS = [
  {
    id: 'hosp-ucsd',
    name: 'UC San Diego Health — Altman Clinical & Translational Research Institute',
    address: '9452 Medical Center Dr\nLa Jolla, CA 92037',
    phone: '(858) 534-1251',
    email: '',
    website: 'https://health.ucsd.edu',
    contactStatus: 'Not Contacted',
    notes: '',
    linkedStudies: [],
  },
];
