import { asyncHandler } from '../utils/asyncHandler.js';
import * as reports from '../services/reportService.js';
import { listAuditLogs } from '../services/auditService.js';

export const list = asyncHandler(async (req, res) => {
  const data = await reports.listReport(req.query, req.user);
  res.json({ success: true, ...data });
});

export const analytics = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await reports.getAnalytics(req.query, req.user) });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const file = await reports.exportReport(req.query, req.user, 'csv');
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
});

export const exportXlsx = asyncHandler(async (req, res) => {
  const file = await reports.exportReport(req.query, req.user, 'xlsx');
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
});

export const audit = asyncHandler(async (req, res) => {
  const data = await listAuditLogs(req.query, req.user);
  res.json({ success: true, ...data });
});

export const rejectAuditChange = asyncHandler(async (_req, res) => {
  res.status(403).json({ success: false, message: 'Audit records cannot be modified' });
});
