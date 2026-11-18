import { Department } from '../models/Department.js';
import { Procedure } from '../models/Procedure.js';
import { User } from '../models/User.js';
import { MasterData } from '../models/MasterData.js';
import { Submission } from '../models/Submission.js';
import { SkinSubmissionDetail } from '../models/SkinSubmissionDetail.js';
import { SurgerySubmissionDetail } from '../models/SurgerySubmissionDetail.js';
import { Document } from '../models/Document.js';
import { Patient } from '../models/Patient.js';
import { PatientIdentity } from '../models/PatientIdentity.js';
import { ApiError } from '../utils/ApiError.js';
import { calculateAge, clinicToday, isIsoDate } from '../utils/dates.js';
import { mongoOpts, withSession, withTransaction } from '../utils/transaction.js';
import { parsePaging, pageMeta, parseSort } from '../utils/http.js';
import { presentPatient, presentSubmission } from '../utils/presenters.js';
import { getCurrentPolicy } from './catalogService.js';
import { maybeLinkFromRegistration, preparePatientForSubmission } from './patientService.js';
import { buildSubmissionFilter } from './submissionQuery.js';
import { getSubmissionForActor } from './accessService.js';
import { loadPrescriptions, loadRemarks } from './clinicalService.js';
import { writeAudit } from './auditService.js';
import { notifyDoctorOfPatient } from './notificationService.js';
import { AUDIT, BOOKING_STATUS, CONSULTATION_STATUS, ROLES, SURGERY_SELECTS } from '../constants/index.js';

async function optionLabel(type, value) {
  if (!value) return { value: '', label: '' };
  const record = await MasterData.findOne({ type, value, isActive: true });
  if (!record) throw new ApiError(400, `Select a valid ${type.replaceAll('_', ' ').toLowerCase()}`);
  return { value: record.value, label: record.label };
}

async function assertChoice(type, value, label) {
  const record = await MasterData.findOne({ type, value, isActive: true });
  if (!record) throw new ApiError(400, `${label} is invalid`);
  if (record.allowOther) return record;
  return record;
}

export async function createSubmission(payload, actor, req) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to register patients');
  }
  return withTransaction(async (session) => {
    const department = await withSession(Department.findOne({ code: payload.departmentCode, isActive: true }), session);
    if (!department) throw new ApiError(400, 'Department not found');
    const procedure = await withSession(Procedure.findOne({ _id: payload.visit.procedureId, department: department._id, isActive: true }), session);
    if (!procedure) throw new ApiError(400, 'Procedure is not valid for this department');
    const doctor = await withSession(User.findOne({
      _id: payload.visit.doctorId,
      role: ROLES.DOCTOR,
      isActive: true,
      departments: department._id,
    }), session);
    if (!doctor) throw new ApiError(400, 'Doctor is not assigned to this department');
    if (!isIsoDate(payload.visit.formDate) || payload.visit.formDate > clinicToday()) {
      throw new ApiError(400, 'Form date cannot be in the future');
    }
    const referral = await assertChoice('REFERRAL_SOURCE', payload.visit.referredBy, 'Referral source');
    if (referral.allowOther && !payload.visit.referredByOther?.trim()) {
      throw new ApiError(400, 'Specify the other referral source');
    }
    const occupation = await assertChoice('OCCUPATION', payload.patient.occupation, 'Occupation');
    if (occupation.allowOther && !payload.patient.occupationOther?.trim()) {
      throw new ApiError(400, 'Specify the other occupation');
    }
    await assertChoice('NATIONALITY', payload.patient.nationality, 'Nationality');
    await assertChoice('CITY', payload.patient.city, 'City');
    const policy = await getCurrentPolicy();
    if (String(policy.versionId) !== String(payload.policyVersionId)) {
      throw new ApiError(409, 'The clinic policy has changed. Review and acknowledge the latest version.', {
        code: 'POLICY_CHANGED',
        policy,
      });
    }
    const prepared = await preparePatientForSubmission(payload, department, actor, session, req);
    await maybeLinkFromRegistration(prepared.patient, prepared.analysis, payload, actor, session, req);
    const age = calculateAge(payload.patient.dateOfBirth);
    const submissionDocs = await Submission.create([{
      patient: prepared.patient._id,
      patientCode: prepared.patient.patientCode,
      patientName: prepared.patient.fullName,
      contactNumber: prepared.patient.contactNumber,
      normalizedPhone: prepared.patient.normalizedPhone,
      department: department._id,
      departmentCode: department.code,
      procedure: procedure._id,
      procedureName: procedure.name,
      doctor: doctor._id,
      doctorName: doctor.fullName,
      formDate: payload.visit.formDate,
      weightKg: payload.visit.weightKg,
      heightCm: payload.visit.heightCm,
      ageAtSubmission: age,
      referredBy: referral.value,
      referredByLabel: referral.label,
      referredByOther: payload.visit.referredByOther?.trim() || '',
      bookingStatus: BOOKING_STATUS.NOT_BOOKED,
      consultationStatus: CONSULTATION_STATUS.PENDING,
      doctorHistory: [{
        toDoctor: doctor._id,
        toDoctorName: doctor.fullName,
        at: new Date(),
        by: actor._id,
        byName: actor.fullName,
        reason: 'Initial assignment',
      }],
      policyAcknowledgement: {
        policyVersionId: policy.versionId,
        versionNumber: policy.version,
        textSnapshot: policy.items,
        acknowledgedAt: new Date(),
        acknowledgedBy: actor._id,
      },
      createdBy: actor._id,
    }], mongoOpts(session));
    const submission = submissionDocs[0];
    if (department.code === 'SKIN') {
      await saveSkinDetails(submission._id, payload.skinDetails?.fields || [], session);
    } else {
      await saveSurgeryDetails(submission._id, payload.surgeryDetails || {}, session);
    }
    await writeAudit({
      actor,
      action: AUDIT.FORM_SUBMITTED,
      entityType: 'Submission',
      entityId: submission._id,
      newValue: {
        patientCode: prepared.patient.patientCode,
        departmentCode: department.code,
        procedure: procedure.name,
        doctor: doctor.fullName,
        returningPatient: !prepared.created,
      },
      req,
    }, session);
    await notifyDoctorOfPatient({ doctor, submission, assignedBy: actor.fullName }, session);
    return {
      submission: presentSubmission(submission),
      patient: presentPatient(prepared.patient, { includeCnic: true }),
      returningPatient: !prepared.created,
    };
  });
}

async function saveSkinDetails(submissionId, fields, session) {
  const definitions = await withSession(MasterData.find({ type: 'SKIN_FIELD', isActive: true }), session);
  const byKey = new Map(definitions.map((item) => [item.value, item]));
  for (const field of fields) {
    if (!byKey.has(field.key)) throw new ApiError(400, 'A skin field is no longer available');
  }
  for (const definition of definitions) {
    if (definition.metadata?.required) {
      const found = fields.find((field) => field.key === definition.value && String(field.value || '').trim());
      if (!found) throw new ApiError(400, `${definition.label} is required`);
    }
  }
  await SkinSubmissionDetail.create([{
    submission: submissionId,
    pendingClinicConfirmation: true,
    fields: fields.map((field) => ({
      key: field.key,
      label: byKey.get(field.key).label,
      value: String(field.value || '').slice(0, 2000),
    })),
  }], mongoOpts(session));
}

async function saveSurgeryDetails(submissionId, details, session) {
  const stored = { submission: submissionId, pendingClinicConfirmation: true };
  for (const select of SURGERY_SELECTS) {
    const selected = await optionLabel(select.type, details[select.key] || '');
    stored[select.key] = selected.value;
    stored[`${select.key}Label`] = selected.label;
  }
  stored.surgeryCost = details.surgeryCost ?? null;
  stored.followUpSessions = details.followUpSessions ?? null;
  stored.anyOther = details.anyOther?.trim() || '';
  await SurgerySubmissionDetail.create([stored], mongoOpts(session));
}

function capabilitiesFor(actor, submission) {
  const assignedDoctor = actor.role === ROLES.DOCTOR
    && submission.bookingStatus === BOOKING_STATUS.BOOKED
    && String(submission.doctor) === String(actor._id);
  return {
    canBook: actor.role === ROLES.ADMIN || actor.role === ROLES.CLINIC_MANAGER,
    canReassign: actor.role === ROLES.ADMIN || (actor.role === ROLES.CLINIC_MANAGER && submission.bookingStatus === BOOKING_STATUS.NOT_BOOKED),
    canUpload: actor.role === ROLES.ADMIN || actor.role === ROLES.CLINIC_MANAGER,
    canEditOperational: actor.role === ROLES.ADMIN || actor.role === ROLES.CLINIC_MANAGER,
    canViewClinical: actor.role !== ROLES.CLINIC_MANAGER,
    canEditClinical: assignedDoctor,
  };
}

async function historyFor(patient, anchor, actor) {
  const groups = [];
  const same = await Submission.find({ patient: patient._id, isDeleted: false }).sort({ formDate: -1, createdAt: -1 }).limit(100);
  groups.push({
    departmentCode: patient.departmentCode,
    patientCode: patient.patientCode,
    patientName: patient.fullName,
    linked: false,
    submissions: await decorateHistory(same, actor, anchor),
  });
  if (!patient.identity || actor.role === ROLES.CLINIC_MANAGER) {
    if (patient.identity && actor.role === ROLES.CLINIC_MANAGER) {
      const identity = await PatientIdentity.findById(patient.identity);
      const otherId = patient.departmentCode === 'SKIN' ? identity?.surgeryPatient : identity?.skinPatient;
      if (otherId) {
        const other = await Patient.findById(otherId);
        const submissions = other ? await Submission.find({ patient: other._id, isDeleted: false }).sort({ formDate: -1 }).limit(100) : [];
        groups.push({
          departmentCode: other?.departmentCode,
          patientCode: other?.patientCode,
          patientName: other?.fullName,
          linked: true,
          submissions: submissions.map((item) => presentSubmission(item)),
        });
      }
    }
    return groups;
  }
  const identity = await PatientIdentity.findOne({ _id: patient.identity, isActive: true });
  const otherId = patient.departmentCode === 'SKIN' ? identity?.surgeryPatient : identity?.skinPatient;
  if (otherId && String(otherId) !== String(patient._id)) {
    const other = await Patient.findById(otherId);
    if (other && !other.isDeleted) {
      const submissions = await Submission.find({ patient: other._id, isDeleted: false }).sort({ formDate: -1 }).limit(100);
      groups.push({
        departmentCode: other.departmentCode,
        patientCode: other.patientCode,
        patientName: other.fullName,
        linked: true,
        submissions: await decorateHistory(submissions, actor, anchor),
      });
    }
  }
  return groups;
}

async function decorateHistory(submissions, actor, anchor) {
  if (actor.role === ROLES.CLINIC_MANAGER) return submissions.map((item) => presentSubmission(item));
  const ids = submissions.map((item) => item._id);
  const prescriptions = await loadPrescriptions(ids, actor, anchor);
  const remarks = await loadRemarks(ids, actor, anchor);
  return submissions.map((item) => ({
    ...presentSubmission(item),
    prescriptions: prescriptions.filter((entry) => String(entry.submissionId) === String(item._id)).map((entry) => ({ ...entry, canEdit: false })),
    remarks: remarks.filter((entry) => String(entry.submissionId) === String(item._id)).map((entry) => ({ ...entry, canEdit: false })),
  }));
}

function presentDocument(document) {
  return {
    id: document._id,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    size: document.size,
    uploadedBy: document.uploadedBy,
    uploadedByName: document.uploadedByName,
    createdAt: document.createdAt,
    isDeleted: document.isDeleted,
    deletedAt: document.deletedAt,
    deletedByName: document.deletedByName || '',
    deleteReason: document.deleteReason || '',
  };
}

export async function getSubmissionDetail(id, actor) {
  const submission = await getSubmissionForActor(actor, id);
  const patient = await Patient.findById(submission.patient);
  const includeClinical = actor.role !== ROLES.CLINIC_MANAGER;
  const [skinDetails, surgeryDetails, documents, prescriptions, remarks, history] = await Promise.all([
    submission.departmentCode === 'SKIN' ? SkinSubmissionDetail.findOne({ submission: submission._id }).lean() : null,
    submission.departmentCode === 'SURGERY' ? SurgerySubmissionDetail.findOne({ submission: submission._id }).lean() : null,
    Document.find({
      submission: submission._id,
      ...(actor.role === ROLES.ADMIN ? {} : { isDeleted: false }),
    }).sort({ createdAt: -1 }).lean(),
    includeClinical ? loadPrescriptions([submission._id], actor, submission) : [],
    includeClinical ? loadRemarks([submission._id], actor, submission) : [],
    historyFor(patient, submission, actor),
  ]);
  return {
    submission: presentSubmission(submission),
    patient: presentPatient(patient, { includeCnic: true }),
    skinDetails,
    surgeryDetails,
    documents: documents.map(presentDocument),
    prescriptions,
    remarks,
    history,
    capabilities: capabilitiesFor(actor, submission),
  };
}

export async function listSubmissions(query, actor) {
  if (actor.role === ROLES.DOCTOR) {
    throw new ApiError(403, 'Doctors can only view booked patients assigned to them');
  }
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to view submissions');
  }
  const { page, limit, skip } = parsePaging(query);
  const filter = await buildSubmissionFilter(query, actor);
  const sort = parseSort(query, ['formDate', 'createdAt', 'patientName', 'patientCode', 'bookingStatus'], 'formDate');
  const [items, total] = await Promise.all([
    Submission.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Submission.countDocuments(filter),
  ]);
  return { items: items.map(presentSubmission), meta: pageMeta(total, page, limit) };
}

export async function listMyPatients(query, actor) {
  if (actor.role !== ROLES.DOCTOR) throw new ApiError(403, 'Only doctors can view this list');
  const { page, limit, skip } = parsePaging(query);
  const scoped = { ...query, doctorId: undefined };
  const filter = await buildSubmissionFilter(scoped, actor);
  filter.doctor = actor._id;
  filter.department = { $in: actor.departments || [] };
  const sort = parseSort(query, ['formDate', 'createdAt', 'patientName', 'patientCode'], 'formDate');
  const [items, total] = await Promise.all([
    Submission.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Submission.countDocuments(filter),
  ]);
  return { items: items.map(presentSubmission), meta: pageMeta(total, page, limit) };
}

export async function updateBooking(id, input, actor, req) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to change booking status');
  }
  const submission = await Submission.findOne({ _id: id, isDeleted: false });
  if (!submission) throw new ApiError(404, 'Submission not found');
  const from = submission.bookingStatus;
  if (from !== input.status) {
    submission.bookingStatus = input.status;
    if (input.status === BOOKING_STATUS.BOOKED) {
      submission.bookedAt = new Date();
      submission.bookedBy = actor._id;
    }
    submission.bookingHistory.push({
      fromStatus: from,
      toStatus: input.status,
      at: new Date(),
      by: actor._id,
      byName: actor.fullName,
      remark: input.remark || '',
    });
    await submission.save();
    await writeAudit({
      actor,
      action: AUDIT.BOOKING_STATUS_CHANGED,
      entityType: 'Submission',
      entityId: submission._id,
      previousValue: { bookingStatus: from },
      newValue: { bookingStatus: input.status, patientCode: submission.patientCode, remark: input.remark || '' },
      req,
    });
  }
  return presentSubmission(submission);
}

export async function reassignDoctor(id, input, actor, req) {
  const submission = await Submission.findOne({ _id: id, isDeleted: false });
  if (!submission) throw new ApiError(404, 'Submission not found');
  if (actor.role === ROLES.CLINIC_MANAGER && submission.bookingStatus === BOOKING_STATUS.BOOKED) {
    throw new ApiError(400, 'A doctor can only be reassigned before booking');
  }
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to reassign the doctor');
  }
  const doctor = await User.findOne({ _id: input.doctorId, role: ROLES.DOCTOR, isActive: true, departments: submission.department });
  if (!doctor) throw new ApiError(400, 'Doctor is not assigned to this department');
  if (String(doctor._id) === String(submission.doctor)) return presentSubmission(submission);
  const previous = { doctorId: submission.doctor, doctorName: submission.doctorName };
  submission.doctorHistory.push({
    fromDoctor: submission.doctor,
    fromDoctorName: submission.doctorName,
    toDoctor: doctor._id,
    toDoctorName: doctor.fullName,
    at: new Date(),
    by: actor._id,
    byName: actor.fullName,
    reason: input.reason || '',
  });
  submission.doctor = doctor._id;
  submission.doctorName = doctor.fullName;
  await submission.save();
  await notifyDoctorOfPatient({ doctor, submission, assignedBy: actor.fullName });
  await writeAudit({
    actor,
    action: AUDIT.DOCTOR_REASSIGNED,
    entityType: 'Submission',
    entityId: submission._id,
    previousValue: previous,
    newValue: { doctorName: doctor.fullName, reason: input.reason || '' },
    req,
  });
  return presentSubmission(submission);
}

export async function updateOperationalRemark(id, text, actor, req) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to update operational remarks');
  }
  const submission = await Submission.findOne({ _id: id, isDeleted: false });
  if (!submission) throw new ApiError(404, 'Submission not found');
  const previous = submission.operationalRemark;
  submission.operationalRemarkHistory.push({
    text: text.trim(),
    author: actor._id,
    authorName: actor.fullName,
    at: new Date(),
  });
  submission.operationalRemark = text.trim();
  await submission.save();
  await writeAudit({
    actor,
    action: AUDIT.OPERATIONAL_REMARK_UPDATED,
    entityType: 'Submission',
    entityId: submission._id,
    previousValue: { operationalRemark: previous },
    newValue: { operationalRemark: submission.operationalRemark },
    req,
  });
  return presentSubmission(submission);
}

export async function updateConsultation(id, status, actor, req) {
  const submission = await getSubmissionForActor(actor, id);
  if (actor.role !== ROLES.DOCTOR || String(submission.doctor) !== String(actor._id) || submission.bookingStatus !== BOOKING_STATUS.BOOKED) {
    throw new ApiError(403, 'Only the assigned doctor can update consultation status');
  }
  const previous = submission.consultationStatus;
  submission.consultationStatus = status;
  submission.consultationCompletedAt = status === CONSULTATION_STATUS.COMPLETED ? new Date() : null;
  submission.consultationCompletedBy = status === CONSULTATION_STATUS.COMPLETED ? actor._id : null;
  await submission.save();
  await writeAudit({
    actor,
    action: AUDIT.CONSULTATION_STATUS_CHANGED,
    entityType: 'Submission',
    entityId: submission._id,
    previousValue: { consultationStatus: previous },
    newValue: { consultationStatus: status, patientCode: submission.patientCode },
    req,
  });
  return presentSubmission(submission);
}
