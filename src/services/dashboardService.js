import { Patient } from '../models/Patient.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import { clinicToday } from '../utils/dates.js';
import { presentSubmission } from '../utils/presenters.js';
import { getAnalytics } from './reportService.js';
import { ApiError } from '../utils/ApiError.js';
import { BOOKING_STATUS, CONSULTATION_STATUS, ROLES } from '../constants/index.js';
import { listNotifications } from './notificationService.js';
import { applyUnread, openedIdSet } from './recordViewService.js';

async function recentWithUnread(recent, actor) {
  const presented = recent.map(presentSubmission);
  const opened = await openedIdSet(actor._id, 'SUBMISSION', presented.map((item) => item.id));
  return applyUnread(presented, opened);
}

async function departmentBreakdown() {
  const [patients, submissions] = await Promise.all([
    Patient.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$departmentCode', count: { $sum: 1 } } }]),
    Submission.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: { department: '$departmentCode', status: '$bookingStatus' }, count: { $sum: 1 } } }]),
  ]);
  return ['SKIN', 'SURGERY'].map((code) => ({
    department: code,
    patients: patients.find((item) => item._id === code)?.count || 0,
    booked: submissions.find((item) => item._id.department === code && item._id.status === 'BOOKED')?.count || 0,
    notBooked: submissions.find((item) => item._id.department === code && item._id.status === 'NOT_BOOKED')?.count || 0,
  }));
}

export async function managerDashboard(actor) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to view this dashboard');
  }
  const today = clinicToday();
  const [totalPatients, totalSubmissions, booked, notBooked, todayRegistrations, recent, departmentStats, analytics] = await Promise.all([
    Patient.countDocuments({ isDeleted: false }),
    Submission.countDocuments({ isDeleted: false }),
    Submission.countDocuments({ isDeleted: false, bookingStatus: BOOKING_STATUS.BOOKED }),
    Submission.countDocuments({ isDeleted: false, bookingStatus: BOOKING_STATUS.NOT_BOOKED }),
    Submission.countDocuments({ isDeleted: false, formDate: today }),
    Submission.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(8).lean(),
    departmentBreakdown(),
    getAnalytics({}, actor),
  ]);
  return {
    totalPatients,
    totalSubmissions,
    booked,
    notBooked,
    todayRegistrations,
    recent: await recentWithUnread(recent, actor),
    departmentStats,
    analytics,
  };
}

export async function doctorDashboard(actor) {
  if (actor.role !== ROLES.DOCTOR) throw new ApiError(403, 'You do not have permission to view this dashboard');
  const today = clinicToday();
  const base = { isDeleted: false, doctor: actor._id, department: { $in: actor.departments || [] } };
  const [myPatients, totalBooked, todaysPatients, pendingConsultations, completedConsultations, recent, notices] = await Promise.all([
    Submission.countDocuments(base),
    Submission.countDocuments({ ...base, bookingStatus: BOOKING_STATUS.BOOKED }),
    Submission.countDocuments({ ...base, formDate: today }),
    Submission.countDocuments({ ...base, consultationStatus: CONSULTATION_STATUS.PENDING }),
    Submission.countDocuments({ ...base, consultationStatus: CONSULTATION_STATUS.COMPLETED }),
    Submission.find(base).sort({ createdAt: -1 }).limit(8).lean(),
    listNotifications(actor),
  ]);
  return {
    myPatients,
    totalBooked,
    todaysPatients,
    pendingConsultations,
    completedConsultations,
    unreadNotifications: notices.unread,
    recent: await recentWithUnread(recent, actor),
  };
}

export async function adminDashboard(actor) {
  if (actor.role !== ROLES.ADMIN) throw new ApiError(403, 'You do not have permission to view this dashboard');
  const [base, users, doctors, managers] = await Promise.all([
    managerDashboard(actor),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: ROLES.DOCTOR, isActive: true }),
    User.countDocuments({ role: ROLES.CLINIC_MANAGER, isActive: true }),
  ]);
  return { ...base, activeUsers: users, doctors, managers };
}
