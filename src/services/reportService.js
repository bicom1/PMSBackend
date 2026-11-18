import ExcelJS from 'exceljs';
import { Submission } from '../models/Submission.js';
import { Patient } from '../models/Patient.js';
import { Prescription } from '../models/Prescription.js';
import { PrescriptionVersion } from '../models/PrescriptionVersion.js';
import { DoctorRemark } from '../models/DoctorRemark.js';
import { RemarkVersion } from '../models/RemarkVersion.js';
import { ApiError } from '../utils/ApiError.js';
import { decryptString } from '../utils/crypto.js';
import { formatCnic } from '../utils/cnic.js';
import { parsePaging, pageMeta, parseSort } from '../utils/http.js';
import { presentSubmission } from '../utils/presenters.js';
import { buildSubmissionFilter } from './submissionQuery.js';
import { ROLES } from '../constants/index.js';

const BASE_COLUMNS = [
  ['patientCode', 'Patient ID'],
  ['name', 'Name'],
  ['phone', 'Phone'],
  ['cnic', 'CNIC'],
  ['department', 'Department'],
  ['procedure', 'Procedure'],
  ['doctor', 'Doctor'],
  ['referredBy', 'Referred By'],
  ['submissionDate', 'Submission Date'],
  ['bookingStatus', 'Booking Status'],
  ['remarks', 'Remarks'],
];

function assertReportAccess(actor) {
  if (![ROLES.ADMIN, ROLES.CLINIC_MANAGER].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to view reports');
  }
}

async function rowsFor(docs, actor) {
  const includeClinical = actor.role === ROLES.ADMIN;
  const patientIds = [...new Set(docs.map((doc) => String(doc.patient)))];
  const patients = await Patient.find({ _id: { $in: patientIds } }).select('cnicEncrypted');
  const cnicByPatient = new Map(patients.map((patient) => {
    try {
      return [String(patient._id), formatCnic(decryptString(patient.cnicEncrypted))];
    } catch {
      return [String(patient._id), ''];
    }
  }));
  const clinical = includeClinical ? await clinicalColumns(docs.map((doc) => doc._id)) : new Map();
  return docs.map((doc) => {
    const extra = clinical.get(String(doc._id)) || { prescriptions: '', clinicalRemarks: '' };
    const referred = doc.referredByOther ? `${doc.referredByLabel} (${doc.referredByOther})` : doc.referredByLabel;
    return {
      patientCode: doc.patientCode,
      name: doc.patientName,
      phone: doc.contactNumber || doc.normalizedPhone,
      cnic: cnicByPatient.get(String(doc.patient)) || '',
      department: doc.departmentCode,
      procedure: doc.procedureName,
      doctor: doc.doctorName,
      referredBy: referred,
      submissionDate: doc.formDate,
      bookingStatus: doc.bookingStatus,
      remarks: doc.operationalRemark || '',
      ...(includeClinical ? extra : {}),
    };
  });
}

async function clinicalColumns(submissionIds) {
  const prescriptions = await Prescription.find({ submission: { $in: submissionIds }, isDeleted: false });
  const versions = await PrescriptionVersion.find({ prescription: { $in: prescriptions.map((item) => item._id) } }).sort({ versionNumber: -1 });
  const remarks = await DoctorRemark.find({ submission: { $in: submissionIds }, isDeleted: false });
  const remarkVersions = await RemarkVersion.find({ remark: { $in: remarks.map((item) => item._id) } }).sort({ versionNumber: -1 });
  const map = new Map();
  for (const id of submissionIds) {
    const ownPrescriptions = prescriptions.filter((item) => String(item.submission) === String(id));
    const text = ownPrescriptions.map((prescription) => {
      const version = versions.find((item) => String(item.prescription) === String(prescription._id));
      if (!version) return '';
      return version.medicines.map((medicine) => medicine.name).join(', ');
    }).filter(Boolean).join(' | ');
    const ownRemarks = remarks.filter((item) => String(item.submission) === String(id));
    const notes = ownRemarks.map((remark) => remarkVersions.find((item) => String(item.remark) === String(remark._id))?.notes || '').filter(Boolean).join(' | ');
    map.set(String(id), { prescriptions: text, clinicalRemarks: notes });
  }
  return map;
}

export async function listReport(query, actor) {
  assertReportAccess(actor);
  const { page, limit, skip } = parsePaging(query);
  const filter = await buildSubmissionFilter(query, actor);
  const sort = parseSort(query, ['formDate', 'createdAt', 'patientName', 'patientCode', 'bookingStatus'], 'formDate');
  const [docs, total] = await Promise.all([
    Submission.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Submission.countDocuments(filter),
  ]);
  return {
    items: docs.map(presentSubmission),
    rows: await rowsFor(docs, actor),
    meta: pageMeta(total, page, limit),
    includesClinical: actor.role === ROLES.ADMIN,
  };
}

export async function getAnalytics(query, actor) {
  assertReportAccess(actor);
  const filter = await buildSubmissionFilter(query, actor);
  const [perDay, perDoctor, perProcedure, conversion, doctorStats, departmentPatients] = await Promise.all([
    Submission.aggregate([{ $match: filter }, { $group: { _id: '$formDate', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Submission.aggregate([{ $match: filter }, { $group: { _id: '$doctorName', booked: { $sum: { $cond: [{ $eq: ['$bookingStatus', 'BOOKED'] }, 1, 0] } }, notBooked: { $sum: { $cond: [{ $eq: ['$bookingStatus', 'NOT_BOOKED'] }, 1, 0] } } } }, { $sort: { booked: -1 } }]),
    Submission.aggregate([{ $match: filter }, { $group: { _id: { department: '$departmentCode', procedure: '$procedureName' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Submission.aggregate([{ $match: filter }, { $group: { _id: '$bookingStatus', count: { $sum: 1 } } }]),
    Submission.aggregate([{ $match: filter }, { $group: { _id: '$doctorName', patients: { $sum: 1 }, booked: { $sum: { $cond: [{ $eq: ['$bookingStatus', 'BOOKED'] }, 1, 0] } }, pending: { $sum: { $cond: [{ $and: [{ $eq: ['$bookingStatus', 'BOOKED'] }, { $eq: ['$consultationStatus', 'PENDING'] }] }, 1, 0] } }, completed: { $sum: { $cond: [{ $eq: ['$consultationStatus', 'COMPLETED'] }, 1, 0] } } } }]),
    Patient.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: '$departmentCode', patients: { $sum: 1 } } }]),
  ]);
  const booked = conversion.find((item) => item._id === 'BOOKED')?.count || 0;
  const notBooked = conversion.find((item) => item._id === 'NOT_BOOKED')?.count || 0;
  const total = booked + notBooked;
  return {
    submissionsPerDay: perDay.map((item) => ({ date: item._id, count: item.count })),
    bookingsPerDoctor: perDoctor.map((item) => ({ doctor: item._id, booked: item.booked, notBooked: item.notBooked })),
    proceduresPerDepartment: perProcedure.map((item) => ({ department: item._id.department, procedure: item._id.procedure, count: item.count })),
    conversion: { booked, notBooked, rate: total ? Math.round((booked / total) * 1000) / 10 : 0 },
    departmentPatients: departmentPatients.map((item) => ({ department: item._id, patients: item.patients })),
    doctorStats: doctorStats.map((item) => ({ doctor: item._id, patients: item.patients, booked: item.booked, pending: item.pending, completed: item.completed })),
  };
}

function columnsFor(actor) {
  const columns = [...BASE_COLUMNS];
  if (actor.role === ROLES.ADMIN) {
    columns.push(['prescriptions', 'Prescriptions'], ['clinicalRemarks', 'Clinical Remarks']);
  }
  return columns;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function exportReport(query, actor, format) {
  assertReportAccess(actor);
  const filter = await buildSubmissionFilter(query, actor);
  const total = await Submission.countDocuments(filter);
  if (total > 10000) throw new ApiError(400, 'Export is limited to 10000 rows. Narrow the filters.');
  const docs = await Submission.find(filter).sort({ formDate: -1, createdAt: -1 }).lean();
  const rows = await rowsFor(docs, actor);
  const columns = columnsFor(actor);
  if (format === 'csv') {
    const header = columns.map((column) => csvEscape(column[1])).join(',');
    const body = rows.map((row) => columns.map((column) => csvEscape(row[column[0]])).join(',')).join('\n');
    return {
      body: `\uFEFF${header}\n${body}`,
      contentType: 'text/csv; charset=utf-8',
      filename: 'cpms-report.csv',
    };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Submissions');
  sheet.columns = columns.map((column) => ({ header: column[1], key: column[0], width: 24 }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    body: Buffer.from(buffer),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'cpms-report.xlsx',
  };
}
