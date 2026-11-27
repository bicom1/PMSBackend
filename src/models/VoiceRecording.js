import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    storageKey: { type: String, required: true },
    size: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorName: { type: String, required: true },
    patientCode: { type: String, required: true },
    patientName: { type: String, default: '' },
    departmentCode: { type: String, enum: ['SKIN', 'SURGERY'], required: true },
    status: {
      type: String,
      enum: ['recording', 'paused', 'uploading', 'ready', 'failed'],
      default: 'recording',
    },
    mimeType: { type: String, default: 'audio/webm' },
    storageKey: { type: String, default: '' },
    size: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    transcript: { type: String, default: '' },
    transcriptDraft: { type: String, default: '' },
    transcriptionProvider: { type: String, default: '' },
    chunks: { type: [chunkSchema], default: [] },
    clientSessionId: { type: String, default: '' },
    lastAutosavedAt: { type: Date, default: null },
    error: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'voiceRecordings' },
);

schema.index({ submission: 1, doctor: 1, createdAt: -1 });
schema.index({ clientSessionId: 1 });

export const VoiceRecording = mongoose.models.VoiceRecording || mongoose.model('VoiceRecording', schema);
