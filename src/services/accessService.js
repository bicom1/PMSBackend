import { Submission } from '../models/Submission.js';
import { ApiError } from '../utils/ApiError.js';
import { ROLES } from '../constants/index.js';

export function doctorOwnsSubmission(actor, submission) {
  const inDepartment = (actor.departments || []).some((id) => String(id) === String(submission.department));
  return String(submission.doctor) === String(actor._id) && inDepartment;
}

export async function doctorCanAccessSubmission(actor, submission) {
  return doctorOwnsSubmission(actor, submission);
}

export async function getSubmissionForActor(actor, submissionId) {
  const submission = await Submission.findOne({ _id: submissionId, isDeleted: false });
  if (!submission) throw new ApiError(404, 'Submission not found');
  if (actor.role === ROLES.ADMIN || actor.role === ROLES.CLINIC_MANAGER) return submission;
  if (actor.role === ROLES.DOCTOR && await doctorCanAccessSubmission(actor, submission)) return submission;
  throw new ApiError(403, 'You cannot access this patient record');
}

export function assertAssignedDoctor(actor, submission) {
  if (actor.role !== ROLES.DOCTOR) {
    throw new ApiError(403, 'Only the assigned doctor can update clinical records');
  }
  if (!submission.doctor || String(submission.doctor) !== String(actor._id)) {
    throw new ApiError(403, 'Only the assigned doctor can update clinical records');
  }
}

export async function assertCanAccessPatient(actor, patient) {
  if (!patient || patient.isDeleted) throw new ApiError(404, 'Patient not found');
  if (actor.role === ROLES.ADMIN || actor.role === ROLES.CLINIC_MANAGER) return patient;
  if (actor.role === ROLES.DOCTOR) {
    const own = await Submission.exists({
      patient: patient._id,
      doctor: actor._id,
      department: { $in: actor.departments || [] },
      isDeleted: false,
    });
    if (own) return patient;
  }
  throw new ApiError(403, 'You cannot access this patient record');
}
