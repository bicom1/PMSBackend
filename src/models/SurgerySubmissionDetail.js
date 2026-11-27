import mongoose from 'mongoose';

const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    value: { type: String, default: '' },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true, unique: true },
    anesthesiaType: { type: String, default: '' },
    anesthesiaTypeLabel: { type: String, default: '' },
    diet: { type: String, default: '' },
    dietLabel: { type: String, default: '' },
    bloodTestStatus: { type: String, default: '' },
    bloodTestStatusLabel: { type: String, default: '' },
    surgeryCost: { type: Number, default: null },
    followUpSessions: { type: Number, default: null },
    locationOfSurgery: { type: String, default: '' },
    locationOfSurgeryLabel: { type: String, default: '' },
    mri: { type: String, default: '' },
    mriLabel: { type: String, default: '' },
    anyOther: { type: String, default: '' },
    fields: { type: [fieldSchema], default: [] },
    pendingClinicConfirmation: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'surgerySubmissionDetails' },
);

export const SurgerySubmissionDetail = mongoose.models.SurgerySubmissionDetail || mongoose.model('SurgerySubmissionDetail', schema);
