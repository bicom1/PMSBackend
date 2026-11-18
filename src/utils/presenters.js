import { decryptString } from './crypto.js';
import { formatCnic, maskCnicLast4 } from './cnic.js';
import { maskPhone } from './phone.js';
import { calculateAge } from './dates.js';

export function presentUser(user, departments = []) {
  return {
    id: user._id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    departments: departments.map((department) => ({
      id: department._id || department.id,
      name: department.name,
      code: department.code,
    })),
    phone: user.phone || '',
    email: user.email || '',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function presentPatient(patient, { includeCnic = false } = {}) {
  if (!patient) return null;
  let cnic;
  if (includeCnic && patient.cnicEncrypted) {
    cnic = formatCnic(decryptString(patient.cnicEncrypted));
  }
  return {
    id: patient._id,
    patientCode: patient.patientCode,
    department: patient.department,
    departmentCode: patient.departmentCode,
    identity: patient.identity || null,
    fullName: patient.fullName,
    contactNumber: patient.contactNumber,
    phoneMasked: maskPhone(patient.normalizedPhone),
    cnic,
    cnicMasked: maskCnicLast4(patient.cnicLast4),
    dateOfBirth: patient.dateOfBirth,
    age: calculateAge(patient.dateOfBirth),
    gender: patient.gender,
    nationality: patient.nationality,
    occupation: patient.occupation,
    occupationOther: patient.occupationOther || '',
    city: patient.city,
    address: patient.address,
    isDeleted: patient.isDeleted,
    mergedInto: patient.mergedInto || null,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
}

export function presentSubmission(submission) {
  return {
    id: submission._id,
    patientId: submission.patient,
    patientCode: submission.patientCode,
    patientName: submission.patientName,
    phoneNumber: submission.contactNumber || submission.normalizedPhone,
    departmentId: submission.department,
    department: submission.departmentCode,
    procedureId: submission.procedure,
    procedure: submission.procedureName,
    doctorId: submission.doctor,
    doctorName: submission.doctorName,
    formDate: submission.formDate,
    submissionDate: submission.createdAt,
    weightKg: submission.weightKg,
    heightCm: submission.heightCm,
    ageAtSubmission: submission.ageAtSubmission,
    referredBy: submission.referredBy,
    referredByLabel: submission.referredByLabel,
    referredByOther: submission.referredByOther || '',
    bookingStatus: submission.bookingStatus,
    bookedAt: submission.bookedAt,
    bookingHistory: submission.bookingHistory || [],
    doctorHistory: submission.doctorHistory || [],
    operationalRemark: submission.operationalRemark || '',
    operationalRemarkHistory: submission.operationalRemarkHistory || [],
    consultationStatus: submission.consultationStatus,
    consultationCompletedAt: submission.consultationCompletedAt,
    policyAcknowledgement: submission.policyAcknowledgement,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}
