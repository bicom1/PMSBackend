import { Prescription } from '../models/Prescription.js';
import { PrescriptionVersion } from '../models/PrescriptionVersion.js';
import { DoctorRemark } from '../models/DoctorRemark.js';
import { RemarkVersion } from '../models/RemarkVersion.js';
import { MasterData } from '../models/MasterData.js';
import { ApiError } from '../utils/ApiError.js';
import { clinicToday, isIsoDate } from '../utils/dates.js';
import { assertAssignedDoctor, getSubmissionForActor } from './accessService.js';
import { writeAudit } from './auditService.js';
import { AUDIT, ROLES } from '../constants/index.js';
import PDFDocument from 'pdfkit';
import { getSettings } from './catalogService.js';
import { Patient } from '../models/Patient.js';

function canEditPrescription(actor, submission, prescription) {
  return actor.role === ROLES.DOCTOR
    && submission.bookingStatus === 'BOOKED'
    && String(submission.doctor) === String(actor._id)
    && String(prescription.doctor) === String(actor._id)
    && String(prescription.submission) === String(submission._id);
}

export async function loadPrescriptions(submissionIds, actor, anchorSubmission) {
  const prescriptions = await Prescription.find({ submission: { $in: submissionIds }, isDeleted: false }).sort({ createdAt: -1 });
  const versions = await PrescriptionVersion.find({ prescription: { $in: prescriptions.map((item) => item._id) } }).sort({ versionNumber: -1 });
  return prescriptions.map((prescription) => ({
    id: prescription._id,
    submissionId: prescription.submission,
    patientId: prescription.patient,
    doctorId: prescription.doctor,
    doctorName: prescription.doctorName,
    currentVersion: prescription.currentVersion,
    createdAt: prescription.createdAt,
    canEdit: anchorSubmission ? canEditPrescription(actor, anchorSubmission, prescription) : false,
    versions: versions.filter((version) => String(version.prescription) === String(prescription._id)).map((version) => ({
      id: version._id,
      versionNumber: version.versionNumber,
      medicines: version.medicines,
      prescriptionDate: version.prescriptionDate,
      editedByName: version.editedByName,
      note: version.note,
      createdAt: version.createdAt,
    })),
  }));
}

export async function loadRemarks(submissionIds, actor, anchorSubmission) {
  const remarks = await DoctorRemark.find({ submission: { $in: submissionIds }, isDeleted: false }).sort({ createdAt: -1 });
  const versions = await RemarkVersion.find({ remark: { $in: remarks.map((item) => item._id) } }).sort({ versionNumber: -1 });
  return remarks.map((remark) => ({
    id: remark._id,
    submissionId: remark.submission,
    patientId: remark.patient,
    doctorId: remark.doctor,
    doctorName: remark.doctorName,
    categories: remark.categories,
    currentVersion: remark.currentVersion,
    createdAt: remark.createdAt,
    canEdit: actor.role === ROLES.DOCTOR
      && anchorSubmission
      && String(anchorSubmission.doctor) === String(actor._id)
      && anchorSubmission.bookingStatus === 'BOOKED'
      && String(remark.doctor) === String(actor._id)
      && String(remark.submission) === String(anchorSubmission._id),
    versions: versions.filter((version) => String(version.remark) === String(remark._id)).map((version) => ({
      id: version._id,
      versionNumber: version.versionNumber,
      categories: version.categories,
      categoryLabels: version.categoryLabels,
      notes: version.notes,
      editedByName: version.editedByName,
      createdAt: version.createdAt,
    })),
  }));
}

export async function createPrescription(submissionId, input, actor, req) {
  const submission = await getSubmissionForActor(actor, submissionId);
  assertAssignedDoctor(actor, submission);
  if (!isIsoDate(input.prescriptionDate) || input.prescriptionDate > clinicToday()) {
    throw new ApiError(400, 'Prescription date is invalid');
  }
  const prescription = await Prescription.create({
    submission: submission._id,
    patient: submission.patient,
    doctor: actor._id,
    doctorName: actor.fullName,
    currentVersion: 1,
  });
  await PrescriptionVersion.create({
    prescription: prescription._id,
    versionNumber: 1,
    medicines: input.medicines,
    prescriptionDate: input.prescriptionDate,
    editedBy: actor._id,
    editedByName: actor.fullName,
    note: '',
  });
  await writeAudit({
    actor,
    action: AUDIT.PRESCRIPTION_CREATED,
    entityType: 'Prescription',
    entityId: prescription._id,
    newValue: { submissionId: submission._id, patientCode: submission.patientCode, medicineCount: input.medicines.length },
    req,
  });
  const [presented] = await loadPrescriptions([submission._id], actor, submission);
  return presented;
}

export async function addPrescriptionVersion(prescriptionId, input, actor, req) {
  const prescription = await Prescription.findOne({ _id: prescriptionId, isDeleted: false });
  if (!prescription) throw new ApiError(404, 'Prescription not found');
  const submission = await getSubmissionForActor(actor, prescription.submission);
  if (!canEditPrescription(actor, submission, prescription)) {
    throw new ApiError(403, 'Historical prescriptions from another doctor are read-only');
  }
  if (!isIsoDate(input.prescriptionDate) || input.prescriptionDate > clinicToday()) {
    throw new ApiError(400, 'Prescription date is invalid');
  }
  const previousVersion = prescription.currentVersion;
  const version = await PrescriptionVersion.create({
    prescription: prescription._id,
    versionNumber: previousVersion + 1,
    medicines: input.medicines,
    prescriptionDate: input.prescriptionDate,
    editedBy: actor._id,
    editedByName: actor.fullName,
    note: input.note || '',
  });
  prescription.currentVersion = version.versionNumber;
  await prescription.save();
  await writeAudit({
    actor,
    action: AUDIT.PRESCRIPTION_VERSIONED,
    entityType: 'Prescription',
    entityId: prescription._id,
    previousValue: { version: previousVersion },
    newValue: { version: version.versionNumber, medicineCount: input.medicines.length },
    req,
  });
  const records = await loadPrescriptions([submission._id], actor, submission);
  return records.find((item) => String(item.id) === String(prescription._id));
}

async function categoryLabels(values) {
  const records = await MasterData.find({ type: 'REMARK_CATEGORY', value: { $in: values }, isActive: true });
  if (records.length !== new Set(values).size) throw new ApiError(400, 'One or more remark categories are invalid');
  const labels = new Map(records.map((record) => [record.value, record.label]));
  return values.map((value) => labels.get(value));
}

export async function createRemark(submissionId, input, actor, req) {
  const submission = await getSubmissionForActor(actor, submissionId);
  assertAssignedDoctor(actor, submission);
  const labels = await categoryLabels(input.categories);
  const remark = await DoctorRemark.create({
    submission: submission._id,
    patient: submission.patient,
    doctor: actor._id,
    doctorName: actor.fullName,
    categories: input.categories,
    currentVersion: 1,
  });
  await RemarkVersion.create({
    remark: remark._id,
    versionNumber: 1,
    categories: input.categories,
    categoryLabels: labels,
    notes: input.notes.trim(),
    editedBy: actor._id,
    editedByName: actor.fullName,
  });
  await writeAudit({
    actor,
    action: AUDIT.CLINICAL_REMARK_CREATED,
    entityType: 'DoctorRemark',
    entityId: remark._id,
    newValue: { submissionId: submission._id, patientCode: submission.patientCode, categories: labels },
    req,
  });
  const records = await loadRemarks([submission._id], actor, submission);
  return records.find((item) => String(item.id) === String(remark._id));
}

export async function addRemarkVersion(remarkId, input, actor, req) {
  const remark = await DoctorRemark.findOne({ _id: remarkId, isDeleted: false });
  if (!remark) throw new ApiError(404, 'Clinical remark not found');
  const submission = await getSubmissionForActor(actor, remark.submission);
  if (actor.role !== ROLES.DOCTOR || String(remark.doctor) !== String(actor._id) || String(submission.doctor) !== String(actor._id) || submission.bookingStatus !== 'BOOKED') {
    throw new ApiError(403, 'Historical clinical remarks from another doctor are read-only');
  }
  const labels = await categoryLabels(input.categories);
  const previousVersion = remark.currentVersion;
  const version = await RemarkVersion.create({
    remark: remark._id,
    versionNumber: previousVersion + 1,
    categories: input.categories,
    categoryLabels: labels,
    notes: input.notes.trim(),
    editedBy: actor._id,
    editedByName: actor.fullName,
  });
  remark.categories = input.categories;
  remark.currentVersion = version.versionNumber;
  await remark.save();
  await writeAudit({
    actor,
    action: AUDIT.CLINICAL_REMARK_VERSIONED,
    entityType: 'DoctorRemark',
    entityId: remark._id,
    previousValue: { version: previousVersion },
    newValue: { version: version.versionNumber, categories: labels },
    req,
  });
  const records = await loadRemarks([submission._id], actor, submission);
  return records.find((item) => String(item.id) === String(remark._id));
}

export async function buildPrescriptionPdf(prescriptionId, versionNumber, actor) {
  const prescription = await Prescription.findOne({ _id: prescriptionId, isDeleted: false });
  if (!prescription) throw new ApiError(404, 'Prescription not found');
  const submission = await getSubmissionForActor(actor, prescription.submission);
  if (actor.role === ROLES.CLINIC_MANAGER) throw new ApiError(403, 'You do not have permission to view prescriptions');
  const version = versionNumber
    ? await PrescriptionVersion.findOne({ prescription: prescription._id, versionNumber })
    : await PrescriptionVersion.findOne({ prescription: prescription._id }).sort({ versionNumber: -1 });
  if (!version) throw new ApiError(404, 'Prescription version not found');
  const patient = await Patient.findById(prescription.patient);
  const settings = await getSettings();
  const buffer = await renderPdf({ settings, patient, submission, prescription, version });
  return { buffer, filename: `${submission.patientCode}-prescription-v${version.versionNumber}.pdf` };
}

function renderPdf({ settings, patient, submission, prescription, version }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(18).text(settings.clinicName || 'Clinic', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(14).text('Prescription', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Patient: ${patient.fullName}`);
    doc.text(`Patient ID: ${submission.patientCode}`);
    doc.text(`Department: ${submission.departmentCode}`);
    doc.text(`Procedure: ${submission.procedureName}`);
    doc.text(`Doctor: ${prescription.doctorName}`);
    doc.text(`Date: ${version.prescriptionDate}`);
    doc.text(`Version: ${version.versionNumber}`);
    doc.moveDown();
    version.medicines.forEach((medicine, index) => {
      doc.fontSize(12).text(`${index + 1}. ${medicine.name} — ${medicine.dose}`);
      doc.fontSize(10).text(`Frequency: ${medicine.frequency}    Duration: ${medicine.duration}`);
      if (medicine.instructions) doc.text(`Instructions: ${medicine.instructions}`);
      doc.moveDown(0.4);
    });
    doc.moveDown();
    doc.fontSize(10).text('This prescription was generated from the clinic record. Earlier versions are preserved and were not overwritten.');
    doc.end();
  });
}
