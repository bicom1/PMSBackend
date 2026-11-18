import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    policy: { type: mongoose.Schema.Types.ObjectId, ref: 'PolicyNote', required: true },
    version: { type: Number, required: true },
    items: { type: [String], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'policyVersions' },
);

schema.index({ policy: 1, version: 1 }, { unique: true });

export const PolicyVersion = mongoose.models.PolicyVersion || mongoose.model('PolicyVersion', schema);
