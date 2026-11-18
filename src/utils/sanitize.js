import { maskPhone } from './phone.js';

const REDACTED_KEYS = /password|token|secret|authorization|cnic/i;

export function sanitizeForAudit(value, depth = 0) {
  if (value == null || depth > 6) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value._bsontype) return String(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeForAudit(item, depth + 1));
  if (typeof value === 'object') {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'cnic' || key === 'cnicEncrypted' || key === 'cnicHash') {
        output.cnic = 'redacted';
        continue;
      }
      if (key === 'normalizedPhone' || key === 'contactNumber' || key === 'phone') {
        output[key] = maskPhone(nested);
        continue;
      }
      if (REDACTED_KEYS.test(key)) {
        output[key] = 'redacted';
        continue;
      }
      output[key] = sanitizeForAudit(nested, depth + 1);
    }
    return output;
  }
  return value;
}
