import { ROLES } from '../constants/index.js';

export const PERMISSIONS = {
  [ROLES.CLINIC_MANAGER]: {
    createIntake: true,
    viewSubmissions: true,
    manageBooking: true,
    operationalRemarks: true,
    uploadDocuments: true,
    viewDocuments: true,
    viewClinical: false,
    writeClinical: false,
    manageUsers: false,
    manageMasterData: false,
    viewAudit: false,
    reports: true,
    exportClinical: false,
  },
  [ROLES.DOCTOR]: {
    createIntake: false,
    viewSubmissions: false,
    manageBooking: false,
    operationalRemarks: false,
    uploadDocuments: false,
    viewDocuments: true,
    viewClinical: true,
    writeClinical: true,
    manageUsers: false,
    manageMasterData: false,
    viewAudit: false,
    reports: false,
    exportClinical: false,
  },
  [ROLES.ADMIN]: {
    createIntake: true,
    viewSubmissions: true,
    manageBooking: true,
    operationalRemarks: true,
    uploadDocuments: true,
    viewDocuments: true,
    viewClinical: true,
    writeClinical: false,
    manageUsers: true,
    manageMasterData: true,
    viewAudit: true,
    reports: true,
    exportClinical: true,
  },
};

export function can(role, permission) {
  return Boolean(PERMISSIONS[role]?.[permission]);
}
