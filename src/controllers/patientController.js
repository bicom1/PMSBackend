import { asyncHandler } from '../utils/asyncHandler.js';
import * as patients from '../services/patientService.js';

export const identify = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await patients.identifyPatient(req.body, req.user) });
});

export const list = asyncHandler(async (req, res) => {
  const data = await patients.listPatients(req.query, req.user);
  res.json({ success: true, ...data });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await patients.getPatient(req.params.id, req.user) });
});

export const correct = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await patients.correctPatient(req.params.id, req.body, req.user, req) });
});

export const link = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await patients.linkPatients(req.body, req.user, req) });
});

export const merge = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await patients.mergePatients(req.body, req.user, req) });
});
