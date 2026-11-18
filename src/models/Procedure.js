import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    departmentCode: { type: String, enum: ['SKIN', 'SURGERY'], required: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    provisional: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'procedures' },
);

schema.index({ department: 1, name: 1 }, { unique: true });
schema.index({ department: 1, isActive: 1 });

export const Procedure = mongoose.models.Procedure || mongoose.model('Procedure', schema);
