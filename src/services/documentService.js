import crypto from 'crypto';
import { Document } from '../models/Document.js';
import { DocumentAccessLog } from '../models/DocumentAccessLog.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { safeFilename } from '../utils/strings.js';
import { getStorage } from '../storage/index.js';
import { getSubmissionForActor } from './accessService.js';
import { writeAudit } from './auditService.js';
import { AUDIT, ROLES } from '../constants/index.js';

const blockedExtensions = new Set(['exe', 'bat', 'cmd', 'com', 'msi', 'dll', 'scr', 'ps1', 'vbs', 'js', 'jar', 'sh', 'hta', 'cpl', 'msc']);

function extensionOf(name) {
  return (String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
}

function assertFile(file) {
  const extension = extensionOf(file?.originalname);
  const buffer = file?.buffer;
  if (!extension || blockedExtensions.has(extension)) throw new ApiError(400, 'This file type cannot be uploaded');
  if (!buffer?.length) throw new ApiError(400, 'The file is empty');
  if (buffer.length > env.maxFileSize) throw new ApiError(400, 'File exceeds the 10 MB limit');
  return { buffer, extension, mimeType: file.mimetype || 'application/octet-stream' };
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
    newValue: { filename: document.originalFilename, submissionId: document.submission },
    req,
  });
}

export async function uploadDocuments(submissionId, files, actor, req) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to upload documents');
  }
  if (!files?.length) throw new ApiError(400, 'Choose at least one file');
  const submission = await getSubmissionForActor(actor, submissionId);
  const storage = await getStorage();
  const created = [];
  for (const file of files) {
    const { buffer, extension, mimeType } = assertFile(file);
    const saved = await storage.saveFile(buffer, { extension, contentType: mimeType });
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
    });
    created.push(document);
    await writeAudit({
      actor,
      action: AUDIT.DOCUMENT_UPLOADED,
      entityType: 'Document',
      entityId: document._id,
      newValue: { filename: document.originalFilename, size: document.size, patientCode: submission.patientCode },
      req,
    });
  }
  return created.map((document) => ({
    id: document._id,
    originalFilename: document.originalFilename,
    size: document.size,
    createdAt: document.createdAt,
    uploadedByName: document.uploadedByName,
  }));
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
