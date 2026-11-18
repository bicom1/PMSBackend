import mongoose from 'mongoose';
import { GENDERS } from '../constants/index.js';

const patientSchema = new mongoose.Schema(
  {
    patientCode: { type: String, required: true, unique: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    departmentCode: { type: String, enum: ['SKIN', 'SURGERY'], required: true },
    identity: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientIdentity', default: null },
    fullName: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true },
    contactNumber: { type: String, required: true },
    normalizedPhone: { type: String, required: true },
    cnicEncrypted: { type: String, required: true },
    cnicHash: { type: String, required: true },
    cnicLast4: { type: String, required: true },
    dateOfBirth: { type: String, required: true },
    gender: { type: String, enum: GENDERS, required: true },
    nationality: { type: String, required: true },
    occupation: { type: String, required: true },
    occupationOther: { type: String, default: '' },
    city: { type: String, required: true },
    address: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    mergedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'patients' },
);

patientSchema.index(
  { department: 1, cnicHash: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
patientSchema.index({ department: 1, normalizedPhone: 1, isDeleted: 1 });
patientSchema.index({ identity: 1 });
patientSchema.index({ fullName: 1 });

export const Patient = mongoose.models.Patient || mongoose.model('Patient', patientSchema);
