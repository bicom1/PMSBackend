import { Department } from '../models/Department.js';
import { Procedure } from '../models/Procedure.js';
import { MasterData } from '../models/MasterData.js';
import { PolicyNote } from '../models/PolicyNote.js';
import { PolicyVersion } from '../models/PolicyVersion.js';
import { ApiError } from '../utils/ApiError.js';
import { slugify } from '../utils/strings.js';
import { writeAudit } from './auditService.js';
import { AUDIT, MASTER_TYPES } from '../constants/index.js';

const PROFILE_TYPE = 'NATIONALITY';

export async function listDepartments(query = {}) {
  const filter = {};
  if (query.active === 'true') filter.isActive = true;
  return Department.find(filter).sort({ name: 1 });
}

export async function updateDepartment(id, input, actor, req) {
  const department = await Department.findById(id);
  if (!department) throw new ApiError(404, 'Department not found');
  const previous = { name: department.name, description: department.description, isActive: department.isActive };
  if (input.name) department.name = input.name.trim();
  if (input.description !== undefined) department.description = input.description;
  if (input.isActive !== undefined) department.isActive = input.isActive;
  await department.save();
  await writeAudit({
    actor,
    action: AUDIT.DEPARTMENT_UPDATED,
    entityType: 'Department',
    entityId: department._id,
    previousValue: previous,
    newValue: { name: department.name, description: department.description, isActive: department.isActive },
    req,
  });
  return department;
}

export async function listProcedures(query = {}) {
  const filter = {};
  if (query.departmentId) filter.department = query.departmentId;
  if (query.departmentCode) filter.departmentCode = query.departmentCode;
  if (query.active === 'true') filter.isActive = true;
  return Procedure.find(filter).sort({ name: 1 });
}

export async function createProcedure(input, actor, req) {
  const department = await Department.findById(input.departmentId);
  if (!department) throw new ApiError(400, 'Department not found');
  const procedure = await Procedure.create({
    name: input.name.trim(),
    department: department._id,
    departmentCode: department.code,
    description: input.description || '',
    provisional: true,
    isActive: true,
  });
  await writeAudit({
    actor,
    action: AUDIT.PROCEDURE_CHANGED,
    entityType: 'Procedure',
    entityId: procedure._id,
    newValue: { name: procedure.name, departmentCode: procedure.departmentCode },
    req,
  });
  return procedure;
}

export async function updateProcedure(id, input, actor, req) {
  const procedure = await Procedure.findById(id);
  if (!procedure) throw new ApiError(404, 'Procedure not found');
  const previous = { name: procedure.name, isActive: procedure.isActive, description: procedure.description };
  if (input.name) procedure.name = input.name.trim();
  if (input.description !== undefined) procedure.description = input.description;
  if (input.isActive !== undefined) procedure.isActive = input.isActive;
  await procedure.save();
  await writeAudit({
    actor,
    action: AUDIT.PROCEDURE_CHANGED,
    entityType: 'Procedure',
    entityId: procedure._id,
    previousValue: previous,
    newValue: { name: procedure.name, isActive: procedure.isActive },
    req,
  });
  return procedure;
}

export function listMasterTypes() {
  return MASTER_TYPES;
}

export async function listMasterData(query = {}) {
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.active === 'true') filter.isActive = true;
  if (query.departmentCode) {
    const department = await Department.findOne({ code: query.departmentCode });
    if (department) filter.department = department._id;
  }
  return MasterData.find(filter).sort({ sortOrder: 1, label: 1 }).limit(300);
}

export async function createMasterData(input, actor, req) {
  const value = (input.value || slugify(input.label)).toLowerCase();
  const record = await MasterData.create({
    type: input.type,
    label: input.label.trim(),
    value,
    isActive: input.isActive !== false,
    sortOrder: input.sortOrder || 0,
    allowOther: Boolean(input.allowOther),
    metadata: input.metadata || {},
  });
  await writeAudit({
    actor,
    action: AUDIT.MASTER_DATA_CHANGED,
    entityType: 'MasterData',
    entityId: record._id,
    newValue: { type: record.type, label: record.label, value: record.value },
    req,
  });
  return record;
}

export async function updateMasterData(id, input, actor, req) {
  const record = await MasterData.findById(id);
  if (!record) throw new ApiError(404, 'Master data item not found');
  const previous = { label: record.label, isActive: record.isActive, sortOrder: record.sortOrder };
  if (input.label) record.label = input.label.trim();
  if (input.isActive !== undefined) record.isActive = input.isActive;
  if (input.sortOrder !== undefined) record.sortOrder = input.sortOrder;
  if (input.allowOther !== undefined) record.allowOther = input.allowOther;
  if (input.metadata) record.metadata = { ...record.metadata, ...input.metadata };
  await record.save();
  await writeAudit({
    actor,
    action: AUDIT.MASTER_DATA_CHANGED,
    entityType: 'MasterData',
    entityId: record._id,
    previousValue: previous,
    newValue: { label: record.label, isActive: record.isActive },
    req,
  });
  return record;
}

export async function getCurrentPolicy() {
  const policy = await PolicyNote.findOne({ key: 'PATIENT_ACK', isActive: true });
  if (!policy?.currentVersion) throw new ApiError(500, 'Clinic policy is not configured');
  const version = await PolicyVersion.findById(policy.currentVersion);
  if (!version) throw new ApiError(500, 'Clinic policy is not configured');
  return {
    id: policy._id,
    title: policy.title,
    versionId: version._id,
    version: version.version,
    items: version.items,
  };
}

export async function listPolicyVersions() {
  const policy = await PolicyNote.findOne({ key: 'PATIENT_ACK' });
  if (!policy) return [];
  return PolicyVersion.find({ policy: policy._id }).sort({ version: -1 });
}

export async function publishPolicy(input, actor, req) {
  const policy = await PolicyNote.findOne({ key: 'PATIENT_ACK' });
  if (!policy) throw new ApiError(500, 'Clinic policy is not configured');
  const latest = await PolicyVersion.findOne({ policy: policy._id }).sort({ version: -1 });
  const version = await PolicyVersion.create({
    policy: policy._id,
    version: (latest?.version || 0) + 1,
    items: input.items.map((item) => item.trim()),
    createdBy: actor._id,
  });
  if (input.title) policy.title = input.title.trim();
  policy.currentVersion = version._id;
  await policy.save();
  await writeAudit({
    actor,
    action: AUDIT.POLICY_CHANGED,
    entityType: 'PolicyVersion',
    entityId: version._id,
    newValue: { version: version.version, itemCount: version.items.length },
    req,
  });
  return getCurrentPolicy();
}

async function profileRecord() {
  let record = await MasterData.findOne({ type: 'CLINIC_PROFILE', value: 'default' });
  if (!record) {
    record = await MasterData.create({
      type: 'CLINIC_PROFILE',
      value: 'default',
      label: 'Clinic profile',
      isActive: true,
      sortOrder: 0,
      metadata: {
        clinicName: 'Clinic Patient Management System',
        phone: '',
        address: '',
        skinFormConfirmed: false,
        surgeryOptionsConfirmed: false,
      },
    });
  }
  return record;
}

export async function getSettings() {
  const record = await profileRecord();
  return {
    clinicName: record.metadata?.clinicName || 'Clinic Patient Management System',
    phone: record.metadata?.phone || '',
    address: record.metadata?.address || '',
    skinFormConfirmed: Boolean(record.metadata?.skinFormConfirmed),
    surgeryOptionsConfirmed: Boolean(record.metadata?.surgeryOptionsConfirmed),
  };
}

export async function getBranding() {
  const settings = await getSettings();
  return { clinicName: settings.clinicName };
}

export async function updateSettings(input, actor, req) {
  const record = await profileRecord();
  const previous = { ...record.metadata };
  record.metadata = {
    ...record.metadata,
    clinicName: input.clinicName?.trim() || record.metadata.clinicName,
    phone: input.phone ?? record.metadata.phone,
    address: input.address ?? record.metadata.address,
    skinFormConfirmed: input.skinFormConfirmed ?? record.metadata.skinFormConfirmed,
    surgeryOptionsConfirmed: input.surgeryOptionsConfirmed ?? record.metadata.surgeryOptionsConfirmed,
  };
  record.markModified('metadata');
  await record.save();
  await writeAudit({
    actor,
    action: AUDIT.SETTINGS_CHANGED,
    entityType: 'Settings',
    entityId: record._id,
    previousValue: { clinicName: previous.clinicName },
    newValue: { clinicName: record.metadata.clinicName },
    req,
  });
  return getSettings();
}

export { PROFILE_TYPE };
