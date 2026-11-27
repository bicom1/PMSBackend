import { z } from 'zod';
import { GENDERS, MASTER_TYPE_KEYS } from '../constants/index.js';
import { objectId, paging, passwordSchema, requestSchema } from './common.js';

const empty = z.object({}).strip();

const contactNumberSchema = z.string().trim().min(7).max(20).regex(/^[0-9+\-\s()]+$/, 'Enter a valid contact number');

export const loginSchema = requestSchema({
  body: z.object({
    email: z.string().trim().min(3).max(120),
    password: z.string().min(8).max(64),
  }).strict(),
});

export const signupSchema = requestSchema({
  body: z.object({
    fullName: z.string().trim().min(2).max(120),
    phone: contactNumberSchema,
    email: z.string().trim().email('Enter a valid email').max(120),
    password: passwordSchema,
  }).strict(),
});

export const changePasswordSchema = requestSchema({
  body: z.object({
    currentPassword: z.string().min(8).max(64),
    newPassword: passwordSchema,
  }).strict(),
});

export const userCreateSchema = requestSchema({
  body: z.object({
    username: z.string().trim().regex(/^[a-zA-Z0-9._]{3,30}$/, 'Username must be 3-30 characters').optional(),
    password: passwordSchema,
    fullName: z.string().trim().min(2).max(120),
    role: z.enum(['ADMIN', 'CLINIC_MANAGER', 'DOCTOR']),
    departments: z.array(objectId).max(2).optional(),
    phone: contactNumberSchema.optional(),
    email: z.string().trim().email('Enter a valid email').max(120).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const userUpdateSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    fullName: z.string().trim().min(2).max(120).optional(),
    role: z.enum(['ADMIN', 'CLINIC_MANAGER', 'DOCTOR']).optional(),
    departments: z.array(objectId).max(2).optional(),
    phone: z.string().max(30).optional(),
    email: z.string().email().optional().or(z.literal('')),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const resetPasswordSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({ password: passwordSchema }).strict(),
});

export const userListSchema = requestSchema({
  query: z.object({
    ...paging,
    role: z.enum(['ADMIN', 'CLINIC_MANAGER', 'DOCTOR']).optional(),
    active: z.enum(['true', 'false']).optional(),
    departmentId: objectId.optional(),
    departmentCode: z.enum(['SKIN', 'SURGERY']).optional(),
  }).strip(),
});

export const departmentUpdateSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().max(400).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const procedureCreateSchema = requestSchema({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    departmentId: objectId,
    description: z.string().max(400).optional(),
  }).strict(),
});

export const procedureUpdateSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().max(400).optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const masterCreateSchema = requestSchema({
  body: z.object({
    type: z.enum(MASTER_TYPE_KEYS),
    label: z.string().trim().min(1).max(120),
    value: z.string().trim().max(80).optional(),
    departmentCode: z.enum(['SKIN', 'SURGERY']).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    allowOther: z.boolean().optional(),
    metadata: z.object({
      inputType: z.enum(['text', 'textarea', 'number', 'date', 'select']).optional(),
      required: z.boolean().optional(),
      options: z.array(z.string().max(80)).max(50).optional(),
      placeholder: z.string().max(160).optional(),
      pendingConfirmation: z.boolean().optional(),
    }).strict().optional(),
  }).strict(),
});

export const masterUpdateSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    label: z.string().trim().min(1).max(120).optional(),
    value: z.string().trim().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    allowOther: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
  }).strict(),
});

export const masterDeleteSchema = requestSchema({
  params: z.object({ id: objectId }),
});

export const policySchema = requestSchema({
  body: z.object({
    departmentCode: z.enum(['SKIN', 'SURGERY']),
    title: z.string().trim().min(2).max(120).optional(),
    items: z.array(z.string().trim().min(3).max(400)).min(1).max(20),
  }).strict(),
});

export const settingsSchema = requestSchema({
  body: z.object({
    clinicName: z.string().trim().min(2).max(120).optional(),
    phone: z.string().max(40).optional(),
    address: z.string().max(240).optional(),
    skinFormConfirmed: z.boolean().optional(),
    surgeryOptionsConfirmed: z.boolean().optional(),
  }).strict(),
});

const patientBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  contactNumber: z.string().trim().min(7).max(24),
  cnic: z.string().trim().min(6).max(24),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  gender: z.enum(GENDERS).optional().or(z.literal('')),
  nationality: z.string().trim().max(80).optional().or(z.literal('')),
  occupation: z.string().trim().max(80).optional().or(z.literal('')),
  occupationOther: z.string().max(80).optional(),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  address: z.string().trim().max(240).optional().or(z.literal('')),
});

const visitBody = z.object({
  weightKg: z.number().gt(0).max(400).nullable().optional(),
  heightCm: z.number().gt(36).max(96).nullable().optional(),
  referredBy: z.string().trim().max(80).optional().or(z.literal('')),
  referredByOther: z.string().max(120).optional(),
  doctorId: objectId.optional().or(z.literal('')).or(z.null()),
  procedureId: objectId.optional().or(z.literal('')).or(z.null()),
  formDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

export const formFieldListSchema = requestSchema({
  query: z.object({
    departmentCode: z.enum(['SKIN', 'SURGERY']).optional(),
    active: z.enum(['true', 'false']).optional(),
  }).strip(),
});

export const formFieldCreateSchema = requestSchema({
  body: z.object({
    departmentCode: z.enum(['SKIN', 'SURGERY']),
    label: z.string().trim().min(1).max(120),
    key: z.string().trim().max(80).optional(),
    section: z.enum(['identification', 'personal', 'visit', 'details']).optional(),
    fieldType: z.enum(['text', 'tel', 'date', 'number', 'textarea', 'select', 'doctor', 'procedure', 'age']).optional(),
    optionsSource: z.string().max(40).optional(),
    required: z.boolean().optional(),
    allowCustom: z.boolean().optional(),
    unit: z.string().max(20).optional(),
    placeholder: z.string().max(120).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
  }).strict(),
});

export const formFieldUpdateSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    label: z.string().trim().min(1).max(120).optional(),
    section: z.enum(['identification', 'personal', 'visit', 'details']).optional(),
    fieldType: z.enum(['text', 'tel', 'date', 'number', 'textarea', 'select', 'doctor', 'procedure', 'age']).optional(),
    optionsSource: z.string().max(40).optional(),
    required: z.boolean().optional(),
    allowCustom: z.boolean().optional(),
    unit: z.string().max(20).optional(),
    placeholder: z.string().max(120).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
  }).strict(),
});

export const formFieldDeleteSchema = requestSchema({
  params: z.object({ id: objectId }),
});

export const identifySchema = requestSchema({
  body: z.object({
    departmentCode: z.enum(['SKIN', 'SURGERY']),
    fullName: z.string().trim().min(2).max(120),
    contactNumber: z.string().trim().min(7).max(24),
    cnic: z.string().trim().min(6).max(24),
  }).strict(),
});

export const submissionSchema = requestSchema({
  body: z.object({
    departmentCode: z.enum(['SKIN', 'SURGERY']),
    mode: z.enum(['new', 'attach']),
    existingPatientId: objectId.optional(),
    acknowledgePhoneConflict: z.boolean().optional(),
    confirmIdentityLink: z.boolean().optional(),
    acceptPhoneUpdate: z.boolean().optional(),
    correction: z.object({ reason: z.string().max(400) }).strict().optional(),
    patient: patientBody,
    visit: visitBody,
    skinDetails: z.object({
      fields: z.array(z.object({ key: z.string().min(1).max(80), value: z.string().max(2000) }).strict()).max(50),
    }).strict().optional(),
    surgeryDetails: z.object({
      anesthesiaType: z.string().max(80).optional(),
      diet: z.string().max(80).optional(),
      bloodTestStatus: z.string().max(80).optional(),
      surgeryCost: z.number().min(0).max(100000000).nullable().optional(),
      followUpSessions: z.number().int().min(0).max(500).nullable().optional(),
      locationOfSurgery: z.string().max(80).optional(),
      mri: z.string().max(80).optional(),
      anyOther: z.string().max(2000).optional(),
      fields: z.array(z.object({ key: z.string().min(1).max(80), value: z.string().max(2000) }).strict()).max(50).optional(),
    }).strict().optional(),
    policyVersionId: objectId,
    policyAcknowledged: z.literal(true),
  }).strict().superRefine((value, ctx) => {
    if (value.mode === 'attach' && !value.existingPatientId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['existingPatientId'], message: 'Select the existing patient' });
    }
  }),
});

export const submissionListSchema = requestSchema({
  query: z.object({
    ...paging,
    departmentCode: z.enum(['SKIN', 'SURGERY']).optional(),
    procedureId: objectId.optional(),
    doctorId: objectId.optional(),
    bookingStatus: z.enum(['BOOKED', 'NOT_BOOKED']).optional(),
    referredBy: z.string().max(80).optional(),
    patientCode: z.string().max(40).optional(),
    phone: z.string().max(20).optional(),
    patientName: z.string().max(120).optional(),
    date: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    consultationStatus: z.enum(['PENDING', 'COMPLETED']).optional(),
    remarkCategory: z.string().max(80).optional(),
    action: z.string().max(80).optional(),
    entityType: z.string().max(80).optional(),
    userId: objectId.optional(),
  }).strip(),
});

export const idSchema = requestSchema({ params: z.object({ id: objectId }) });

export const notificationReadSchema = requestSchema({
  body: z.object({
    ids: z.array(objectId).max(50).optional(),
    all: z.boolean().optional(),
  }).strict(),
});

export const bookingSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(['BOOKED', 'NOT_BOOKED']),
    remark: z.string().max(1000).optional(),
  }).strict(),
});

export const reassignSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    doctorId: objectId,
    reason: z.string().max(400).optional(),
  }).strict(),
});

export const remarkTextSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({ text: z.string().trim().min(1).max(2000) }).strict(),
});

export const consultationSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({ status: z.enum(['PENDING', 'COMPLETED']) }).strict(),
});

const medicine = z.object({
  name: z.string().trim().min(1).max(160),
  dose: z.string().trim().min(1).max(80),
  frequency: z.string().trim().min(1).max(80),
  duration: z.string().trim().min(1).max(80),
  instructions: z.string().max(400).optional(),
}).strict();

export const prescriptionSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    prescriptionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    medicines: z.array(medicine).min(1).max(30),
    note: z.string().max(400).optional(),
  }).strict(),
});

export const voiceCreateSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    clientSessionId: z.string().trim().max(120).optional(),
    mimeType: z.string().trim().max(80).optional(),
    status: z.enum(['recording', 'paused', 'uploading', 'ready', 'failed']).optional(),
    transcriptDraft: z.string().max(100000).optional(),
    transcriptionProvider: z.string().trim().max(80).optional(),
    durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  }).strict(),
});

export const voiceUpdateSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(['recording', 'paused', 'uploading', 'ready', 'failed']).optional(),
    durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    transcriptDraft: z.string().max(100000).optional(),
    transcript: z.string().max(100000).optional(),
    transcriptionProvider: z.string().trim().max(80).optional(),
    finalizeTranscript: z.boolean().optional(),
    error: z.string().max(500).optional(),
  }).strict(),
});

export const clinicalRemarkSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({
    categories: z.array(z.string().min(1).max(80)).min(1).max(12),
    notes: z.string().trim().min(2).max(4000),
  }).strict(),
});

export const linkSchema = requestSchema({
  body: z.object({
    skinPatientId: objectId,
    surgeryPatientId: objectId,
    reason: z.string().max(400).optional(),
    confirmCnicMismatch: z.boolean().optional(),
  }).strict(),
});

export const mergeSchema = requestSchema({
  body: z.object({
    primaryId: objectId,
    duplicateId: objectId,
    reason: z.string().trim().min(5).max(400),
    confirmDifferentCnic: z.boolean().optional(),
  }).strict(),
});

export const correctPatientSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: patientBody.extend({
    reason: z.string().trim().min(5).max(400),
  }).strict(),
});

export const patientListSchema = requestSchema({
  query: z.object({
    ...paging,
    departmentCode: z.enum(['SKIN', 'SURGERY']).optional(),
  }).strip(),
});

export const catalogListSchema = requestSchema({
  query: z.object({
    active: z.enum(['true', 'false']).optional(),
    departmentId: objectId.optional(),
    departmentCode: z.enum(['SKIN', 'SURGERY']).optional(),
    type: z.enum(MASTER_TYPE_KEYS).optional(),
  }).strip(),
});

export const deleteDocumentSchema = requestSchema({
  params: z.object({ id: objectId }),
  body: z.object({ reason: z.string().max(400).optional() }).strict(),
});

export { empty };
