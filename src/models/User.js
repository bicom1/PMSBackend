import mongoose from 'mongoose';
import { ROLES } from '../constants/index.js';

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: '' },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true },
    role: { type: String, enum: Object.values(ROLES), required: true },
    isActive: { type: Boolean, default: true },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    phone: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true, trim: true },
    refreshTokens: { type: [refreshTokenSchema], select: false, default: [] },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'users' },
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
