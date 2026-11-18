import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    remark: { type: mongoose.Schema.Types.ObjectId, ref: 'DoctorRemark', required: true },
    versionNumber: { type: Number, required: true },
    categories: { type: [String], default: [] },
    categoryLabels: { type: [String], default: [] },
    notes: { type: String, required: true },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedByName: { type: String, required: true },
  },
  { timestamps: true, collection: 'remarkVersions' },
);

schema.index({ remark: 1, versionNumber: 1 }, { unique: true });

export const RemarkVersion = mongoose.models.RemarkVersion || mongoose.model('RemarkVersion', schema);
