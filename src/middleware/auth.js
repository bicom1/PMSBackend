import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return next(new ApiError(401, 'Authentication required'));

  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);
    if (payload.type !== 'access' || !payload.sub) {
      return next(new ApiError(401, 'Invalid token'));
    }
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return next(new ApiError(401, 'Account is inactive'));
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return next(new ApiError(401, 'Session expired'));
    return next(new ApiError(401, 'Invalid token'));
  }
}

export const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission to perform this action'));
  }
  return next();
};
