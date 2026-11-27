import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    departmentCode: { type: String, enum: ['SKIN', 'SURGERY'], required: true },
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    section: {
      type: String,
      enum: ['identification', 'personal', 'visit', 'details'],
      required: true,
    },
    fieldType: {
      type: String,
      enum: ['text', 'tel', 'date', 'number', 'textarea', 'select', 'doctor', 'procedure', 'age'],
      required: true,
    },
    optionsSource: {
      type: String,
      enum: ['', 'GENDER', 'NATIONALITY', 'OCCUPATION', 'CITY', 'REFERRAL_SOURCE', 'ANESTHESIA_TYPE', 'DIET', 'BLOOD_TEST_STATUS', 'SURGERY_LOCATION', 'MRI_STATUS', 'WEIGHT', 'HEIGHT', 'FOLLOW_UP'],
      default: '',
    },
    required: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    allowCustom: { type: Boolean, default: false },
    unit: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'formFields' },
);

schema.index({ departmentCode: 1, key: 1 }, { unique: true });
schema.index({ departmentCode: 1, isActive: 1, sortOrder: 1 });

export const FormField = mongoose.models.FormField || mongoose.model('FormField', schema);
