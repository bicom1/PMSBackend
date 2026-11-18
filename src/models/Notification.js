import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
    patientCode: { type: String, required: true },
    patientName: { type: String, required: true },
    departmentCode: { type: String, enum: ['SKIN', 'SURGERY'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'notifications' },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, submission: 1 });

export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
