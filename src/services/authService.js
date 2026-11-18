import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Department } from '../models/Department.js';
import { ApiError } from '../utils/ApiError.js';
import { sha256 } from '../utils/crypto.js';
import { presentUser } from '../utils/presenters.js';
import { writeAudit } from './auditService.js';
import { AUDIT, ROLES } from '../constants/index.js';

const COOKIE = 'cpms_refresh';
export const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

async function viewUser(user) {
  const departments = await Department.find({ _id: { $in: user.departments || [] } }).select('name code');
  return presentUser(user, departments);
}

function signAccess(user) {
  return jwt.sign({ sub: String(user._id), type: 'access' }, env.jwtAccessSecret, { expiresIn: env.jwtAccessExpires });
}

function signRefresh(user) {
  return jwt.sign(
    { sub: String(user._id), type: 'refresh', jti: cryptoRandom() },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpires },
  );
}

function cryptoRandom() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${sha256(String(Math.random())).slice(0, 12)}`;
}

export function setRefreshCookie(res, token) {
  const decoded = jwt.decode(token);
  const maxAge = decoded?.exp ? Math.max(0, decoded.exp * 1000 - Date.now()) : 7 * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? 'none' : 'lax',
    path: '/api/auth',
    maxAge,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(COOKIE, { path: '/api/auth' });
}

async function issueTokens(user) {
  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);
  const decoded = jwt.decode(refreshToken);
  user.refreshTokens.push({
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(decoded.exp * 1000),
    createdAt: new Date(),
  });
  user.refreshTokens = user.refreshTokens.slice(-5);
  return { accessToken, refreshToken };
}

export async function uniqueUsernameFromEmail(email) {
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24);
  const base = (local.length >= 3 ? local : `user${local}`).slice(0, 24);
  let candidate = base;
  let suffix = 1;
  while (await User.exists({ username: candidate })) {
    const extra = String(suffix);
    candidate = `${base.slice(0, 30 - extra.length)}${extra}`;
    suffix += 1;
  }
  return candidate;
}

export async function signup() {
  throw new ApiError(403, 'Only an administrator can create accounts. Sign in with the account you were given.');
}

export async function login({ email, password }, req, res) {
  const identifier = String(email || '').trim().toLowerCase();
  const user = await User.findOne(identifier.includes('@') ? { email: identifier } : { username: identifier }).select('+passwordHash +refreshTokens');
  if (!user) throw new ApiError(401, 'Invalid email or password');
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new ApiError(423, 'Account is temporarily locked. Try again later.');
  }
  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw new ApiError(401, 'Invalid email or password');
  }
  if (!user.isActive) throw new ApiError(403, 'Account is inactive');
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  const tokens = await issueTokens(user);
  await user.save();
  setRefreshCookie(res, tokens.refreshToken);
  return { accessToken: tokens.accessToken, user: await viewUser(user) };
}

export async function refreshSession(token, res) {
  if (!token) throw new ApiError(401, 'Session expired');
  let payload;
  try {
    payload = jwt.verify(token, env.jwtRefreshSecret);
  } catch {
    throw new ApiError(401, 'Session expired');
  }
  if (payload.type !== 'refresh') throw new ApiError(401, 'Session expired');
  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || !user.isActive) throw new ApiError(401, 'Session expired');
  const tokenHash = sha256(token);
  const existing = user.refreshTokens.find((item) => item.tokenHash === tokenHash);
  if (!existing || existing.revokedAt) {
    user.refreshTokens.forEach((item) => {
      item.revokedAt = item.revokedAt || new Date();
    });
    await user.save();
    throw new ApiError(401, 'Session expired');
  }
  existing.revokedAt = new Date();
  const tokens = await issueTokens(user);
  existing.replacedBy = sha256(tokens.refreshToken);
  await user.save();
  setRefreshCookie(res, tokens.refreshToken);
  return { accessToken: tokens.accessToken, user: await viewUser(user) };
}

export async function logout(token, res) {
  if (token) {
    try {
      const payload = jwt.verify(token, env.jwtRefreshSecret);
      const user = await User.findById(payload.sub).select('+refreshTokens');
      if (user) {
        const tokenHash = sha256(token);
        const existing = user.refreshTokens.find((item) => item.tokenHash === tokenHash);
        if (existing && !existing.revokedAt) existing.revokedAt = new Date();
        await user.save();
      }
    } catch {
      // Expired cookies can still be cleared.
    }
  }
  clearRefreshCookie(res);
}

export async function changePassword(actor, { currentPassword, newPassword }, req) {
  if (actor?.role !== ROLES.ADMIN) {
    throw new ApiError(403, 'Only an administrator can change passwords');
  }
  const user = await User.findById(actor._id).select('+passwordHash +refreshTokens');
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw new ApiError(400, 'Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.refreshTokens = [];
  await user.save();
  await writeAudit({
    actor,
    action: AUDIT.PASSWORD_CHANGED,
    entityType: 'User',
    entityId: user._id,
    newValue: { passwordChanged: true },
    req,
  });
}

export { COOKIE };
