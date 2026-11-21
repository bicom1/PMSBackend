import path from 'path';
import { fileURLToPath } from 'url';
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
import { assertCanAccessPatient, getSubmissionForActor } from './accessService.js';
import { loadPrescriptions, loadRemarks } from './clinicalService.js';
import { writeAudit } from './auditService.js';
import { markSubmissionNotificationsRead, notifyDoctorOfPatient } from './notificationService.js';
import { applyUnread, markRecordOpened, openedIdSet } from './recordViewService.js';
import PDFDocument from 'pdfkit';
import { AUDIT, BOOKING_STATUS, CONSULTATION_STATUS, ROLES, SURGERY_SELECTS } from '../constants/index.js';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function optionLabel(type, value) {
  const text = String(value || '').trim();
  if (!text) return { value: '', label: '' };
  const record = await MasterData.findOne({ type, value: text, isActive: true });
  if (record) return { value: record.value, label: record.label, allowOther: record.allowOther };
  const byLabel = await MasterData.findOne({
    type,
    isActive: true,
    label: new RegExp(`^${escapeRegex(text)}$`, 'i'),
  });
  if (byLabel) return { value: byLabel.value, label: byLabel.label, allowOther: byLabel.allowOther };
  return { value: text.slice(0, 80), label: text.slice(0, 80), allowOther: false };
}

async function assertChoice(type, value, label) {
  const resolved = await optionLabel(type, value);
  if (!resolved.value) throw new ApiError(400, `${label} is required`);
  return resolved;
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
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER, ROLES.DOCTOR].includes(actor.role)) return groups;
  if (!patient.identity && [ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    const other = await Patient.findOne({
      isDeleted: false,
      cnicHash: patient.cnicHash,
      normalizedName: patient.normalizedName,
      normalizedPhone: patient.normalizedPhone,
      departmentCode: patient.departmentCode === 'SKIN' ? 'SURGERY' : 'SKIN',
    });
    if (other) {
      const submissions = await Submission.find({ patient: other._id, isDeleted: false }).sort({ formDate: -1 }).limit(100);
      groups.push({
        departmentCode: other.departmentCode,
        patientCode: other.patientCode,
        patientName: other.fullName,
        linked: true,
        submissions: await decorateHistory(submissions, actor, anchor),
      });
    }
    return groups;
  }
  if (!patient.identity) return groups;
  if (actor.role === ROLES.CLINIC_MANAGER) {
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
        submissions: await decorateHistory(submissions, actor, anchor),
      });
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
  const ids = submissions.map((item) => item._id);
  const [skins, surgeries] = await Promise.all([
    SkinSubmissionDetail.find({ submission: { $in: ids } }).lean(),
    SurgerySubmissionDetail.find({ submission: { $in: ids } }).lean(),
  ]);
  const skinById = new Map(skins.map((item) => [String(item.submission), item]));
  const surgeryById = new Map(surgeries.map((item) => [String(item.submission), item]));
  const detailed = submissions.map((item) => ({
    ...presentSubmission(item),
    skinDetails: skinById.get(String(item._id)) || null,
    surgeryDetails: surgeryById.get(String(item._id)) || null,
  }));
  if (actor.role === ROLES.CLINIC_MANAGER) return detailed;
  const prescriptions = await loadPrescriptions(ids, actor, anchor);
  const remarks = await loadRemarks(ids, actor, anchor);
  return detailed.map((item) => ({
    ...item,
    prescriptions: prescriptions.filter((entry) => String(entry.submissionId) === String(item.id)).map((entry) => ({ ...entry, canEdit: false })),
    remarks: remarks.filter((entry) => String(entry.submissionId) === String(item.id)).map((entry) => ({ ...entry, canEdit: false })),
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
  await markRecordOpened(actor._id, 'SUBMISSION', submission._id);
  await markSubmissionNotificationsRead(actor, submission._id);
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

const CLINIC_LOGO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/enfield-logo.png');
const CLINIC_SITE = 'www.enfieldroyalclinics.com.pk';
const CLINIC_PHONE = '0332 5488777';
const CLINIC_ADDRESS = '3rd Floor, Al-Ammar Center, next to Khyber Bank, F-7 Markaz, Islamabad, 44000';

function departmentTitle(code) {
  if (code === 'SKIN') return 'Skin';
  if (code === 'SURGERY') return 'Surgery';
  return code || 'Department';
}

function shown(value) {
  if (value == null || value === '') return '-';
  return String(value);
}

function prettyStatus(value) {
  return shown(value).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderHistoryPdf({ patient, history, includeClinical, documentsBySubmission }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      compress: false,
      margins: { top: 158, bottom: 58, left: 40, right: 40 },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    let painting = false;

    function paintChrome() {
      if (painting) return;
      painting = true;
      const width = doc.page.width;
      doc.save();
      doc.rect(0, 0, width, 132).fill('#0b1f33');
      try {
        doc.image(CLINIC_LOGO, 28, 24, { fit: [84, 84] });
      } catch {
        // The letterhead still prints if the logo file cannot be read.
      }
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
        .text('Enfield Royal Clinics', 124, 22, { width: width - 156, height: 22, lineBreak: false });
      doc.font('Helvetica').fontSize(11).fillColor('#99f6e4')
        .text('Medical history', 124, 46, { width: width - 156, height: 16, lineBreak: false });
      doc.fontSize(9).fillColor('#e2e8f0')
        .text(CLINIC_SITE, 124, 66, { width: width - 156, height: 14, lineBreak: false });
      doc.text(CLINIC_ADDRESS, 124, 82, { width: width - 156, height: 28 });
      doc.text(`Phone: ${CLINIC_PHONE}`, 124, 112, { width: width - 156, height: 14, lineBreak: false });
      doc.rect(0, 132, width, 4).fill('#0f766e');
      doc.rect(0, doc.page.height - 42, width, 42).fill('#0b1f33');
      doc.fillColor('#e2e8f0').fontSize(8)
        .text(`Enfield Royal Clinics   |   ${CLINIC_SITE}   |   ${CLINIC_PHONE}`, 40, doc.page.height - 26, {
          width: width - 80,
          height: 14,
          align: 'center',
          lineBreak: false,
        });
      doc.restore();
      doc.x = doc.page.margins.left;
      doc.y = doc.page.margins.top;
      painting = false;
    }

    function ensureRoom(height) {
      if (doc.y + height <= doc.page.height - doc.page.margins.bottom) return;
      doc.addPage();
    }

    function sectionHeading(title) {
      ensureRoom(36);
      const y = doc.y;
      doc.save();
      doc.roundedRect(40, y, doc.page.width - 80, 24, 4).fill('#0f766e');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
        .text(title, 52, y + 6, { width: doc.page.width - 110, height: 14, lineBreak: false });
      doc.restore();
      doc.x = 40;
      doc.y = y + 34;
      doc.fillColor('#0b1f33');
    }

    function detailLine(pairs) {
      doc.font('Helvetica').fontSize(10).fillColor('#334155')
        .text(pairs.map(([label, value]) => `${label}:  ${shown(value)}`).join('      '), { width: doc.page.width - 80 });
    }

    paintChrome();
    doc.on('pageAdded', paintChrome);

    const appointments = [...history].sort((left, right) => String(left.departmentCode).localeCompare(String(right.departmentCode)));
    doc.fillColor('#0b1f33').font('Helvetica-Bold').fontSize(18).text(patient.fullName, { width: doc.page.width - 80 });
    doc.moveDown(0.35);
    detailLine([['Phone', patient.contactNumber], ['CNIC', patient.cnic]]);
    detailLine([['Date of birth', patient.dateOfBirth], ['Age', patient.age], ['Gender', patient.gender]]);
    detailLine([['City', patient.city]]);
    detailLine([['Address', patient.address]]);

    appointments.forEach((group) => {
      doc.moveDown(0.8);
      sectionHeading(`${departmentTitle(group.departmentCode)} form   |   ${group.patientCode}`);
      doc.font('Helvetica').fontSize(10).fillColor('#475569').text(group.patientName || patient.fullName);
      if (!group.submissions?.length) {
        doc.moveDown(0.2);
        doc.fillColor('#334155').text('No form in this department yet.');
        return;
      }
      group.submissions.forEach((item, index) => {
        doc.moveDown(0.55);
        ensureRoom(88);
        doc.fillColor('#0b1f33').font('Helvetica-Bold').fontSize(12)
          .text(`${index + 1}.  ${shown(item.procedure)}`, { width: doc.page.width - 80 });
        doc.moveDown(0.15);
        detailLine([['Date', item.formDate], ['Doctor', item.doctorName]]);
        detailLine([['Booking', prettyStatus(item.bookingStatus)], ['Consultation', prettyStatus(item.consultationStatus)]]);
        detailLine([
          ['Weight', item.weightKg ? `${item.weightKg} kg` : ''],
          ['Height', item.heightCm ? `${item.heightCm} cm` : ''],
          ['Age at visit', item.ageAtSubmission],
        ]);
        detailLine([['Referred by', item.referredByOther || item.referredByLabel]]);
        detailLine([['Operational remark', item.operationalRemark]]);
        if (item.surgeryDetails) {
          const surgery = item.surgeryDetails;
          detailLine([['Anesthesia', surgery.anesthesiaTypeLabel], ['Diet', surgery.dietLabel]]);
          detailLine([['Blood test', surgery.bloodTestStatusLabel], ['Location', surgery.locationOfSurgeryLabel]]);
          detailLine([['MRI', surgery.mriLabel], ['Cost', surgery.surgeryCost], ['Follow-up sessions', surgery.followUpSessions]]);
          if (surgery.anyOther) detailLine([['Any other', surgery.anyOther]]);
        }
        item.skinDetails?.fields?.forEach((field) => detailLine([[field.label, field.value]]));
        const files = documentsBySubmission.get(String(item.id)) || [];
        if (files.length) detailLine([['Documents', files.join(', ')]]);
        if (includeClinical) {
          item.prescriptions?.forEach((prescription) => {
            const current = prescription.versions?.find((version) => version.versionNumber === prescription.currentVersion) || prescription.versions?.[0];
            const medicines = current?.medicines?.map((medicine) => medicine.name).filter(Boolean).join(', ') || '-';
            detailLine([[`Prescription v${prescription.currentVersion}`, medicines]]);
          });
          item.remarks?.forEach((note) => {
            const current = note.versions?.[0];
            const categories = current?.categoryLabels?.join(', ') || '-';
            detailLine([['Clinical remark', `${categories} - ${shown(current?.notes)}`]]);
          });
        }
      });
    });
    doc.end();
  });
}

export async function exportMedicalHistory(actor, { submissionId, patientId } = {}) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to download medical history');
  }
  let anchor = null;
  let patient;
  if (submissionId) {
    anchor = await getSubmissionForActor(actor, submissionId);
    patient = await Patient.findById(anchor.patient);
  } else {
    patient = await Patient.findById(patientId);
  }
  await assertCanAccessPatient(actor, patient);
  const history = await historyFor(patient, anchor, actor);
  const submissionIds = history.flatMap((group) => group.submissions.map((item) => item.id));
  const documents = await Document.find({ submission: { $in: submissionIds }, isDeleted: false }).select('submission originalFilename').lean();
  const documentsBySubmission = new Map();
  documents.forEach((file) => {
    const key = String(file.submission);
    const names = documentsBySubmission.get(key) || [];
    names.push(file.originalFilename);
    documentsBySubmission.set(key, names);
  });
  const presented = presentPatient(patient, { includeCnic: true });
  const buffer = await renderHistoryPdf({
    patient: presented,
    history,
    includeClinical: actor.role === ROLES.ADMIN,
    documentsBySubmission,
  });
  const codes = history.map((group) => group.patientCode).filter(Boolean).join('-') || presented.patientCode;
  await writeAudit({
    actor,
    action: AUDIT.MEDICAL_HISTORY_DOWNLOADED,
    entityType: 'Patient',
    entityId: patient._id,
    newValue: { patientCodes: history.map((group) => group.patientCode), departmentCodes: history.map((group) => group.departmentCode) },
  });
  return { buffer, filename: `${codes}-medical-history.pdf` };
}

async function withUnreadSubmissions(items, actor) {
  const presented = items.map(presentSubmission);
  const opened = await openedIdSet(actor._id, 'SUBMISSION', presented.map((item) => item.id));
  return applyUnread(presented, opened);
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
  return { items: await withUnreadSubmissions(items, actor), meta: pageMeta(total, page, limit) };
}

export async function listMyPatients(query, actor) {
  if (actor.role !== ROLES.DOCTOR) throw new ApiError(403, 'Only doctors can view this list');
  const { page, limit, skip } = parsePaging(query);
  const scoped = { ...query, doctorId: undefined };
  const filter = await buildSubmissionFilter(scoped, actor);
  filter.doctor = actor._id;
  filter.department = { $in: actor.departments || [] };
  filter.bookingStatus = BOOKING_STATUS.BOOKED;
  const sort = parseSort(query, ['formDate', 'createdAt', 'patientName', 'patientCode'], 'formDate');
  const [items, total] = await Promise.all([
    Submission.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Submission.countDocuments(filter),
  ]);
  return { items: await withUnreadSubmissions(items, actor), meta: pageMeta(total, page, limit) };
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
    if (input.status === BOOKING_STATUS.BOOKED) {
      const doctor = await User.findById(submission.doctor);
      if (doctor) await notifyDoctorOfPatient({ doctor, submission, assignedBy: actor.fullName });
    }
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
  if (submission.bookingStatus === BOOKING_STATUS.BOOKED) {
    await notifyDoctorOfPatient({ doctor, submission, assignedBy: actor.fullName, reason: 'reassigned' });
  }
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
  const next = text.trim();
  if (next === (submission.operationalRemark || '')) return presentSubmission(submission);
  const previous = submission.operationalRemark;
  submission.operationalRemarkHistory.push({
    text: next,
    author: actor._id,
    authorName: actor.fullName,
    at: new Date(),
  });
  submission.operationalRemark = next;
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
