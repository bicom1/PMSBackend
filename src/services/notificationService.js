import { Notification } from '../models/Notification.js';
import { Submission } from '../models/Submission.js';
import { mongoOpts } from '../utils/transaction.js';
function present(notification) {
  return {
    id: notification._id,
    submissionId: notification.submission,
    patientCode: notification.patientCode,
    patientName: notification.patientName,
    departmentCode: notification.departmentCode,
    title: notification.title,
    message: notification.message,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

export async function notifyDoctorOfPatient({ doctor, submission, assignedBy, reason = 'booked' }, session) {
  const department = submission.departmentCode === 'SKIN' ? 'Skin' : 'Surgery';
  const title = reason === 'reassigned'
    ? 'Patient reassigned to you'
    : reason === 'assigned'
      ? 'New patient assigned to you'
      : 'Patient booked';
  const message = reason === 'reassigned'
    ? `${submission.patientName} (${submission.patientCode}) was reassigned to you in ${department}${assignedBy ? ` by ${assignedBy}` : ''}.`
    : reason === 'assigned'
      ? `${submission.patientName} (${submission.patientCode}) was registered in ${department} and assigned to you${assignedBy ? ` by ${assignedBy}` : ''}.`
      : `${submission.patientName} (${submission.patientCode}) is booked in ${department} and is now in your patients${assignedBy ? ` (${assignedBy})` : ''}.`;
  await Notification.create([{
    recipient: doctor._id,
    submission: submission._id,
    patientCode: submission.patientCode,
    patientName: submission.patientName,
    departmentCode: submission.departmentCode,
    title,
    message,
    readAt: null,
  }], mongoOpts(session));
}

async function syncAssignedPatients(actor) {
  const departmentIds = actor.departments || [];
  if (!departmentIds.length) return;
  const submissions = await Submission.find({
    isDeleted: false,
    doctor: actor._id,
    department: { $in: departmentIds },
  }).select('patientCode patientName departmentCode').sort({ createdAt: -1 }).limit(100).lean();
  if (!submissions.length) return;
  const existing = await Notification.find({
    recipient: actor._id,
    submission: { $in: submissions.map((item) => item._id) },
  }).distinct('submission');
  const known = new Set(existing.map(String));
  const missing = submissions.filter((item) => !known.has(String(item._id)));
  if (!missing.length) return;
  await Notification.insertMany(missing.map((item) => ({
    recipient: actor._id,
    submission: item._id,
    patientCode: item.patientCode,
    patientName: item.patientName,
    departmentCode: item.departmentCode,
    title: 'Patient assigned to you',
    message: `${item.patientName} (${item.patientCode}) is assigned to you in ${item.departmentCode === 'SKIN' ? 'Skin' : 'Surgery'}.`,
    readAt: null,
  })));
}

export async function listNotifications(actor) {
  await syncAssignedPatients(actor);
  const items = await Notification.find({ recipient: actor._id }).sort({ createdAt: -1 }).limit(50).lean();
  const assignedIds = await Submission.find({
    _id: { $in: items.map((item) => item.submission) },
    isDeleted: false,
    doctor: actor._id,
  }).distinct('_id');
  const visibleIds = new Set(assignedIds.map(String));
  const visible = items.filter((item) => visibleIds.has(String(item.submission))).slice(0, 30);
  return {
    items: visible.map(present),
    unread: visible.filter((item) => !item.readAt).length,
  };
}

export async function markSubmissionNotificationsRead(actor, submissionId) {
  await Notification.updateMany(
    { recipient: actor._id, submission: submissionId, readAt: null },
    { readAt: new Date() },
  );
}

export async function markNotificationsRead(actor, { ids = [], all = false } = {}) {
  const filter = { recipient: actor._id, readAt: null };
  if (!all) filter._id = { $in: ids };
  if (!all && !ids.length) return listNotifications(actor);
  await Notification.updateMany(filter, { readAt: new Date() });
  return listNotifications(actor);
}
