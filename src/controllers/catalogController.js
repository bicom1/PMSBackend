import { asyncHandler } from '../utils/asyncHandler.js';
import * as catalog from '../services/catalogService.js';

export const departments = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.listDepartments(req.query) });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.updateDepartment(req.params.id, req.body, req.user, req) });
});

export const procedures = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.listProcedures(req.query) });
});

export const createProcedure = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await catalog.createProcedure(req.body, req.user, req) });
});

export const updateProcedure = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.updateProcedure(req.params.id, req.body, req.user, req) });
});

export const masterTypes = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: catalog.listMasterTypes() });
});

export const masterData = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.listMasterData(req.query) });
});

export const createMaster = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await catalog.createMasterData(req.body, req.user, req) });
});

export const updateMaster = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.updateMasterData(req.params.id, req.body, req.user, req) });
});

export const deleteMaster = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.deleteMasterData(req.params.id, req.user, req) });
});

export const currentPolicy = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.getCurrentPolicy(req.query.departmentCode || 'SKIN') });
});

export const policyVersions = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.listPolicyVersions(req.query.departmentCode || 'SKIN') });
});

export const publishPolicy = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await catalog.publishPolicy(req.body, req.user, req) });
});

export const branding = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await catalog.getBranding() });
});

export const settings = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await catalog.getSettings() });
});

export const updateSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await catalog.updateSettings(req.body, req.user, req) });
});
