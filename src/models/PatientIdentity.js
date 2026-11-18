import mongoose from 'mongoose';

const patientIdentitySchema = new mongoose.Schema(
  {
    cnicHash: { type: String, required: true },
    fullName: { type: String, required: true },
    normalizedName: { type: String, required: true },
    normalizedPhone: { type: String, default: '' },
    skinPatient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    surgeryPatient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    method: { type: String, enum: ['CNIC_NAME_MATCH', 'ADMIN_MANUAL'], required: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    verifiedAt: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'patientIdentities' },
);

patientIdentitySchema.index({ cnicHash: 1 });
patientIdentitySchema.index({ skinPatient: 1 });
patientIdentitySchema.index({ surgeryPatient: 1 });

export const PatientIdentity = mongoose.models.PatientIdentity || mongoose.model('PatientIdentity', patientIdentitySchema);
