import mongoose from 'mongoose';
import { BOOKING_STATUS, CONSULTATION_STATUS } from '../constants/index.js';

const historySchema = new mongoose.Schema(
  {
    fromStatus: String,
    toStatus: String,
    at: Date,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    remark: { type: String, default: '' },
  },
  { _id: false },
);

const doctorHistorySchema = new mongoose.Schema(
  {
    fromDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fromDoctorName: { type: String, default: '' },
    toDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    toDoctorName: String,
    at: Date,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    reason: { type: String, default: '' },
  },
  { _id: false },
);

const remarkHistorySchema = new mongoose.Schema(
  {
    text: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
    at: Date,
  },
  { _id: false },
);

const submissionSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    patientCode: { type: String, required: true },
    patientName: { type: String, required: true },
    contactNumber: { type: String, required: true },
    normalizedPhone: { type: String, required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    departmentCode: { type: String, enum: ['SKIN', 'SURGERY'], required: true },
    procedure: { type: mongoose.Schema.Types.ObjectId, ref: 'Procedure', default: null },
    procedureName: { type: String, default: '' },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    doctorName: { type: String, default: '' },
    formDate: { type: String, required: true },
    weightKg: { type: Number, default: null },
    heightCm: { type: Number, default: null },
    ageAtSubmission: { type: Number, default: null },
    referredBy: { type: String, default: '' },
    referredByLabel: { type: String, default: '' },
    referredByOther: { type: String, default: '' },
    bookingStatus: { type: String, enum: Object.values(BOOKING_STATUS), default: BOOKING_STATUS.NOT_BOOKED },
    bookedAt: { type: Date, default: null },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    bookingHistory: { type: [historySchema], default: [] },
    doctorHistory: { type: [doctorHistorySchema], default: [] },
    operationalRemark: { type: String, default: '' },
    operationalRemarkHistory: { type: [remarkHistorySchema], default: [] },
    consultationStatus: { type: String, enum: Object.values(CONSULTATION_STATUS), default: CONSULTATION_STATUS.PENDING },
    consultationCompletedAt: { type: Date, default: null },
    consultationCompletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    policyAcknowledgement: {
      policyVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PolicyVersion', required: true },
      versionNumber: { type: Number, required: true },
      textSnapshot: { type: [String], required: true },
      acknowledgedAt: { type: Date, required: true },
      acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'submissions' },
);

submissionSchema.index({ department: 1, bookingStatus: 1, formDate: -1 });
submissionSchema.index({ doctor: 1, bookingStatus: 1, formDate: -1 });
submissionSchema.index({ patient: 1, createdAt: -1 });
submissionSchema.index({ procedure: 1, formDate: -1 });
submissionSchema.index({ formDate: -1, departmentCode: 1, bookingStatus: 1 });
submissionSchema.index({ patientCode: 1 });
submissionSchema.index({ normalizedPhone: 1 });
submissionSchema.index({ patientName: 1 });
submissionSchema.index({ referredBy: 1, formDate: -1 });

export const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);
