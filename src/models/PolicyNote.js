import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    currentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'PolicyVersion', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'policyNotes' },
);

export const PolicyNote = mongoose.models.PolicyNote || mongoose.model('PolicyNote', schema);
