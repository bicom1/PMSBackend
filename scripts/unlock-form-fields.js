import 'dotenv/config';
import mongoose from 'mongoose';
import { FormField } from '../src/models/FormField.js';

await mongoose.connect(process.env.MONGODB_URI);
const result = await FormField.updateMany({}, { $set: { locked: false } });
console.log('unlocked', result.modifiedCount);
await mongoose.disconnect();
