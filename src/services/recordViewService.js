import { RecordView } from '../models/RecordView.js';
import { Submission } from '../models/Submission.js';

export async function markRecordOpened(userId, recordType, recordId) {
  if (!userId || !recordId) return;
  await RecordView.updateOne(
    { user: userId, recordType, record: recordId },
    { $set: { openedAt: new Date() } },
    { upsert: true },
  );
}

export async function openedIdSet(userId, recordType, ids) {
  if (!ids.length) return new Set();
  const opened = await RecordView.find({
    user: userId,
    recordType,
    record: { $in: ids },
  }).select('record').lean();
  return new Set(opened.map((item) => String(item.record)));
}

export function applyUnread(items, opened, idField = 'id') {
  return items.map((item) => ({
    ...item,
    unread: !opened.has(String(item[idField])),
  }));
}

export async function listUnreadSubmissions(actor) {
  const openedIds = await RecordView.find({ user: actor._id, recordType: 'SUBMISSION' }).distinct('record');
  const filter = { isDeleted: false, _id: { $nin: openedIds } };
  const [items, unread] = await Promise.all([
    Submission.find(filter).sort({ createdAt: -1 }).limit(20).select('patientCode patientName departmentCode createdAt').lean(),
    Submission.countDocuments(filter),
  ]);
  return {
    unread,
    items: items.map((item) => ({
      id: item._id,
      submissionId: item._id,
      patientCode: item.patientCode,
      patientName: item.patientName,
      departmentCode: item.departmentCode,
      title: 'Unread record',
      message: `${item.patientName} (${item.patientCode}) has not been opened.`,
      readAt: null,
      createdAt: item.createdAt,
    })),
  };
}
