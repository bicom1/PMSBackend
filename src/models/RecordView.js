import mongoose from 'mongoose';

const recordViewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recordType: { type: String, enum: ['PATIENT', 'SUBMISSION'], required: true },
    record: { type: mongoose.Schema.Types.ObjectId, required: true },
    openedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'record_views' },
);

recordViewSchema.index({ user: 1, recordType: 1, record: 1 }, { unique: true });

export const RecordView = mongoose.models.RecordView || mongoose.model('RecordView', recordViewSchema);
