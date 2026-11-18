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
    fields: { type: [fieldSchema], default: [] },
    pendingClinicConfirmation: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'skinSubmissionDetails' },
);

export const SkinSubmissionDetail = mongoose.models.SkinSubmissionDetail || mongoose.model('SkinSubmissionDetail', schema);
