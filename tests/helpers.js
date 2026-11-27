import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import request from 'supertest';
import { Department } from '../src/models/Department.js';
import { User } from '../src/models/User.js';
import { Procedure } from '../src/models/Procedure.js';
import { MasterData } from '../src/models/MasterData.js';
import { PolicyNote } from '../src/models/PolicyNote.js';
import { PolicyVersion } from '../src/models/PolicyVersion.js';
import { POLICY_ITEMS, ROLES } from '../src/constants/index.js';
import { clinicToday } from '../src/utils/dates.js';
import { connectDb } from '../src/config/db.js';

export const PASSWORD = 'Test@12345';

function assertTestDatabase() {
  const uri = String(mongoose.connection.client?.s?.url || process.env.MONGODB_URI || '');
  const isMemory = /127\.0\.0\.1|localhost|mongodb-memory-server/i.test(uri)
    || process.env.NODE_ENV === 'test';
  const isAtlasOrShared = /mongodb\.net|mongodb\+srv/i.test(uri);
  if (!isMemory || isAtlasOrShared) {
    throw new Error('Refusing to use the shared/production MongoDB for tests. Run via `npm test` (memory server) only.');
  }
}

export async function connectTestDb() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('connectTestDb is only allowed when NODE_ENV=test');
  }
  await connectDb();
  assertTestDatabase();
}

export async function resetDatabase() {
  assertTestDatabase();
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
}

export async function createFixture() {
  const skin = await Department.create({ code: 'SKIN', name: 'Skin Department', patientIdPrefix: 'SKN' });
  const surgery = await Department.create({ code: 'SURGERY', name: 'Surgery Department', patientIdPrefix: 'SRG' });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const account = (username, extra) => ({ username, email: `${username}@clinic.test`, passwordHash, ...extra });
  const admin = await User.create(account('admin', { fullName: 'Admin User', role: ROLES.ADMIN }));
  const manager = await User.create(account('reception', { fullName: 'Reception User', role: ROLES.CLINIC_MANAGER }));
  const managerTwo = await User.create(account('reception2', { fullName: 'Second Reception', role: ROLES.CLINIC_MANAGER }));
  const skinDoctor = await User.create(account('dr.skin', { fullName: 'Skin Doctor', role: ROLES.DOCTOR, departments: [skin._id] }));
  const surgeryDoctor = await User.create(account('dr.surgery', { fullName: 'Surgery Doctor', role: ROLES.DOCTOR, departments: [surgery._id] }));
  const bothDoctor = await User.create(account('dr.both', { fullName: 'Both Doctor', role: ROLES.DOCTOR, departments: [skin._id, surgery._id] }));
  await User.create(account('inactive', { fullName: 'Inactive User', role: ROLES.CLINIC_MANAGER, isActive: false }));
  const procedures = {
    skin: await Procedure.create({ name: 'Consultation', department: skin._id, departmentCode: 'SKIN', provisional: true }),
    surgery: await Procedure.create({ name: 'Consultation', department: surgery._id, departmentCode: 'SURGERY', provisional: true }),
  };
  await MasterData.insertMany([
    { type: 'NATIONALITY', label: 'Pakistan', value: 'pakistan', isActive: true },
    { type: 'CITY', label: 'Karachi', value: 'karachi', isActive: true },
    { type: 'OCCUPATION', label: 'Employee', value: 'employee', isActive: true },
    { type: 'OCCUPATION', label: 'Other', value: 'other', isActive: true, allowOther: true },
    { type: 'REFERRAL_SOURCE', label: 'Walk-in', value: 'walk_in', isActive: true },
    { type: 'REFERRAL_SOURCE', label: 'Other', value: 'other', isActive: true, allowOther: true },
    { type: 'REMARK_CATEGORY', label: 'Facial', value: 'facial', isActive: true },
    { type: 'REMARK_CATEGORY', label: 'Threads', value: 'threads', isActive: true },
    { type: 'ANESTHESIA_TYPE', label: 'General', value: 'general', isActive: true },
    { type: 'DIET', label: 'NPO', value: 'npo', isActive: true },
    { type: 'BLOOD_TEST_STATUS', label: 'Pending', value: 'pending', isActive: true },
    { type: 'SURGERY_LOCATION', label: 'OT-1', value: 'ot_1', isActive: true },
    { type: 'MRI_STATUS', label: 'Not Required', value: 'not_required', isActive: true },
  ]);
  const skinPolicy = await PolicyNote.create({ key: 'PATIENT_ACK_SKIN', title: 'Skin policy acknowledgement', isActive: true });
  const surgeryPolicy = await PolicyNote.create({ key: 'PATIENT_ACK_SURGERY', title: 'Surgery policy acknowledgement', isActive: true });
  const skinPolicyVersion = await PolicyVersion.create({ policy: skinPolicy._id, version: 1, items: POLICY_ITEMS, createdBy: admin._id });
  const surgeryPolicyVersion = await PolicyVersion.create({ policy: surgeryPolicy._id, version: 1, items: POLICY_ITEMS, createdBy: admin._id });
  skinPolicy.currentVersion = skinPolicyVersion._id;
  surgeryPolicy.currentVersion = surgeryPolicyVersion._id;
  await skinPolicy.save();
  await surgeryPolicy.save();
  return {
    departments: { skin, surgery },
    users: { admin, manager, managerTwo, skinDoctor, surgeryDoctor, bothDoctor },
    procedures,
    policyVersion: skinPolicyVersion,
    policyVersions: { skin: skinPolicyVersion, surgery: surgeryPolicyVersion },
  };
}

export async function login(app, username, password = PASSWORD) {
  const email = String(username).includes('@') ? username : `${username}@clinic.test`;
  return request(app).post('/api/auth/login').send({ email, password });
}

export async function tokenFor(app, username) {
  const res = await login(app, username);
  if (res.status !== 200) throw new Error(`Login failed for ${username}: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

export function cnic(serial) {
  const digits = String(4210100000000 + serial).padStart(13, '0');
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function phone(serial) {
  return `0300${String(1000000 + serial).slice(-7)}`;
}

export function intakePayload(fx, overrides = {}) {
  const departmentCode = overrides.departmentCode || 'SKIN';
  const doctor = departmentCode === 'SURGERY' ? fx.users.surgeryDoctor : fx.users.skinDoctor;
  const procedure = departmentCode === 'SURGERY' ? fx.procedures.surgery : fx.procedures.skin;
  const policyVersion = departmentCode === 'SURGERY'
    ? (fx.policyVersions?.surgery || fx.policyVersion)
    : (fx.policyVersions?.skin || fx.policyVersion);
  return {
    departmentCode,
    mode: 'new',
    acknowledgePhoneConflict: false,
    confirmIdentityLink: false,
    acceptPhoneUpdate: false,
    policyAcknowledged: true,
    policyVersionId: String(policyVersion._id),
    patient: {
      fullName: 'Ayesha Khan',
      contactNumber: '03001234567',
      cnic: '42101-1234567-1',
      dateOfBirth: '1994-05-12',
      gender: 'Female',
      nationality: 'pakistan',
      occupation: 'employee',
      city: 'karachi',
      address: 'House 12, Block 5, Clifton',
      ...(overrides.patient || {}),
    },
    visit: {
      weightKg: 62,
      heightCm: 65,
      referredBy: 'walk_in',
      doctorId: String(doctor._id),
      procedureId: String(procedure._id),
      formDate: clinicToday(),
      ...(overrides.visit || {}),
    },
    skinDetails: departmentCode === 'SKIN' ? { fields: [] } : undefined,
    surgeryDetails: departmentCode === 'SURGERY' ? { anesthesiaType: 'general', diet: 'npo', bloodTestStatus: 'pending', locationOfSurgery: 'ot_1', mri: 'not_required', surgeryCost: 80000, followUpSessions: 1 } : undefined,
    ...strip(overrides),
  };
}

function strip(overrides) {
  const copy = { ...overrides };
  delete copy.patient;
  delete copy.visit;
  delete copy.departmentCode;
  return copy;
}

export async function postIntake(app, token, payload) {
  return request(app).post('/api/submissions').set('Authorization', `Bearer ${token}`).send(payload);
}
