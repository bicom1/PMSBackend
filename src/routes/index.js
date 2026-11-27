import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadPdfs, uploadVoiceAudio } from '../middleware/upload.js';
import { ROLES } from '../constants/index.js';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import * as catalog from '../controllers/catalogController.js';
import * as formFields from '../controllers/formFieldController.js';
import * as patients from '../controllers/patientController.js';
import * as submissions from '../controllers/submissionController.js';
import * as voice from '../controllers/voiceController.js';
import * as reports from '../controllers/reportController.js';
import * as schemas from '../validators/schemas.js';

const staff = [ROLES.ADMIN, ROLES.CLINIC_MANAGER];
const clinicalReaders = [ROLES.ADMIN, ROLES.DOCTOR];

export function registerRoutes(app) {
  app.get('/', (_req, res) => {
    res.json({ success: true, data: { name: 'Clinic Patient Management System API' } });
  });

  app.get('/api/health', (_req, res) => {
    const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
    res.status(db === 'up' ? 200 : 503).json({
      success: db === 'up',
      data: { service: 'cpms-api', database: db, time: new Date().toISOString() },
    });
  });

  app.get('/api/branding', catalog.branding);

  const authRouter = Router();
  authRouter.get('/setup', auth.setup);
  authRouter.post('/signup', validate(schemas.signupSchema), auth.signup);
  authRouter.post('/login', validate(schemas.loginSchema), auth.login);
  authRouter.post('/refresh', auth.refresh);
  authRouter.post('/logout', auth.logout);
  authRouter.get('/me', requireAuth, auth.me);
  authRouter.post('/change-password', requireAuth, validate(schemas.changePasswordSchema), auth.changePassword);
  app.use('/api/auth', authRouter);

  app.get('/api/directory/doctors', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.userListSchema), users.doctors);

  const userRouter = Router();
  userRouter.use(requireAuth, authorize(ROLES.ADMIN));
  userRouter.get('/', validate(schemas.userListSchema), users.list);
  userRouter.post('/', validate(schemas.userCreateSchema), users.create);
  userRouter.patch('/:id', validate(schemas.userUpdateSchema), users.update);
  userRouter.post('/:id/reset-password', validate(schemas.resetPasswordSchema), users.resetPassword);
  app.use('/api/users', userRouter);

  const catalogRouter = Router();
  catalogRouter.get('/departments', requireAuth, validate(schemas.catalogListSchema), catalog.departments);
  catalogRouter.patch('/departments/:id', requireAuth, authorize(ROLES.ADMIN), validate(schemas.departmentUpdateSchema), catalog.updateDepartment);
  catalogRouter.get('/procedures', requireAuth, validate(schemas.catalogListSchema), catalog.procedures);
  catalogRouter.post('/procedures', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.procedureCreateSchema), catalog.createProcedure);
  catalogRouter.patch('/procedures/:id', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.procedureUpdateSchema), catalog.updateProcedure);
  catalogRouter.get('/master-data/types', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), catalog.masterTypes);
  catalogRouter.get('/master-data', requireAuth, validate(schemas.catalogListSchema), catalog.masterData);
  catalogRouter.post('/master-data', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.masterCreateSchema), catalog.createMaster);
  catalogRouter.patch('/master-data/:id', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.masterUpdateSchema), catalog.updateMaster);
  catalogRouter.delete('/master-data/:id', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.masterDeleteSchema), catalog.deleteMaster);
  catalogRouter.get('/form-fields', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER, ROLES.DOCTOR), validate(schemas.formFieldListSchema), formFields.list);
  catalogRouter.post('/form-fields', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.formFieldCreateSchema), formFields.create);
  catalogRouter.patch('/form-fields/:id', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.formFieldUpdateSchema), formFields.update);
  catalogRouter.delete('/form-fields/:id', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.formFieldDeleteSchema), formFields.remove);
  catalogRouter.get('/policy/current', requireAuth, catalog.currentPolicy);
  catalogRouter.get('/policy/versions', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), catalog.policyVersions);
  catalogRouter.post('/policy/versions', requireAuth, authorize(ROLES.ADMIN, ROLES.CLINIC_MANAGER), validate(schemas.policySchema), catalog.publishPolicy);
  catalogRouter.get('/settings', requireAuth, authorize(ROLES.ADMIN), catalog.settings);
  catalogRouter.patch('/settings', requireAuth, authorize(ROLES.ADMIN), validate(schemas.settingsSchema), catalog.updateSettings);
  app.use('/api', catalogRouter);

  const patientRouter = Router();
  patientRouter.use(requireAuth);
  patientRouter.post('/identify', authorize(...staff), validate(schemas.identifySchema), patients.identify);
  patientRouter.get('/', validate(schemas.patientListSchema), patients.list);
  patientRouter.post('/link', authorize(...staff), validate(schemas.linkSchema), patients.link);
  patientRouter.post('/merge', authorize(ROLES.ADMIN), validate(schemas.mergeSchema), patients.merge);
  patientRouter.get('/:id/history.pdf', authorize(...staff), validate(schemas.idSchema), patients.historyPdf);
  patientRouter.get('/:id/documents', validate(schemas.idSchema), patients.documentsForPatient);
  patientRouter.get('/:id', validate(schemas.idSchema), patients.getOne);
  patientRouter.patch('/:id', authorize(ROLES.ADMIN), validate(schemas.correctPatientSchema), patients.correct);
  app.use('/api/patients', patientRouter);

  const submissionRouter = Router();
  submissionRouter.use(requireAuth);
  submissionRouter.post('/', authorize(...staff), validate(schemas.submissionSchema), submissions.create);
  submissionRouter.get('/', validate(schemas.submissionListSchema), submissions.list);
  submissionRouter.get('/:id/history.pdf', authorize(...staff), validate(schemas.idSchema), submissions.historyPdf);
  submissionRouter.get('/:id', validate(schemas.idSchema), submissions.detail);
  submissionRouter.patch('/:id/booking', authorize(...staff), validate(schemas.bookingSchema), submissions.booking);
  submissionRouter.patch('/:id/doctor', authorize(...staff), validate(schemas.reassignSchema), submissions.reassign);
  submissionRouter.patch('/:id/operational-remark', authorize(...staff), validate(schemas.remarkTextSchema), submissions.operationalRemark);
  submissionRouter.post('/:id/documents', authorize(...staff), validate(schemas.idSchema), uploadPdfs, submissions.upload);
  submissionRouter.post('/:id/prescriptions', authorize(ROLES.DOCTOR), validate(schemas.prescriptionSchema), submissions.createPrescription);
  submissionRouter.post('/:id/remarks', authorize(ROLES.DOCTOR), validate(schemas.clinicalRemarkSchema), submissions.createRemark);
  submissionRouter.get('/:id/voice-recordings', authorize(...clinicalReaders), validate(schemas.idSchema), voice.listForSubmission);
  submissionRouter.post('/:id/voice-recordings', authorize(ROLES.DOCTOR), validate(schemas.voiceCreateSchema), voice.create);
  app.use('/api/submissions', submissionRouter);

  const doctorRouter = Router();
  doctorRouter.use(requireAuth, authorize(ROLES.DOCTOR));
  doctorRouter.get('/dashboard', submissions.doctorHome);
  doctorRouter.get('/notifications', submissions.notificationsList);
  doctorRouter.post('/notifications/read', validate(schemas.notificationReadSchema), submissions.notificationsRead);
  doctorRouter.get('/patients', validate(schemas.submissionListSchema), submissions.myPatients);
  doctorRouter.get('/patients/:id', validate(schemas.idSchema), submissions.detail);
  doctorRouter.patch('/patients/:id/consultation', validate(schemas.consultationSchema), submissions.consultation);
  doctorRouter.post('/voice/realtime-session', voice.realtimeSession);
  app.use('/api/doctor', doctorRouter);

  app.get('/api/inbox', requireAuth, authorize(...staff), submissions.inbox);
  app.get('/api/manager/dashboard', requireAuth, authorize(...staff), submissions.managerHome);
  app.get('/api/admin/dashboard', requireAuth, authorize(ROLES.ADMIN), submissions.adminHome);

  app.post('/api/prescriptions/:id/versions', requireAuth, authorize(ROLES.DOCTOR), validate(schemas.prescriptionSchema), submissions.versionPrescription);
  app.get('/api/prescriptions/:id/pdf', requireAuth, authorize(...clinicalReaders), validate(schemas.idSchema), submissions.prescriptionPdf);
  app.post('/api/remarks/:id/versions', requireAuth, authorize(ROLES.DOCTOR), validate(schemas.clinicalRemarkSchema), submissions.versionRemark);

  app.patch('/api/voice-recordings/:id', requireAuth, authorize(ROLES.DOCTOR), validate(schemas.voiceUpdateSchema), voice.update);
  app.post('/api/voice-recordings/:id/audio', requireAuth, authorize(ROLES.DOCTOR), validate(schemas.idSchema), uploadVoiceAudio, voice.uploadAudio);
  app.get('/api/voice-recordings/:id/audio', requireAuth, authorize(...clinicalReaders), validate(schemas.idSchema), voice.playAudio);

  app.get('/api/documents/:id/view', requireAuth, validate(schemas.idSchema), submissions.viewDocument);
  app.get('/api/documents/:id/download', requireAuth, validate(schemas.idSchema), submissions.downloadDocument);
  app.delete('/api/documents/:id', requireAuth, authorize(...staff), validate(schemas.deleteDocumentSchema), submissions.removeDocument);

  const reportRouter = Router();
  reportRouter.use(requireAuth, authorize(...staff));
  reportRouter.get('/', validate(schemas.submissionListSchema), reports.list);
  reportRouter.get('/analytics', validate(schemas.submissionListSchema), reports.analytics);
  reportRouter.get('/export.csv', validate(schemas.submissionListSchema), reports.exportCsv);
  reportRouter.get('/export.xlsx', validate(schemas.submissionListSchema), reports.exportXlsx);
  app.use('/api/reports', reportRouter);

  const auditRouter = Router();
  auditRouter.use(requireAuth, authorize(ROLES.ADMIN));
  auditRouter.get('/', validate(schemas.submissionListSchema), reports.audit);
  auditRouter.patch('/:id', reports.rejectAuditChange);
  auditRouter.delete('/:id', reports.rejectAuditChange);
  app.use('/api/audit-logs', auditRouter);
}
