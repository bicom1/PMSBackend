import { asyncHandler } from '../utils/asyncHandler.js';
import * as formFields from '../services/formFieldService.js';

export const list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await formFields.listFormFields(req.query) });
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await formFields.createFormField(req.body, req.user, req) });
});

export const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await formFields.updateFormField(req.params.id, req.body, req.user, req) });
});

export const remove = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await formFields.deleteFormField(req.params.id, req.user, req) });
});
