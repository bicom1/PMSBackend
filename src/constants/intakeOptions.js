function option(type, label, extra = {}) {
  const value = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return { type, label, value, allowOther: false, ...extra };
}

const countries = [
  'Pakistan', 'Afghanistan', 'Australia', 'Bahrain', 'Bangladesh', 'Canada', 'China', 'Egypt',
  'France', 'Germany', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Italy', 'Japan',
  'Jordan', 'Kuwait', 'Malaysia', 'Nepal', 'Netherlands', 'New Zealand', 'Nigeria', 'Oman',
  'Qatar', 'Saudi Arabia', 'Singapore', 'South Africa', 'Sri Lanka', 'Turkey', 'United Arab Emirates',
  'United Kingdom', 'United States',
];

const cities = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Hyderabad', 'Peshawar',
  'Quetta', 'Sialkot', 'Gujranwala', 'Gujrat', 'Bahawalpur', 'Sargodha', 'Sukkur', 'Larkana',
  'Sheikhupura', 'Rahim Yar Khan', 'Jhang', 'Mardan', 'Abbottabad', 'Mirpur',
];

const occupations = ['Student', 'Employee', 'Business', 'Doctor', 'Teacher', 'Engineer', 'Housewife', 'Labor', 'Retired', 'Unemployed', 'Other'];
const referrals = ['Walk-in', 'Doctor', 'Social Media', 'Existing Patient', 'Other'];
const remarks = ['Threads', 'Facial', 'Acne Scar', 'Other'];
const anesthesia = ['Local', 'General', 'Regional', 'Sedation', 'Spinal', 'None'];
const diets = ['NPO', 'Regular', 'Soft', 'Liquid', 'Diabetic'];
const bloodTests = ['Pending', 'Done', 'Normal', 'Abnormal', 'Not Required'];
const locations = ['OT-1', 'OT-2', 'Procedure Room', 'Clinic Room', 'Day Care'];
const mri = ['Not Required', 'Advised', 'Pending', 'Done'];

export const SKIN_PROCEDURES = ['Consultation', 'Follow-up visit', 'Acne treatment', 'Scar treatment', 'Laser session', 'Facial', 'Other'];
export const SURGERY_PROCEDURES = ['Consultation', 'Follow-up visit', 'Minor procedure', 'Day-care surgery', 'Major surgery', 'Other'];

export const INTAKE_OPTIONS = [
  ...countries.map((label, index) => option('NATIONALITY', label, { sortOrder: index })),
  ...cities.map((label, index) => option('CITY', label, { sortOrder: index })),
  ...occupations.map((label, index) => option('OCCUPATION', label, { sortOrder: index, allowOther: label === 'Other' })),
  ...referrals.map((label, index) => option('REFERRAL_SOURCE', label, { sortOrder: index, allowOther: label === 'Other' })),
  ...remarks.map((label, index) => option('REMARK_CATEGORY', label, { sortOrder: index, allowOther: label === 'Other' })),
  ...anesthesia.map((label, index) => option('ANESTHESIA_TYPE', label, { sortOrder: index })),
  ...diets.map((label, index) => option('DIET', label, { sortOrder: index })),
  ...bloodTests.map((label, index) => option('BLOOD_TEST_STATUS', label, { sortOrder: index })),
  ...locations.map((label, index) => option('SURGERY_LOCATION', label, { sortOrder: index })),
  ...mri.map((label, index) => option('MRI_STATUS', label, { sortOrder: index })),
];
