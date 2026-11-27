import { Department } from '../models/Department.js';
import { MasterData } from '../models/MasterData.js';
import { Procedure } from '../models/Procedure.js';
import { PolicyNote } from '../models/PolicyNote.js';
import { PolicyVersion } from '../models/PolicyVersion.js';
import { POLICY_DEPARTMENTS, POLICY_ITEMS } from '../constants/index.js';
import { INTAKE_OPTIONS, SKIN_PROCEDURES, SURGERY_PROCEDURES } from '../constants/intakeOptions.js';
import { ensureFormFields } from './formFieldService.js';

export async function ensureClinicFoundation() {
  await ensureFormFields();
  const departments = [
    { code: 'SKIN', name: 'Skin Department', patientIdPrefix: 'SKN', description: 'Skin department intake.' },
    { code: 'SURGERY', name: 'Surgery Department', patientIdPrefix: 'SRG', description: 'Surgery department intake.' },
  ];
  for (const department of departments) {
    await Department.updateOne({ code: department.code }, { $setOnInsert: department }, { upsert: true });
  }

  for (const item of INTAKE_OPTIONS) {
    await MasterData.updateOne(
      { type: item.type, value: item.value, department: null },
      { $setOnInsert: { ...item, department: null, isActive: true } },
      { upsert: true },
    );
  }

  const skin = await Department.findOne({ code: 'SKIN' });
  const surgery = await Department.findOne({ code: 'SURGERY' });
  const procedureSets = [
    [skin, 'SKIN', SKIN_PROCEDURES],
    [surgery, 'SURGERY', SURGERY_PROCEDURES],
  ];
  for (const [department, departmentCode, names] of procedureSets) {
    if (!department) continue;
    for (const name of names) {
      await Procedure.updateOne(
        { department: department._id, name },
        { $setOnInsert: { name, department: department._id, departmentCode, isActive: true, provisional: true } },
        { upsert: true },
      );
    }
  }

  const legacy = await PolicyNote.findOne({ key: 'PATIENT_ACK' });
  let legacyItems = POLICY_ITEMS;
  if (legacy?.currentVersion) {
    const legacyVersion = await PolicyVersion.findById(legacy.currentVersion);
    if (legacyVersion?.items?.length) legacyItems = legacyVersion.items;
  }

  for (const dept of POLICY_DEPARTMENTS) {
    let policy = await PolicyNote.findOne({ key: dept.key });
    if (!policy) {
      policy = await PolicyNote.create({ key: dept.key, title: dept.title, isActive: true });
    }
    let currentVersion = policy.currentVersion
      ? await PolicyVersion.findById(policy.currentVersion)
      : null;
    if (!currentVersion) {
      currentVersion = await PolicyVersion.findOne({ policy: policy._id }).sort({ version: -1 });
    }
    if (!currentVersion) {
      currentVersion = await PolicyVersion.create({
        policy: policy._id,
        version: 1,
        items: legacyItems,
      });
    } else if (!currentVersion.items?.length) {
      currentVersion.items = legacyItems;
      await currentVersion.save();
    }
    if (String(policy.currentVersion || '') !== String(currentVersion._id) || !policy.isActive || policy.title !== dept.title) {
      policy.currentVersion = currentVersion._id;
      policy.isActive = true;
      policy.title = dept.title;
      await policy.save();
    }
  }
}
