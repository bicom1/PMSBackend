import { DoctorRemark } from '../models/DoctorRemark.js';
import { escapeRegex } from '../utils/strings.js';
import { normalizePhone } from '../utils/phone.js';
import { ROLES } from '../constants/index.js';

export async function buildSubmissionFilter(query, actor) {
  const filter = { isDeleted: false };
  if (query.departmentCode) filter.departmentCode = query.departmentCode;
  if (query.procedureId) filter.procedure = query.procedureId;
  if (query.doctorId) filter.doctor = query.doctorId;
  if (query.bookingStatus) filter.bookingStatus = query.bookingStatus;
  if (query.referredBy) filter.referredBy = query.referredBy;
  if (query.patientCode) filter.patientCode = new RegExp(escapeRegex(query.patientCode.trim()), 'i');
  if (query.phone) {
    const phone = normalizePhone(query.phone);
    if (phone) filter.normalizedPhone = phone;
  }
  if (query.patientName) filter.patientName = new RegExp(escapeRegex(query.patientName.trim()), 'i');
  if (query.date) filter.formDate = query.date;
  else if (query.dateFrom || query.dateTo) {
    filter.formDate = {};
    if (query.dateFrom) filter.formDate.$gte = query.dateFrom;
    if (query.dateTo) filter.formDate.$lte = query.dateTo;
  }
  if (query.consultationStatus) filter.consultationStatus = query.consultationStatus;
  if (query.search) {
    const term = query.search.trim();
    const phone = normalizePhone(term);
    const or = [
      { patientName: new RegExp(escapeRegex(term), 'i') },
      { patientCode: new RegExp(escapeRegex(term), 'i') },
    ];
    if (phone.length >= 4) or.push({ normalizedPhone: phone });
    filter.$or = or;
  }
  if (query.remarkCategory && actor?.role === ROLES.ADMIN) {
    const ids = await DoctorRemark.find({ categories: query.remarkCategory, isDeleted: false }).distinct('submission');
    filter._id = { $in: ids };
  }
  return filter;
}
