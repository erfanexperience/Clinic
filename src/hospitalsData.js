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
    contacts: [
      { id: 'c-ucsd-1', name: 'Shandel Odom',   email: 'sodom@health.ucsd.edu',   emailStatus: 'Email Not Sent', phone: '858-246-2905' },
      { id: 'c-ucsd-2', name: 'Gisselle Paez',  email: 'g1paez@health.ucsd.edu',  emailStatus: 'Email Not Sent', phone: '858-246-2905' },
      { id: 'c-ucsd-3', name: 'Soha Fardad',    email: 'sofardad@health.ucsd.edu', emailStatus: 'Email Not Sent', phone: '858-246-2905' },
    ],
    linkedStudies: [],
  },
  {
    id: 'hosp-unmc',
    name: 'University of Nebraska Medical Center',
    website: '',
    contactStatus: 'Not Contacted',
    notes: '',
    contacts: [
      { id: 'c-unmc-1', name: 'Dr. Rana K. Zabad, MD', email: '', emailStatus: 'Email Not Sent', phone: '(402) 559-8600' },
    ],
    linkedStudies: [],
  },
];
