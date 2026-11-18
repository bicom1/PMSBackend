import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctorName: { type: String, required: true },
    categories: { type: [String], default: [] },
    currentVersion: { type: Number, default: 1 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'doctorRemarks' },
);

schema.index({ submission: 1, createdAt: -1 });
schema.index({ categories: 1 });
schema.index({ patient: 1 });

export const DoctorRemark = mongoose.models.DoctorRemark || mongoose.model('DoctorRemark', schema);
