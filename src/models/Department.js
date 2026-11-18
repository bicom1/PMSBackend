import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    code: { type: String, enum: ['SKIN', 'SURGERY'], required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    patientIdPrefix: { type: String, enum: ['SKN', 'SRG'], required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'departments' },
);

export const Department = mongoose.models.Department || mongoose.model('Department', departmentSchema);
