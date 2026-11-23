import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    originalFilename: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    checksum: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedByName: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedByName: { type: String, default: '' },
    deletedAt: { type: Date, default: null },
    deleteReason: { type: String, default: '' },
    category: { type: String, enum: ['LAB', 'SCAN', 'CONSENT', 'IDENTITY', 'OTHER'], default: 'OTHER' },
    note: { type: String, default: '' },
  },
  { timestamps: true, collection: 'documents' },
);

schema.index({ submission: 1, isDeleted: 1 });

export const Document = mongoose.models.Document || mongoose.model('Document', schema);
