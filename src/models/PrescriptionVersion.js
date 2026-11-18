import mongoose from 'mongoose';

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    dose: { type: String, required: true },
    frequency: { type: String, required: true },
    duration: { type: String, required: true },
    instructions: { type: String, default: '' },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    prescription: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', required: true },
    versionNumber: { type: Number, required: true },
    medicines: { type: [medicineSchema], required: true },
    prescriptionDate: { type: String, required: true },
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedByName: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { timestamps: true, collection: 'prescriptionVersions' },
);

schema.index({ prescription: 1, versionNumber: 1 }, { unique: true });

export const PrescriptionVersion = mongoose.models.PrescriptionVersion || mongoose.model('PrescriptionVersion', schema);
