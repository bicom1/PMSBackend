import { FormField } from '../models/FormField.js';
import { ApiError } from '../utils/ApiError.js';
import { slugify } from '../utils/strings.js';
import { writeAudit } from './auditService.js';
import { AUDIT } from '../constants/index.js';
import { DEFAULT_FORM_FIELDS } from '../constants/formFields.js';

export async function ensureFormFields() {
  for (const item of DEFAULT_FORM_FIELDS) {
    await FormField.updateOne(
      { departmentCode: item.departmentCode, key: item.key },
      { $setOnInsert: item },
      { upsert: true },
    );
  }
  // Visit fields are staff-filled; keep them optional on existing installs
  await FormField.updateMany(
    { key: { $in: ['doctorId', 'procedureId', 'referredBy', 'formDate'] }, isSystem: true },
    { $set: { required: false } },
  );
}

export async function listFormFields(query = {}) {
  const filter = {};
  if (query.departmentCode) filter.departmentCode = query.departmentCode;
  if (query.active === 'true') filter.isActive = true;
  if (query.active === 'false') filter.isActive = false;
  return FormField.find(filter).sort({ section: 1, sortOrder: 1, label: 1 }).limit(300);
}

export async function createFormField(input, actor, req) {
  const key = (input.key || slugify(input.label) || `field_${Date.now()}`).replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const existing = await FormField.findOne({ departmentCode: input.departmentCode, key });
  if (existing) throw new ApiError(409, 'A field with this key already exists on this form');
  const record = await FormField.create({
    departmentCode: input.departmentCode,
    key,
    label: input.label.trim(),
    section: input.section || 'details',
    fieldType: input.fieldType || 'text',
    optionsSource: input.optionsSource || '',
    required: Boolean(input.required),
    locked: false,
    isSystem: false,
    isActive: input.isActive !== false,
    allowCustom: Boolean(input.allowCustom),
    unit: input.unit || '',
    placeholder: input.placeholder || '',
    sortOrder: input.sortOrder ?? 500,
    metadata: input.metadata || {},
  });
  await writeAudit({
    actor,
    action: AUDIT.MASTER_DATA_CHANGED,
    entityType: 'FormField',
    entityId: record._id,
    newValue: { departmentCode: record.departmentCode, key: record.key, label: record.label },
    req,
  });
  return record;
}

export async function updateFormField(id, input, actor, req) {
  const record = await FormField.findById(id);
  if (!record) throw new ApiError(404, 'Form field not found');
  const previous = {
    label: record.label,
    required: record.required,
    isActive: record.isActive,
    fieldType: record.fieldType,
    placeholder: record.placeholder,
    sortOrder: record.sortOrder,
    metadata: record.metadata,
  };
  if (input.label !== undefined) record.label = String(input.label).trim();
  if (input.placeholder !== undefined) record.placeholder = String(input.placeholder);
  if (input.required !== undefined) record.required = Boolean(input.required);
  if (input.allowCustom !== undefined) record.allowCustom = Boolean(input.allowCustom);
  if (input.unit !== undefined) record.unit = String(input.unit);
  if (input.sortOrder !== undefined) record.sortOrder = Number(input.sortOrder) || 0;
  if (input.section !== undefined) record.section = input.section;
  if (input.fieldType !== undefined) record.fieldType = input.fieldType;
  if (input.optionsSource !== undefined) record.optionsSource = input.optionsSource || '';
  if (input.metadata !== undefined) record.metadata = { ...record.metadata, ...input.metadata };
  if (input.isActive !== undefined) record.isActive = Boolean(input.isActive);
  record.locked = false;
  await record.save();
  await writeAudit({
    actor,
    action: AUDIT.MASTER_DATA_CHANGED,
    entityType: 'FormField',
    entityId: record._id,
    previousValue: previous,
    newValue: {
      label: record.label,
      required: record.required,
      isActive: record.isActive,
      fieldType: record.fieldType,
    },
    req,
  });
  return record;
}

export async function deleteFormField(id, actor, req) {
  const record = await FormField.findById(id);
  if (!record) throw new ApiError(404, 'Form field not found');
  const previous = { departmentCode: record.departmentCode, key: record.key, label: record.label, isSystem: record.isSystem };
  if (record.isSystem) {
    record.isActive = false;
    record.locked = false;
    await record.save();
    await writeAudit({
      actor,
      action: AUDIT.MASTER_DATA_CHANGED,
      entityType: 'FormField',
      entityId: record._id,
      previousValue: previous,
      newValue: { isActive: false, removed: true },
      req,
    });
    return record;
  }
  await record.deleteOne();
  await writeAudit({
    actor,
    action: AUDIT.MASTER_DATA_CHANGED,
    entityType: 'FormField',
    entityId: record._id,
    previousValue: previous,
    newValue: { deleted: true },
    req,
  });
  return { id };
}
