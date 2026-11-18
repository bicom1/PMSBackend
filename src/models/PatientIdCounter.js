import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    departmentCode: { type: String, enum: ['SKIN', 'SURGERY'], required: true, unique: true },
    sequence: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'patientIdCounters' },
);

export const PatientIdCounter = mongoose.models.PatientIdCounter || mongoose.model('PatientIdCounter', counterSchema);
