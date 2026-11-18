import { Department } from '../models/Department.js';
import { Patient } from '../models/Patient.js';
import { PatientIdentity } from '../models/PatientIdentity.js';
import { PatientIdCounter } from '../models/PatientIdCounter.js';
import { Submission } from '../models/Submission.js';
import { Document } from '../models/Document.js';
import { Prescription } from '../models/Prescription.js';
import { DoctorRemark } from '../models/DoctorRemark.js';
import { ApiError } from '../utils/ApiError.js';
import { encryptString, decryptString, hashCnic } from '../utils/crypto.js';
import { normalizeCnic, formatCnic, maskCnicLast4 } from '../utils/cnic.js';
import { normalizePhone, isValidPhone, maskPhone } from '../utils/phone.js';
import { normalizeName, escapeRegex } from '../utils/strings.js';
import { calculateAge, clinicToday, isIsoDate } from '../utils/dates.js';
import { mongoOpts, withSession, withTransaction } from '../utils/transaction.js';
import { parsePaging, pageMeta } from '../utils/http.js';
import { presentPatient } from '../utils/presenters.js';
import { writeAudit } from './auditService.js';
import { assertCanAccessPatient } from './accessService.js';
import { applyUnread, markRecordOpened, openedIdSet } from './recordViewService.js';
import { AUDIT, BOOKING_STATUS, DEPARTMENT_CODES, GENDERS, ROLES } from '../constants/index.js';

export async function nextPatientCode(departmentCode, session) {
  const prefix = DEPARTMENT_CODES[departmentCode]?.prefix;
  if (!prefix) throw new ApiError(400, 'Unsupported department');
  const counter = await PatientIdCounter.findOneAndUpdate(
    { departmentCode },
    { $inc: { sequence: 1 } },
    mongoOpts(session, { new: true, upsert: true, setDefaultsOnInsert: true }),
  );
  return `${prefix}-${String(counter.sequence).padStart(6, '0')}`;
}

function hint(patient) {
  return {
    id: patient._id,
    patientCode: patient.patientCode,
    fullName: patient.fullName,
    departmentCode: patient.departmentCode,
    cnicMasked: maskCnicLast4(patient.cnicLast4),
    phoneMasked: maskPhone(patient.normalizedPhone),
    gender: patient.gender,
    dateOfBirth: patient.dateOfBirth,
  };
}

function fullRecord(patient) {
  return {
    ...hint(patient),
    contactNumber: patient.contactNumber,
    cnic: formatCnic(decryptString(patient.cnicEncrypted)),
    nationality: patient.nationality,
    occupation: patient.occupation,
    occupationOther: patient.occupationOther || '',
    city: patient.city,
    address: patient.address,
  };
}

async function analyzeIdentity({ departmentId, normalizedPhone, cnicHash, normalizedName, session }) {
  const cnicMatches = await withSession(Patient.find({ department: departmentId, cnicHash, isDeleted: false }), session);
  const phoneConflicts = normalizedPhone
    ? await withSession(Patient.find({
      department: departmentId,
      normalizedPhone,
      cnicHash: { $ne: cnicHash },
      isDeleted: false,
    }), session)
    : [];
  const exactMatch = cnicMatches.find((patient) => patient.normalizedName === normalizedName) || null;
  const cnicNameConflict = cnicMatches.find((patient) => patient.normalizedName !== normalizedName) || null;
  const other = await withSession(Patient.findOne({
    department: { $ne: departmentId },
    cnicHash,
    isDeleted: false,
  }), session);
  return {
    exactMatch,
    cnicNameConflict,
    phoneConflicts,
    crossDepartmentCandidate: other ? { patient: other, canAutoLink: other.normalizedName === normalizedName } : null,
  };
}

function publicAnalysis(analysis, normalizedPhone) {
  const exact = analysis.exactMatch;
  let status = 'NEW';
  if (exact && exact.normalizedPhone !== normalizedPhone) status = 'EXACT_PHONE_CHANGE';
  else if (exact) status = 'EXACT';
  else if (analysis.cnicNameConflict) status = 'CNIC_NAME_CONFLICT';
  else if (analysis.phoneConflicts.length) status = 'PHONE_CONFLICT';

  return {
    status,
    exactMatch: exact ? fullRecord(exact) : null,
    cnicConflict: analysis.cnicNameConflict ? hint(analysis.cnicNameConflict) : null,
    phoneConflicts: analysis.phoneConflicts.map(hint),
    crossDepartmentCandidate: analysis.crossDepartmentCandidate ? {
      ...hint(analysis.crossDepartmentCandidate.patient),
      canAutoLink: analysis.crossDepartmentCandidate.canAutoLink,
    } : null,
  };
}

function assertDemographics(patient) {
  if (!GENDERS.includes(patient.gender)) throw new ApiError(400, 'Gender is invalid');
  if (!isIsoDate(patient.dateOfBirth) || patient.dateOfBirth > clinicToday()) {
    throw new ApiError(400, 'Date of birth is invalid');
  }
  const age = calculateAge(patient.dateOfBirth);
  if (age == null || age < 0 || age > 120) throw new ApiError(400, 'Date of birth is invalid');
}

export async function identifyPatient(input, actor) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to identify patients');
  }
  const department = await Department.findOne({ code: input.departmentCode, isActive: true });
  if (!department) throw new ApiError(400, 'Department not found');
  const normalizedPhone = normalizePhone(input.contactNumber);
  const cnicDigits = normalizeCnic(input.cnic);
  if (!isValidPhone(normalizedPhone)) throw new ApiError(400, 'Contact number is invalid');
  if (!cnicDigits) throw new ApiError(400, 'CNIC must contain 13 digits');
  const analysis = await analyzeIdentity({
    departmentId: department._id,
    normalizedPhone,
    cnicHash: hashCnic(cnicDigits),
    normalizedName: normalizeName(input.fullName),
  });
  return publicAnalysis(analysis, normalizedPhone);
}

async function applyVisitProfile(patient, payload, normalizedPhone, actor, session, req) {
  const nextName = payload.patient.fullName.trim();
  const nameChanged = normalizeName(nextName) !== patient.normalizedName;
  const dobChanged = payload.patient.dateOfBirth !== patient.dateOfBirth;
  const genderChanged = payload.patient.gender !== patient.gender;
  const phoneChanged = normalizedPhone !== patient.normalizedPhone;
  if ((nameChanged || dobChanged || genderChanged) && (payload.correction?.reason || '').trim().length < 5) {
    throw new ApiError(409, 'Identity details differ from the saved record. Provide a correction reason or keep the saved details.', {
      code: 'CORRECTION_REQUIRED',
      exactMatch: fullRecord(patient),
    });
  }
  if (phoneChanged && !payload.acceptPhoneUpdate) {
    throw new ApiError(409, 'The contact number differs from the existing record. Confirm the phone update.', {
      code: 'PHONE_UPDATE_REQUIRED',
      exactMatch: fullRecord(patient),
    });
  }
  const previous = {
    fullName: patient.fullName,
    dateOfBirth: patient.dateOfBirth,
    gender: patient.gender,
    nationality: patient.nationality,
    occupation: patient.occupation,
    city: patient.city,
  };
  patient.fullName = nextName;
  patient.normalizedName = normalizeName(nextName);
  patient.dateOfBirth = payload.patient.dateOfBirth;
  patient.gender = payload.patient.gender;
  patient.contactNumber = payload.patient.contactNumber.trim();
  patient.normalizedPhone = normalizedPhone;
  patient.nationality = payload.patient.nationality;
  patient.occupation = payload.patient.occupation;
  patient.occupationOther = payload.patient.occupationOther || '';
  patient.city = payload.patient.city;
  patient.address = payload.patient.address.trim();
  await patient.save(mongoOpts(session));
  await Submission.updateMany(
    { patient: patient._id },
    { $set: { patientName: patient.fullName, normalizedPhone: patient.normalizedPhone, contactNumber: patient.contactNumber } },
    mongoOpts(session),
  );
  if (nameChanged || dobChanged || genderChanged || phoneChanged) {
    await writeAudit({
      actor,
      action: AUDIT.PATIENT_UPDATED,
      entityType: 'Patient',
      entityId: patient._id,
      previousValue: previous,
      newValue: { fullName: patient.fullName, reason: payload.correction?.reason || 'Phone confirmed during registration' },
      req,
    }, session);
  }
  return patient;
}

export async function preparePatientForSubmission(payload, department, actor, session, req) {
  const normalizedPhone = normalizePhone(payload.patient.contactNumber);
  const cnicDigits = normalizeCnic(payload.patient.cnic);
  if (!isValidPhone(normalizedPhone)) throw new ApiError(400, 'Contact number is invalid');
  if (!cnicDigits) throw new ApiError(400, 'CNIC must contain 13 digits');
  assertDemographics(payload.patient);
  const normalized = normalizeName(payload.patient.fullName);
  if (!normalized) throw new ApiError(400, 'Patient name is required');
  const cnicHash = hashCnic(cnicDigits);
  const analysis = await analyzeIdentity({
    departmentId: department._id,
    normalizedPhone,
    cnicHash,
    normalizedName: normalized,
    session,
  });

  if (payload.mode === 'attach') {
    const target = analysis.exactMatch || analysis.cnicNameConflict;
    if (!target || String(target._id) !== String(payload.existingPatientId)) {
      throw new ApiError(409, 'No verified patient matched this CNIC. A shared phone number cannot attach a procedure to another person.', {
        code: 'IDENTITY_MISMATCH',
        ...publicAnalysis(analysis, normalizedPhone),
      });
    }
    const patient = await applyVisitProfile(target, payload, normalizedPhone, actor, session, req);
    return { patient, created: false, analysis };
  }

  if (analysis.exactMatch || analysis.cnicNameConflict) {
    const match = analysis.exactMatch || analysis.cnicNameConflict;
    throw new ApiError(409, `Patient already exists: ${match.patientCode}. This new procedure will be attached to the existing patient record.`, {
      code: analysis.exactMatch ? 'EXACT_MATCH' : 'CNIC_NAME_CONFLICT',
      ...publicAnalysis(analysis, normalizedPhone),
    });
  }
  if (analysis.phoneConflicts.length && !payload.acknowledgePhoneConflict) {
    throw new ApiError(409, 'This phone number matches existing patients. A phone number can be shared by family members, so identity must be verified before a new patient is registered.', {
      code: 'PHONE_CONFLICT',
      ...publicAnalysis(analysis, normalizedPhone),
    });
  }

  const patientCode = await nextPatientCode(department.code, session);
  let patient;
  try {
    const created = await Patient.create([{
      patientCode,
      department: department._id,
      departmentCode: department.code,
      fullName: payload.patient.fullName.trim(),
      normalizedName: normalized,
      contactNumber: payload.patient.contactNumber.trim(),
      normalizedPhone,
      cnicEncrypted: encryptString(cnicDigits),
      cnicHash,
      cnicLast4: cnicDigits.slice(-4),
      dateOfBirth: payload.patient.dateOfBirth,
      gender: payload.patient.gender,
      nationality: payload.patient.nationality,
      occupation: payload.patient.occupation,
      occupationOther: payload.patient.occupationOther || '',
      city: payload.patient.city,
      address: payload.patient.address.trim(),
      createdBy: actor._id,
    }], mongoOpts(session));
    patient = created[0];
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, 'A patient with this CNIC already exists in the department.');
    }
    throw error;
  }
  await writeAudit({
    actor,
    action: AUDIT.PATIENT_CREATED,
    entityType: 'Patient',
    entityId: patient._id,
    newValue: { patientCode, departmentCode: department.code, fullName: patient.fullName },
    req,
  }, session);
  return { patient, created: true, analysis };
}

async function writeLink(skin, surgery, actor, session, req, method, reason) {
  if (skin.departmentCode !== 'SKIN' || surgery.departmentCode !== 'SURGERY') {
    throw new ApiError(400, 'Link a Skin record with a Surgery record');
  }
  if (skin.identity && surgery.identity && String(skin.identity) !== String(surgery.identity)) {
    throw new ApiError(409, 'These records are already linked to different identities');
  }
  let identity = null;
  if (skin.identity || surgery.identity) {
    identity = await withSession(PatientIdentity.findById(skin.identity || surgery.identity), session);
  }
  if (identity) {
    if (identity.skinPatient && String(identity.skinPatient) !== String(skin._id)) {
      throw new ApiError(409, 'The Skin record is already linked to another person');
    }
    if (identity.surgeryPatient && String(identity.surgeryPatient) !== String(surgery._id)) {
      throw new ApiError(409, 'The Surgery record is already linked to another person');
    }
    identity.skinPatient = skin._id;
    identity.surgeryPatient = surgery._id;
    identity.fullName = skin.fullName;
    identity.normalizedName = skin.normalizedName;
    identity.cnicHash = skin.cnicHash;
    await identity.save(mongoOpts(session));
  } else {
    const created = await PatientIdentity.create([{
      cnicHash: skin.cnicHash,
      fullName: skin.fullName,
      normalizedName: skin.normalizedName,
      normalizedPhone: maskPhone(skin.normalizedPhone),
      skinPatient: skin._id,
      surgeryPatient: surgery._id,
      method,
      verifiedBy: actor._id,
      verifiedAt: new Date(),
      reason: reason || '',
    }], mongoOpts(session));
    identity = created[0];
  }
  skin.identity = identity._id;
  surgery.identity = identity._id;
  await skin.save(mongoOpts(session));
  await surgery.save(mongoOpts(session));
  await writeAudit({
    actor,
    action: AUDIT.PATIENT_IDENTITY_LINKED,
    entityType: 'PatientIdentity',
    entityId: identity._id,
    newValue: {
      skinPatientCode: skin.patientCode,
      surgeryPatientCode: surgery.patientCode,
      method,
      reason: reason || '',
    },
    req,
  }, session);
  return identity;
}

export async function maybeLinkFromRegistration(patient, analysis, payload, actor, session, req) {
  if (!payload.confirmIdentityLink || !analysis.crossDepartmentCandidate?.canAutoLink) return null;
  const other = analysis.crossDepartmentCandidate.patient;
  const skin = patient.departmentCode === 'SKIN' ? patient : other;
  const surgery = patient.departmentCode === 'SURGERY' ? patient : other;
  return writeLink(skin, surgery, actor, session, req, 'CNIC_NAME_MATCH', 'Verified CNIC and name match during registration');
}

export async function linkPatients(input, actor, req) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to link patient identities');
  }
  return withTransaction(async (session) => {
    const skin = await withSession(Patient.findOne({ _id: input.skinPatientId, isDeleted: false }), session);
    const surgery = await withSession(Patient.findOne({ _id: input.surgeryPatientId, isDeleted: false }), session);
    if (!skin || !surgery) throw new ApiError(404, 'Patient not found');
    const cnicMatches = skin.cnicHash === surgery.cnicHash;
    const nameMatches = skin.normalizedName === surgery.normalizedName;
    if ((!cnicMatches || !nameMatches) && actor.role !== ROLES.ADMIN) {
      throw new ApiError(403, 'Only an administrator can link records when the CNIC or name differs');
    }
    if (!cnicMatches && !input.confirmCnicMismatch) {
      throw new ApiError(409, 'CNIC does not match. Confirm the manual link.');
    }
    if ((input.reason || '').trim().length < 5 && (!cnicMatches || !nameMatches)) {
      throw new ApiError(400, 'A reason is required when linking records that do not match exactly');
    }
    const identity = await writeLink(
      skin,
      surgery,
      actor,
      session,
      req,
      cnicMatches && nameMatches ? 'CNIC_NAME_MATCH' : 'ADMIN_MANUAL',
      input.reason || '',
    );
    return { identityId: identity._id, skinPatientCode: skin.patientCode, surgeryPatientCode: surgery.patientCode };
  });
}

export async function mergePatients(input, actor, req) {
  if (actor.role !== ROLES.ADMIN) throw new ApiError(403, 'Only an administrator can merge patients');
  if ((input.reason || '').trim().length < 5) throw new ApiError(400, 'A merge reason is required');
  return withTransaction(async (session) => {
    const primary = await withSession(Patient.findOne({ _id: input.primaryId, isDeleted: false }), session);
    const duplicate = await withSession(Patient.findOne({ _id: input.duplicateId, isDeleted: false }), session);
    if (!primary || !duplicate) throw new ApiError(404, 'Patient not found');
    if (String(primary._id) === String(duplicate._id)) throw new ApiError(400, 'Choose two different records');
    if (String(primary.department) !== String(duplicate.department)) {
      throw new ApiError(400, 'Only patients in the same department can be merged. Cross-department records are linked, not merged.');
    }
    if (primary.cnicHash !== duplicate.cnicHash && !input.confirmDifferentCnic) {
      throw new ApiError(409, 'CNIC does not match. Confirm this verified merge explicitly.');
    }
    await Submission.updateMany(
      { patient: duplicate._id },
      { $set: { patient: primary._id, patientCode: primary.patientCode, patientName: primary.fullName, normalizedPhone: primary.normalizedPhone, contactNumber: primary.contactNumber } },
      mongoOpts(session),
    );
    await Document.updateMany({ patient: duplicate._id }, { $set: { patient: primary._id } }, mongoOpts(session));
    await Prescription.updateMany({ patient: duplicate._id }, { $set: { patient: primary._id } }, mongoOpts(session));
    await DoctorRemark.updateMany({ patient: duplicate._id }, { $set: { patient: primary._id } }, mongoOpts(session));
    if (duplicate.identity) {
      const identity = await withSession(PatientIdentity.findById(duplicate.identity), session);
      if (identity) {
        const field = duplicate.departmentCode === 'SKIN' ? 'skinPatient' : 'surgeryPatient';
        if (!primary.identity) {
          if (!identity[field] || String(identity[field]) === String(duplicate._id)) identity[field] = primary._id;
          primary.identity = identity._id;
          await identity.save(mongoOpts(session));
        } else if (String(primary.identity) !== String(identity._id)) {
          identity.isActive = false;
          await identity.save(mongoOpts(session));
        }
      }
    }
    duplicate.isDeleted = true;
    duplicate.mergedInto = primary._id;
    duplicate.mergedAt = new Date();
    await duplicate.save(mongoOpts(session));
    await primary.save(mongoOpts(session));
    await writeAudit({
      actor,
      action: AUDIT.PATIENT_MERGED,
      entityType: 'Patient',
      entityId: primary._id,
      previousValue: { duplicatePatientCode: duplicate.patientCode },
      newValue: { survivingPatientCode: primary.patientCode, reason: input.reason.trim() },
      req,
    }, session);
    return presentPatient(primary, { includeCnic: true });
  });
}

export async function listPatients(query, actor) {
  const { page, limit, skip } = parsePaging(query);
  const filter = { isDeleted: false };
  if (query.departmentCode) filter.departmentCode = query.departmentCode;
  if (query.search) {
    const term = query.search.trim();
    const phone = normalizePhone(term);
    filter.$or = [
      { fullName: new RegExp(escapeRegex(term), 'i') },
      { patientCode: new RegExp(escapeRegex(term), 'i') },
    ];
    if (phone.length >= 4) filter.$or.push({ normalizedPhone: phone });
  }
  if (actor.role === ROLES.DOCTOR) {
    const ownIds = await Submission.find({
      doctor: actor._id,
      bookingStatus: BOOKING_STATUS.BOOKED,
      isDeleted: false,
    }).distinct('patient');
    const patients = await Patient.find({ _id: { $in: ownIds } }).select('identity');
    const identityIds = patients.map((patient) => patient.identity).filter(Boolean);
    const identities = await PatientIdentity.find({ _id: { $in: identityIds }, isActive: true });
    const linked = identities.flatMap((identity) => [identity.skinPatient, identity.surgeryPatient]).filter(Boolean);
    filter._id = { $in: [...ownIds, ...linked] };
  } else if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to view patients');
  }
  const [items, total] = await Promise.all([
    Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Patient.countDocuments(filter),
  ]);
  const presented = items.map((patient) => presentPatient(patient, { includeCnic: false }));
  const opened = await openedIdSet(actor._id, 'PATIENT', presented.map((patient) => patient.id));
  return {
    items: applyUnread(presented, opened),
    meta: pageMeta(total, page, limit),
  };
}

export async function getPatient(id, actor) {
  const patient = await Patient.findById(id);
  await assertCanAccessPatient(actor, patient);
  let linked = null;
  if (patient.identity) {
    const identity = await PatientIdentity.findById(patient.identity);
    if (identity?.isActive) {
      const otherId = patient.departmentCode === 'SKIN' ? identity.surgeryPatient : identity.skinPatient;
      if (otherId && String(otherId) !== String(patient._id)) {
        const other = await Patient.findById(otherId);
        linked = other ? { patientCode: other.patientCode, departmentCode: other.departmentCode, fullName: other.fullName, id: other._id } : null;
      }
    }
  }
  await markRecordOpened(actor._id, 'PATIENT', patient._id);
  return { patient: presentPatient(patient, { includeCnic: true }), linked };
}

export async function correctPatient(id, input, actor, req) {
  if (actor.role !== ROLES.ADMIN) throw new ApiError(403, 'Only an administrator can correct patient data');
  if ((input.reason || '').trim().length < 5) throw new ApiError(400, 'A correction reason is required');
  const patient = await Patient.findOne({ _id: id, isDeleted: false });
  if (!patient) throw new ApiError(404, 'Patient not found');
  assertDemographics(input);
  const cnicDigits = normalizeCnic(input.cnic);
  const normalizedPhone = normalizePhone(input.contactNumber);
  if (!cnicDigits) throw new ApiError(400, 'CNIC must contain 13 digits');
  if (!isValidPhone(normalizedPhone)) throw new ApiError(400, 'Contact number is invalid');
  const nextHash = hashCnic(cnicDigits);
  if (nextHash !== patient.cnicHash) {
    const clash = await Patient.findOne({ department: patient.department, cnicHash: nextHash, isDeleted: false, _id: { $ne: patient._id } });
    if (clash) throw new ApiError(409, `This CNIC is already used by ${clash.patientCode}`);
  }
  const previous = { fullName: patient.fullName, patientCode: patient.patientCode };
  patient.fullName = input.fullName.trim();
  patient.normalizedName = normalizeName(input.fullName);
  patient.contactNumber = input.contactNumber.trim();
  patient.normalizedPhone = normalizedPhone;
  patient.cnicEncrypted = encryptString(cnicDigits);
  patient.cnicHash = nextHash;
  patient.cnicLast4 = cnicDigits.slice(-4);
  patient.dateOfBirth = input.dateOfBirth;
  patient.gender = input.gender;
  patient.nationality = input.nationality;
  patient.occupation = input.occupation;
  patient.occupationOther = input.occupationOther || '';
  patient.city = input.city;
  patient.address = input.address.trim();
  await patient.save();
  await Submission.updateMany(
    { patient: patient._id },
    { $set: { patientName: patient.fullName, normalizedPhone: patient.normalizedPhone, contactNumber: patient.contactNumber } },
  );
  await writeAudit({
    actor,
    action: AUDIT.PATIENT_UPDATED,
    entityType: 'Patient',
    entityId: patient._id,
    previousValue: previous,
    newValue: { fullName: patient.fullName, reason: input.reason.trim(), cnicUpdated: true },
    req,
  });
  return presentPatient(patient, { includeCnic: true });
}
