export const ROLES = {
  ADMIN: 'ADMIN',
  CLINIC_MANAGER: 'CLINIC_MANAGER',
  DOCTOR: 'DOCTOR',
};

export const DEPARTMENT_CODES = {
  SKIN: { code: 'SKIN', prefix: 'SKN', name: 'Skin Department' },
  SURGERY: { code: 'SURGERY', prefix: 'SRG', name: 'Surgery Department' },
};

export const BOOKING_STATUS = {
  BOOKED: 'BOOKED',
  NOT_BOOKED: 'NOT_BOOKED',
};

export const CONSULTATION_STATUS = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
};

export const GENDERS = ['Male', 'Female', 'Other'];

export const AUDIT = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PATIENT_CREATED: 'PATIENT_CREATED',
  PATIENT_UPDATED: 'PATIENT_UPDATED',
  PATIENT_IDENTITY_LINKED: 'PATIENT_IDENTITY_LINKED',
  PATIENT_MERGED: 'PATIENT_MERGED',
  FORM_SUBMITTED: 'FORM_SUBMITTED',
  BOOKING_STATUS_CHANGED: 'BOOKING_STATUS_CHANGED',
  DOCTOR_REASSIGNED: 'DOCTOR_REASSIGNED',
  OPERATIONAL_REMARK_UPDATED: 'OPERATIONAL_REMARK_UPDATED',
  CONSULTATION_STATUS_CHANGED: 'CONSULTATION_STATUS_CHANGED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  DOCUMENT_VIEWED: 'DOCUMENT_VIEWED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
  PRESCRIPTION_CREATED: 'PRESCRIPTION_CREATED',
  PRESCRIPTION_VERSIONED: 'PRESCRIPTION_VERSIONED',
  CLINICAL_REMARK_CREATED: 'CLINICAL_REMARK_CREATED',
  CLINICAL_REMARK_VERSIONED: 'CLINICAL_REMARK_VERSIONED',
  MASTER_DATA_CHANGED: 'MASTER_DATA_CHANGED',
  POLICY_CHANGED: 'POLICY_CHANGED',
  DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
  PROCEDURE_CHANGED: 'PROCEDURE_CHANGED',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
};

export const MASTER_TYPES = [
  { type: 'OCCUPATION', label: 'Occupations', description: 'Occupation dropdown options' },
  { type: 'NATIONALITY', label: 'Nationalities', description: 'Nationality dropdown options' },
  { type: 'CITY', label: 'Cities', description: 'City dropdown options' },
  { type: 'REFERRAL_SOURCE', label: 'Referral sources', description: 'Referred-by dropdown options' },
  { type: 'REMARK_CATEGORY', label: 'Remark categories', description: 'Clinical remark categories' },
  { type: 'ANESTHESIA_TYPE', label: 'Anesthesia types', description: 'Provisional until the clinic confirms surgery options' },
  { type: 'DIET', label: 'Diet options', description: 'Provisional until the clinic confirms surgery options' },
  { type: 'BLOOD_TEST_STATUS', label: 'Blood test statuses', description: 'Provisional until the clinic confirms surgery options' },
  { type: 'SURGERY_LOCATION', label: 'Surgery locations', description: 'Provisional until the clinic confirms surgery options' },
  { type: 'MRI_STATUS', label: 'MRI statuses', description: 'Provisional until the clinic confirms surgery options' },
  { type: 'SKIN_FIELD', label: 'Skin form fields', description: 'Admin-managed skin fields. Skin-specific clinical fields stay pending clinic confirmation until configured.' },
];

export const MASTER_TYPE_KEYS = MASTER_TYPES.map((item) => item.type);

export const POLICY_ITEMS = [
  'All fees should be paid before the start of the procedure.',
  'Take the invoice from the counter on the 3rd floor.',
  'CNIC is mandatory at registration.',
  'Follow-up appointments should be booked beforehand.',
  'Blood tests, labs and 30% to 50% advance are mandatory as per surgeon and anesthetist requirements.',
  'Cancellation of surgery will result in zero refund of the advance.',
];

export const SURGERY_SELECTS = [
  { key: 'anesthesiaType', type: 'ANESTHESIA_TYPE', label: 'Anesthesia Type' },
  { key: 'diet', type: 'DIET', label: 'Diet' },
  { key: 'bloodTestStatus', type: 'BLOOD_TEST_STATUS', label: 'Blood Test Status' },
  { key: 'locationOfSurgery', type: 'SURGERY_LOCATION', label: 'Location of Surgery' },
  { key: 'mri', type: 'MRI_STATUS', label: 'MRI' },
];
