import { Department } from '../models/Department.js';
import { MasterData } from '../models/MasterData.js';
import { Procedure } from '../models/Procedure.js';
import { PolicyNote } from '../models/PolicyNote.js';
import { PolicyVersion } from '../models/PolicyVersion.js';
import { POLICY_ITEMS } from '../constants/index.js';
import { INTAKE_OPTIONS, SKIN_PROCEDURES, SURGERY_PROCEDURES } from '../constants/intakeOptions.js';

export async function ensureClinicFoundation() {
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

  let policy = await PolicyNote.findOne({ key: 'PATIENT_ACK' });
  if (!policy) {
    policy = await PolicyNote.create({ key: 'PATIENT_ACK', title: 'Patient acknowledgement', isActive: true });
  }
  if (!policy.currentVersion) {
    const version = await PolicyVersion.create({ policy: policy._id, version: 1, items: POLICY_ITEMS });
    policy.currentVersion = version._id;
    await policy.save();
  }
}
