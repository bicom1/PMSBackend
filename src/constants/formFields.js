function field(departmentCode, partial) {
  return {
    departmentCode,
    required: false,
    locked: false,
    isSystem: true,
    isActive: true,
    allowCustom: false,
    unit: '',
    placeholder: '',
    optionsSource: '',
    metadata: {},
    ...partial,
  };
}

const shared = (departmentCode) => [
  field(departmentCode, { key: 'contactNumber', label: 'Contact number', section: 'identification', fieldType: 'tel', required: true, placeholder: '0300 1234567', sortOrder: 10 }),
  field(departmentCode, { key: 'fullName', label: 'Patient name', section: 'identification', fieldType: 'text', required: true, placeholder: 'Full name', sortOrder: 20 }),
  field(departmentCode, { key: 'cnic', label: 'CNIC / Passport', section: 'identification', fieldType: 'text', required: true, placeholder: '12345-1234567-1', sortOrder: 30 }),
  field(departmentCode, { key: 'dateOfBirth', label: 'Date of birth', section: 'personal', fieldType: 'date', required: true, sortOrder: 10 }),
  field(departmentCode, { key: 'age', label: 'Age', section: 'personal', fieldType: 'age', sortOrder: 20 }),
  field(departmentCode, { key: 'gender', label: 'Gender', section: 'personal', fieldType: 'select', optionsSource: 'GENDER', required: true, sortOrder: 30 }),
  field(departmentCode, { key: 'nationality', label: 'Nationality', section: 'personal', fieldType: 'select', optionsSource: 'NATIONALITY', required: true, allowCustom: true, sortOrder: 40 }),
  field(departmentCode, { key: 'occupation', label: 'Occupation', section: 'personal', fieldType: 'select', optionsSource: 'OCCUPATION', required: true, allowCustom: true, sortOrder: 50 }),
  field(departmentCode, { key: 'weightKg', label: 'Weight (kg)', section: 'personal', fieldType: 'select', optionsSource: 'WEIGHT', required: true, allowCustom: true, unit: 'kg', sortOrder: 60 }),
  field(departmentCode, { key: 'heightCm', label: 'Height (in)', section: 'personal', fieldType: 'select', optionsSource: 'HEIGHT', required: true, allowCustom: true, unit: 'in', sortOrder: 70 }),
  field(departmentCode, { key: 'city', label: 'City', section: 'personal', fieldType: 'select', optionsSource: 'CITY', required: true, allowCustom: true, sortOrder: 80 }),
  field(departmentCode, { key: 'address', label: 'Address', section: 'personal', fieldType: 'text', required: true, sortOrder: 90 }),
  field(departmentCode, { key: 'doctorId', label: 'Doctor', section: 'visit', fieldType: 'doctor', required: false, sortOrder: 10 }),
  field(departmentCode, { key: 'procedureId', label: 'Procedure', section: 'visit', fieldType: 'procedure', required: false, sortOrder: 20 }),
  field(departmentCode, { key: 'referredBy', label: 'Referred by', section: 'visit', fieldType: 'select', optionsSource: 'REFERRAL_SOURCE', required: false, allowCustom: true, sortOrder: 30 }),
  field(departmentCode, { key: 'formDate', label: 'Form date', section: 'visit', fieldType: 'date', required: false, sortOrder: 40 }),
];

const surgeryDetails = [
  field('SURGERY', { key: 'anesthesiaType', label: 'Anesthesia type', section: 'details', fieldType: 'select', optionsSource: 'ANESTHESIA_TYPE', allowCustom: true, sortOrder: 10 }),
  field('SURGERY', { key: 'diet', label: 'Diet', section: 'details', fieldType: 'select', optionsSource: 'DIET', allowCustom: true, sortOrder: 20 }),
  field('SURGERY', { key: 'bloodTestStatus', label: 'Blood test status', section: 'details', fieldType: 'select', optionsSource: 'BLOOD_TEST_STATUS', allowCustom: true, sortOrder: 30 }),
  field('SURGERY', { key: 'locationOfSurgery', label: 'Location of surgery', section: 'details', fieldType: 'select', optionsSource: 'SURGERY_LOCATION', allowCustom: true, sortOrder: 40 }),
  field('SURGERY', { key: 'mri', label: 'MRI', section: 'details', fieldType: 'select', optionsSource: 'MRI_STATUS', allowCustom: true, sortOrder: 50 }),
  field('SURGERY', { key: 'surgeryCost', label: 'Surgery cost', section: 'details', fieldType: 'number', sortOrder: 60 }),
  field('SURGERY', { key: 'followUpSessions', label: 'Follow-up sessions', section: 'details', fieldType: 'select', optionsSource: 'FOLLOW_UP', allowCustom: true, sortOrder: 70 }),
  field('SURGERY', { key: 'anyOther', label: 'Any other', section: 'details', fieldType: 'textarea', sortOrder: 80 }),
];

export const DEFAULT_FORM_FIELDS = [
  ...shared('SKIN'),
  ...shared('SURGERY'),
  ...surgeryDetails,
];
