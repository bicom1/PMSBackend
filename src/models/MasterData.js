import mongoose from 'mongoose';
import { MASTER_TYPE_KEYS } from '../constants/index.js';

const schema = new mongoose.Schema(
  {
    type: { type: String, enum: [...MASTER_TYPE_KEYS, 'CLINIC_PROFILE'], required: true },
    label: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    allowOther: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'masterData' },
);

schema.index({ type: 1, value: 1, department: 1 }, { unique: true });
schema.index({ type: 1, isActive: 1, sortOrder: 1 });

export const MasterData = mongoose.models.MasterData || mongoose.model('MasterData', schema);
