import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { ApiError } from '../utils/ApiError.js';
import { presentUser } from '../utils/presenters.js';
import { parsePaging, pageMeta } from '../utils/http.js';
import { writeAudit } from './auditService.js';
import { AUDIT, ROLES } from '../constants/index.js';
import { BCRYPT_ROUNDS, uniqueUsernameFromEmail } from './authService.js';

async function hydrate(users) {
  const list = Array.isArray(users) ? users : [users];
  const ids = [...new Set(list.flatMap((user) => (user.departments || []).map(String)))];
  const departments = await Department.find({ _id: { $in: ids } }).select('name code');
  const byId = new Map(departments.map((department) => [String(department._id), department]));
  return list.map((user) => presentUser(user, (user.departments || []).map((id) => byId.get(String(id))).filter(Boolean)));
}

async function assertDepartments(role, departmentIds) {
  if (role !== ROLES.DOCTOR) return [];
  if (!departmentIds?.length) throw new ApiError(400, 'Assign the doctor to at least one department');
  const departments = await Department.find({ _id: { $in: departmentIds }, isActive: true });
  if (departments.length !== departmentIds.length) throw new ApiError(400, 'One or more departments are invalid');
  return departments.map((department) => department._id);
}

export async function listDoctors(query = {}) {
  const filter = { role: ROLES.DOCTOR, isActive: true };
  if (query.departmentId) filter.departments = query.departmentId;
  const users = await User.find(filter).sort({ fullName: 1 });
  return hydrate(users);
}

export async function listUsers(query) {
  const { page, limit, skip } = parsePaging(query);
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.active === 'true') filter.isActive = true;
  if (query.active === 'false') filter.isActive = false;
  if (query.departmentId) filter.departments = query.departmentId;
  if (query.search) {
    const term = query.search.trim();
    filter.$or = [
      { fullName: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { username: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
    ];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items: await hydrate(users), meta: pageMeta(total, page, limit) };
}

export async function createUser(input, actor, req) {
  if (actor?.role !== ROLES.ADMIN) throw new ApiError(403, 'Only an administrator can create accounts');
  const email = input.email ? String(input.email).trim().toLowerCase() : '';
  if (!email) throw new ApiError(400, 'Email is required');
  if (!input.phone) throw new ApiError(400, 'Contact number is required');
  const username = input.username
    ? String(input.username).trim().toLowerCase()
    : await uniqueUsernameFromEmail(email);
  const existing = await User.findOne({ $or: [{ username }, ...(email ? [{ email }] : [])] });
  if (existing?.username === username) throw new ApiError(409, 'Username is already in use');
  if (existing?.email && existing.email === email) throw new ApiError(409, 'Email is already in use');
  const departments = await assertDepartments(input.role, input.departments || []);
  const user = await User.create({
    username,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    fullName: input.fullName.trim(),
    role: input.role,
    departments: input.role === ROLES.DOCTOR ? departments : [],
    phone: input.phone || '',
    email,
    isActive: input.isActive !== false,
    createdBy: actor._id,
  });
  await writeAudit({
    actor,
    action: AUDIT.USER_CREATED,
    entityType: 'User',
    entityId: user._id,
    newValue: { username: user.username, fullName: user.fullName, role: user.role, isActive: user.isActive },
    req,
  });
  const [view] = await hydrate(user);
  return view;
}

export async function updateUser(id, input, actor, req) {
  if (actor?.role !== ROLES.ADMIN) throw new ApiError(403, 'Only an administrator can update accounts');
  const user = await User.findById(id).select('+refreshTokens');
  if (!user) throw new ApiError(404, 'User not found');
  const previous = { fullName: user.fullName, role: user.role, isActive: user.isActive, phone: user.phone, email: user.email };
  if (input.fullName) user.fullName = input.fullName.trim();
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.email !== undefined) user.email = input.email;
  if (input.role) user.role = input.role;
  if (input.role || input.departments) {
    const role = input.role || user.role;
    user.departments = role === ROLES.DOCTOR
      ? await assertDepartments(role, input.departments || user.departments.map(String))
      : [];
  }
  if (input.isActive === false) {
    if (String(user._id) === String(actor._id)) throw new ApiError(400, 'You cannot deactivate your own account');
    if (user.role === ROLES.ADMIN) {
      const remaining = await User.countDocuments({ role: ROLES.ADMIN, isActive: true, _id: { $ne: user._id } });
      if (!remaining) throw new ApiError(400, 'At least one active administrator is required');
    }
    user.isActive = false;
    user.refreshTokens = [];
  } else if (input.isActive === true) {
    user.isActive = true;
  }
  await user.save();
  await writeAudit({
    actor,
    action: input.isActive === false ? AUDIT.USER_DEACTIVATED : input.isActive === true && previous.isActive === false ? AUDIT.USER_REACTIVATED : AUDIT.USER_UPDATED,
    entityType: 'User',
    entityId: user._id,
    previousValue: previous,
    newValue: { fullName: user.fullName, role: user.role, isActive: user.isActive },
    req,
  });
  const [view] = await hydrate(user);
  return view;
}

export async function resetPassword(id, password, actor, req) {
  if (actor?.role !== ROLES.ADMIN) throw new ApiError(403, 'Only an administrator can reset passwords');
  const user = await User.findById(id).select('+passwordHash +refreshTokens');
  if (!user) throw new ApiError(404, 'User not found');
  user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  user.refreshTokens = [];
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();
  await writeAudit({
    actor,
    action: AUDIT.PASSWORD_RESET,
    entityType: 'User',
    entityId: user._id,
    newValue: { passwordReset: true },
    req,
  });
}
