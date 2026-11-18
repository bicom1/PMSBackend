import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, enum: ['VIEW', 'DOWNLOAD', 'DELETE'], required: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true, collection: 'documentAccessLogs' },
);

schema.index({ document: 1, createdAt: -1 });

export const DocumentAccessLog = mongoose.models.DocumentAccessLog || mongoose.model('DocumentAccessLog', schema);
