import 'dotenv/config';
import mongoose from 'mongoose';
import { ensureFormFields } from '../src/services/formFieldService.js';
import { FormField } from '../src/models/FormField.js';

await mongoose.connect(process.env.MONGODB_URI);
await ensureFormFields();
const count = await FormField.countDocuments();
const sample = await FormField.find({ departmentCode: 'SKIN' }).sort({ section: 1, sortOrder: 1 }).select('key label section isActive locked').lean();
console.log('COUNT', count);
for (const item of sample) {
  console.log(`${item.section}:${item.key}:active=${item.isActive}:locked=${item.locked}`);
}
await mongoose.disconnect();
