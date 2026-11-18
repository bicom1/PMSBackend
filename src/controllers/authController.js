import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/authService.js';
import { Department } from '../models/Department.js';
import { presentUser } from '../utils/presenters.js';

export const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.body, req, res);
  res.json({ success: true, data });
});

export const signup = asyncHandler(async (req, res) => {
  const data = await authService.signup(req.body, req);
  res.status(201).json({ success: true, data });
});

export const setup = asyncHandler(async (_req, res) => {
  const { User } = await import('../models/User.js');
  const needsSetup = (await User.countDocuments({ role: 'ADMIN', isActive: true })) === 0;
  res.json({ success: true, data: { needsSetup } });
});

export const refresh = asyncHandler(async (req, res) => {
  const data = await authService.refreshSession(req.cookies[authService.COOKIE], res);
  res.json({ success: true, data });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies[authService.COOKIE], res);
  res.json({ success: true, message: 'Signed out' });
});

export const me = asyncHandler(async (req, res) => {
  const departments = await Department.find({ _id: { $in: req.user.departments || [] } }).select('name code');
  res.json({ success: true, data: presentUser(req.user, departments) });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user, req.body, req);
  res.json({ success: true, message: 'Password updated' });
});
