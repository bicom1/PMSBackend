import crypto from 'crypto';
import { Document } from '../models/Document.js';
import { DocumentAccessLog } from '../models/DocumentAccessLog.js';
import { Patient } from '../models/Patient.js';
import { PatientIdentity } from '../models/PatientIdentity.js';
import { Submission } from '../models/Submission.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { safeFilename } from '../utils/strings.js';
import { getStorage } from '../storage/index.js';
import { getSubmissionForActor, assertCanAccessPatient } from './accessService.js';
import { writeAudit } from './auditService.js';
import { AUDIT, ROLES } from '../constants/index.js';

export const DOCUMENT_KINDS = [
  { value: 'LAB', label: 'Lab report' },
  { value: 'SCAN', label: 'Scan or photo' },
  { value: 'CONSENT', label: 'Consent form' },
  { value: 'IDENTITY', label: 'Identity document' },
  { value: 'OTHER', label: 'Other clinical file' },
];

const allowedExtensions = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv']);
const blockedExtensions = new Set(['exe', 'bat', 'cmd', 'com', 'msi', 'dll', 'scr', 'ps1', 'vbs', 'js', 'jar', 'sh', 'hta', 'cpl', 'msc']);

export function extensionOf(name) {
  return (String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
}

export function documentNameError(name) {
  const extension = extensionOf(name);
  if (!extension) return 'The file needs a name such as labs.pdf';
  if (blockedExtensions.has(extension) || !allowedExtensions.has(extension)) {
    return 'Upload a PDF, image, Word, Excel, or text file';
  }
  return '';
}

function assertFile(file) {
  const nameError = documentNameError(file?.originalname);
  if (nameError) throw new ApiError(400, nameError);
  const extension = extensionOf(file.originalname);
  const buffer = file?.buffer;
  if (!buffer?.length) throw new ApiError(400, 'The file is empty');
  if (buffer.length > env.maxFileSize) throw new ApiError(400, 'Each file must be 10 MB or smaller');
  return { buffer, extension, mimeType: file.mimetype || 'application/octet-stream' };
}

function kindOf(value) {
  return DOCUMENT_KINDS.some((item) => item.value === value) ? value : 'OTHER';
}

export function presentDocument(document, actor) {
  const own = actor && String(document.uploadedBy) === String(actor._id);
  const canDelete = Boolean(actor) && !document.isDeleted && (actor.role === ROLES.ADMIN || (actor.role === ROLES.CLINIC_MANAGER && own));
  const kind = DOCUMENT_KINDS.find((item) => item.value === document.category) || DOCUMENT_KINDS[4];
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
    category: kind.value,
    categoryLabel: kind.label,
    note: document.note || '',
    canDelete,
    submissionId: document.submission,
  };
}

async function logAccess(document, actor, action, req) {
  await DocumentAccessLog.create({
    document: document._id,
    user: actor._id,
    userName: actor.fullName,
    userRole: actor.role,
    action,
    ip: req.ip || '',
    userAgent: String(req.get?.('user-agent') || '').slice(0, 300),
  });
  await writeAudit({
    actor,
    action: action === 'VIEW' ? AUDIT.DOCUMENT_VIEWED : action === 'DOWNLOAD' ? AUDIT.DOCUMENT_DOWNLOADED : AUDIT.DOCUMENT_DELETED,
    entityType: 'Document',
    entityId: document._id,
    newValue: {
      filename: document.originalFilename,
      submissionId: document.submission,
      ...(document.deleteReason ? { reason: document.deleteReason } : {}),
    },
    req,
  });
}

export async function uploadDocuments(submissionId, files, actor, req, meta = {}) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to upload documents');
  }
  if (!files?.length) throw new ApiError(400, 'Choose at least one file');
  if (files.length > 10) throw new ApiError(400, 'Upload up to 10 files at a time');
  const submission = await getSubmissionForActor(actor, submissionId);
  const storage = await getStorage();
  const category = kindOf(meta.category);
  const note = String(meta.note || '').trim().slice(0, 240);
  const created = [];
  for (const file of files) {
    const { buffer, extension, mimeType } = assertFile(file);
    let saved;
    try {
      saved = await storage.saveFile(buffer, { extension, contentType: mimeType });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'The file could not be stored. Try again.');
    }
    const document = await Document.create({
      submission: submission._id,
      patient: submission.patient,
      originalFilename: safeFilename(file.originalname),
      storageKey: saved.storageKey,
      mimeType,
      size: buffer.length,
      checksum: crypto.createHash('sha256').update(buffer).digest('hex'),
      uploadedBy: actor._id,
      uploadedByName: actor.fullName,
      category,
      note,
    });
    created.push(document);
    await writeAudit({
      actor,
      action: AUDIT.DOCUMENT_UPLOADED,
      entityType: 'Document',
      entityId: document._id,
      newValue: { filename: document.originalFilename, size: document.size, patientCode: submission.patientCode, category, note },
      req,
    });
  }
  return created.map((document) => presentDocument(document, actor));
}

async function loadReadable(documentId, actor) {
  const document = await Document.findById(documentId);
  if (!document || (document.isDeleted && actor.role !== ROLES.ADMIN)) throw new ApiError(404, 'Document not found');
  await getSubmissionForActor(actor, document.submission);
  if (document.isDeleted) throw new ApiError(404, 'Document not found');
  return document;
}

export async function readDocument(documentId, actor, req, action) {
  const document = await loadReadable(documentId, actor);
  const storage = await getStorage();
  const buffer = await storage.openFile(document.storageKey);
  await logAccess(document, actor, action, req);
  return { buffer, filename: document.originalFilename, mimeType: document.mimeType || 'application/octet-stream' };
}

export async function deleteDocument(documentId, actor, req, reason = '') {
  const document = await Document.findById(documentId);
  if (!document || document.isDeleted) throw new ApiError(404, 'Document not found');
  await getSubmissionForActor(actor, document.submission);
  if (actor.role === ROLES.DOCTOR) throw new ApiError(403, 'Doctors cannot delete operational documents');
  if (actor.role === ROLES.CLINIC_MANAGER && String(document.uploadedBy) !== String(actor._id)) {
    throw new ApiError(403, 'You can delete only documents you uploaded');
  }
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to delete documents');
  }
  document.isDeleted = true;
  document.deletedAt = new Date();
  document.deletedBy = actor._id;
  document.deletedByName = actor.fullName;
  document.deleteReason = reason || '';
  await document.save();
  await logAccess(document, actor, 'DELETE', req);
  return { id: document._id, isDeleted: true };
}

export async function listPatientDocuments(patientId, actor) {
  const patient = await Patient.findOne({ _id: patientId, isDeleted: false });
  await assertCanAccessPatient(actor, patient);
  const ids = new Set([String(patient._id)]);
  if (patient.identity) {
    const identity = await PatientIdentity.findById(patient.identity).lean();
    if (identity?.skinPatient) ids.add(String(identity.skinPatient));
    if (identity?.surgeryPatient) ids.add(String(identity.surgeryPatient));
  } else if (actor.role === ROLES.ADMIN || actor.role === ROLES.CLINIC_MANAGER) {
    const other = await Patient.findOne({
      isDeleted: false,
      cnicHash: patient.cnicHash,
      normalizedName: patient.normalizedName,
      normalizedPhone: patient.normalizedPhone,
      departmentCode: patient.departmentCode === 'SKIN' ? 'SURGERY' : 'SKIN',
    }).lean();
    if (other) ids.add(String(other._id));
  }
  const submissions = await Submission.find({ patient: { $in: [...ids] }, isDeleted: false }).sort({ formDate: -1, createdAt: -1 }).lean();
  const documents = await Document.find({
    submission: { $in: submissions.map((item) => item._id) },
    ...(actor.role === ROLES.ADMIN ? {} : { isDeleted: false }),
  }).sort({ createdAt: -1 }).lean();
  const visitById = new Map(submissions.map((item) => [String(item._id), item]));
  return {
    visits: submissions.map((item) => ({
      id: item._id,
      patientCode: item.patientCode,
      departmentCode: item.departmentCode,
      formDate: item.formDate,
      procedure: item.procedureName,
      bookingStatus: item.bookingStatus,
    })),
    documents: documents.map((document) => {
      const visit = visitById.get(String(document.submission));
      return {
        ...presentDocument(document, actor),
        patientCode: visit?.patientCode || '',
        departmentCode: visit?.departmentCode || '',
        formDate: visit?.formDate || '',
        procedure: visit?.procedureName || '',
      };
    }),
  };
}
