import { asyncHandler } from '../utils/asyncHandler.js';
import * as submissions from '../services/submissionService.js';
import * as clinical from '../services/clinicalService.js';
import * as documents from '../services/documentService.js';
import * as dashboard from '../services/dashboardService.js';
import * as notifications from '../services/notificationService.js';
import * as voice from '../services/voiceService.js';
import { listUnreadSubmissions } from '../services/recordViewService.js';

export const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await submissions.createSubmission(req.body, req.user, req) });
});

export const list = asyncHandler(async (req, res) => {
  const data = await submissions.listSubmissions(req.query, req.user);
  res.json({ success: true, ...data });
});

export const detail = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await submissions.getSubmissionDetail(req.params.id, req.user) });
});

export const booking = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await submissions.updateBooking(req.params.id, req.body, req.user, req) });
});

export const reassign = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await submissions.reassignDoctor(req.params.id, req.body, req.user, req) });
});

export const operationalRemark = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await submissions.updateOperationalRemark(req.params.id, req.body.text, req.user, req) });
});

export const consultation = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await submissions.updateConsultation(req.params.id, req.body.status, req.user, req) });
});

export const myPatients = asyncHandler(async (req, res) => {
  const data = await submissions.listMyPatients(req.query, req.user);
  res.json({ success: true, ...data });
});

export const inbox = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await listUnreadSubmissions(req.user) });
});

export const notificationsList = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await notifications.listNotifications(req.user) });
});

export const notificationsRead = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await notifications.markNotificationsRead(req.user, req.body) });
});

export const createPrescription = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await clinical.createPrescription(req.params.id, req.body, req.user, req) });
});

export const versionPrescription = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await clinical.addPrescriptionVersion(req.params.id, req.body, req.user, req) });
});

export const historyPdf = asyncHandler(async (req, res) => {
  const file = await submissions.exportMedicalHistory(req.user, { submissionId: req.params.id });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.buffer);
});

export const prescriptionPdf = asyncHandler(async (req, res) => {
  const version = req.query.version ? Number(req.query.version) : undefined;
  const file = await clinical.buildPrescriptionPdf(req.params.id, version, req.user);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.buffer);
});

export const createRemark = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await clinical.createRemark(req.params.id, req.body, req.user, req) });
});

export const versionRemark = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await clinical.addRemarkVersion(req.params.id, req.body, req.user, req) });
});

export const upload = asyncHandler(async (req, res) => {
  const data = await documents.uploadDocuments(req.params.id, req.files, req.user, req, {
    category: req.body?.category,
    note: req.body?.note,
  });
  res.status(201).json({ success: true, data });
});

const inlineTypes = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  bmp: 'image/bmp', svg: 'image/svg+xml', txt: 'text/plain', csv: 'text/csv', json: 'application/json', html: 'text/html',
  htm: 'text/html', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
};

function inlineContentType(filename, mimeType) {
  const current = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const extension = (String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
  if (current && current !== 'application/octet-stream') return current;
  return inlineTypes[extension] || current || 'application/octet-stream';
}

export const viewDocument = asyncHandler(async (req, res) => {
  const file = await documents.readDocument(req.params.id, req.user, req, 'VIEW');
  res.setHeader('Content-Type', inlineContentType(file.filename, file.mimeType));
  res.setHeader('Content-Disposition', `inline; filename="${file.filename.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.buffer);
});

export const downloadDocument = asyncHandler(async (req, res) => {
  const file = await documents.readDocument(req.params.id, req.user, req, 'DOWNLOAD');
  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.buffer);
});

export const removeDocument = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await documents.deleteDocument(req.params.id, req.user, req, req.body.reason) });
});

export const managerHome = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await dashboard.managerDashboard(req.user) });
});

export const doctorHome = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await dashboard.doctorDashboard(req.user) });
});

export const adminHome = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await dashboard.adminDashboard(req.user) });
});
