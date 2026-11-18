import { asyncHandler } from '../utils/asyncHandler.js';
import * as userService from '../services/userService.js';

export const doctors = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await userService.listDoctors(req.query) });
});

export const list = asyncHandler(async (req, res) => {
  const data = await userService.listUsers(req.query);
  res.json({ success: true, ...data });
});

export const create = asyncHandler(async (req, res) => {
  const data = await userService.createUser(req.body, req.user, req);
  res.status(201).json({ success: true, data });
});

export const update = asyncHandler(async (req, res) => {
  const data = await userService.updateUser(req.params.id, req.body, req.user, req);
  res.json({ success: true, data });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await userService.resetPassword(req.params.id, req.body.password, req.user, req);
  res.json({ success: true, message: 'Password reset' });
});
