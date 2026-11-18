import { AuditLog } from '../models/AuditLog.js';
import { sanitizeForAudit } from '../utils/sanitize.js';
import { mongoOpts } from '../utils/transaction.js';
import { parsePaging, pageMeta } from '../utils/http.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../constants/index.js';

export async function writeAudit(entry, session = null) {
  const doc = {
    userId: entry.actor?._id || entry.actor?.id || null,
    userName: entry.actor?.fullName || 'System',
    userRole: entry.actor?.role || 'SYSTEM',
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ? String(entry.entityId) : '',
    previousValue: sanitizeForAudit(entry.previousValue),
    newValue: sanitizeForAudit(entry.newValue),
    ip: entry.req?.ip || '',
    userAgent: String(entry.req?.get?.('user-agent') || '').slice(0, 300),
    requestId: entry.req?.requestId || '',
  };
  if (session) {
    await AuditLog.create([doc], mongoOpts(session));
  } else {
    await AuditLog.create(doc);
  }
}

export async function listAuditLogs(query, actor) {
  if (actor.role !== ROLES.ADMIN) throw new ApiError(403, 'You do not have permission to view audit logs');
  const { page, limit, skip } = parsePaging(query, 20);
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.userId) filter.userId = query.userId;
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
    if (query.dateTo) filter.createdAt.$lte = new Date(`${query.dateTo}T23:59:59.999Z`);
  }
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(total, page, limit) };
}
