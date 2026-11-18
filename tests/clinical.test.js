import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuditLog } from '../src/models/AuditLog.js';
import { DocumentAccessLog } from '../src/models/DocumentAccessLog.js';

let app;
let helpers;
let fx;
let manager;
let skinDoctor;
let surgeryDoctor;

const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

beforeAll(async () => {
  helpers = await import('./helpers.js');
  await helpers.connectTestDb();
  app = (await import('../src/app.js')).createApp();
});

beforeEach(async () => {
  await helpers.resetDatabase();
  fx = await helpers.createFixture();
  manager = await helpers.tokenFor(app, 'reception');
  skinDoctor = await helpers.tokenFor(app, 'dr.skin');
  surgeryDoctor = await helpers.tokenFor(app, 'dr.surgery');
});

async function bookedSkin() {
  const created = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
  const booked = await request(app)
    .patch(`/api/submissions/${created.body.data.submission.id}/booking`)
    .set('Authorization', `Bearer ${manager}`)
    .send({ status: 'BOOKED', remark: 'Counter booking' });
  return { created, booked };
}

describe('booking, doctor access, clinical records, and documents', () => {
  it('adds and removes a patient from the assigned doctor list', async () => {
    const created = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    const id = created.body.data.submission.id;
    const before = await request(app).get('/api/doctor/patients').set('Authorization', `Bearer ${skinDoctor}`);
    expect(before.body.meta.total).toBe(1);
    const notices = await request(app).get('/api/doctor/notifications').set('Authorization', `Bearer ${skinDoctor}`);
    expect(notices.body.data.unread).toBeGreaterThan(0);
    const booked = await request(app).patch(`/api/submissions/${id}/booking`).set('Authorization', `Bearer ${manager}`).send({ status: 'BOOKED' });
    expect(booked.body.data.bookingStatus).toBe('BOOKED');
    expect(booked.body.data.bookedAt).toBeTruthy();
    const mine = await request(app).get('/api/doctor/patients?doctorId=507f1f77bcf86cd799439011').set('Authorization', `Bearer ${skinDoctor}`);
    expect(mine.body.meta.total).toBe(1);
    expect(mine.body.items[0].patientCode).toBe('SKN-000001');
    const other = await request(app).get('/api/doctor/patients').set('Authorization', `Bearer ${surgeryDoctor}`);
    expect(other.body.meta.total).toBe(0);
    const reversed = await request(app).patch(`/api/submissions/${id}/booking`).set('Authorization', `Bearer ${manager}`).send({ status: 'NOT_BOOKED' });
    expect(reversed.body.data.bookingHistory).toHaveLength(2);
    const after = await request(app).get('/api/doctor/patients').set('Authorization', `Bearer ${skinDoctor}`);
    expect(after.body.meta.total).toBe(1);
    const visible = await request(app).get(`/api/submissions/${id}`).set('Authorization', `Bearer ${skinDoctor}`);
    expect(visible.status).toBe(200);
  });

  it('logs doctor reassignment and blocks it after booking for a manager', async () => {
    const created = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    const id = created.body.data.submission.id;
    const moved = await request(app).patch(`/api/submissions/${id}/doctor`).set('Authorization', `Bearer ${manager}`).send({ doctorId: fx.users.bothDoctor._id, reason: 'Schedule change' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.doctorName).toBe('Both Doctor');
    await request(app).patch(`/api/submissions/${id}/booking`).set('Authorization', `Bearer ${manager}`).send({ status: 'BOOKED' });
    const blocked = await request(app).patch(`/api/submissions/${id}/doctor`).set('Authorization', `Bearer ${manager}`).send({ doctorId: fx.users.skinDoctor._id, reason: 'Too late' });
    expect(blocked.status).toBe(400);
    const audit = await AuditLog.findOne({ action: 'DOCTOR_REASSIGNED' });
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toMatch(/42101/);
  });

  it('shows linked history to the assigned doctor and keeps other doctors out', async () => {
    const skin = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    const surgery = await helpers.postIntake(app, manager, helpers.intakePayload(fx, { departmentCode: 'SURGERY', confirmIdentityLink: true }));
    await request(app).patch(`/api/submissions/${surgery.body.data.submission.id}/booking`).set('Authorization', `Bearer ${manager}`).send({ status: 'BOOKED' });
    const detail = await request(app).get(`/api/doctor/patients/${surgery.body.data.submission.id}`).set('Authorization', `Bearer ${surgeryDoctor}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.history.some((group) => group.patientCode === 'SKN-000001')).toBe(true);
    const denied = await request(app).get(`/api/submissions/${skin.body.data.submission.id}`).set('Authorization', `Bearer ${surgeryDoctor}`);
    expect(denied.status).toBe(403);
    const stranger = await request(app).get(`/api/submissions/${surgery.body.data.submission.id}`).set('Authorization', `Bearer ${skinDoctor}`);
    expect(stranger.status).toBe(403);
  });

  it('versions prescriptions and remarks without overwriting history', async () => {
    const { created } = await bookedSkin();
    const id = created.body.data.submission.id;
    const managerWrite = await request(app).post(`/api/submissions/${id}/prescriptions`).set('Authorization', `Bearer ${manager}`).send({
      prescriptionDate: created.body.data.submission.formDate,
      medicines: [{ name: 'Blocked', dose: '1', frequency: 'daily', duration: '1 day' }],
    });
    expect(managerWrite.status).toBe(403);
    const createdRx = await request(app).post(`/api/submissions/${id}/prescriptions`).set('Authorization', `Bearer ${skinDoctor}`).send({
      prescriptionDate: created.body.data.submission.formDate,
      medicines: [{ name: 'Cream A', dose: 'Thin layer', frequency: 'Nightly', duration: '5 days', instructions: 'Avoid sun' }],
    });
    expect(createdRx.status).toBe(201);
    const version = await request(app).post(`/api/prescriptions/${createdRx.body.data.id}/versions`).set('Authorization', `Bearer ${skinDoctor}`).send({
      prescriptionDate: created.body.data.submission.formDate,
      note: 'Dose clarified',
      medicines: [{ name: 'Cream B', dose: 'Pea size', frequency: 'Twice daily', duration: '7 days' }],
    });
    expect(version.status).toBe(201);
    expect(version.body.data.versions).toHaveLength(2);
    expect(version.body.data.versions.at(-1).medicines[0].name).toBe('Cream A');
    const remark = await request(app).post(`/api/submissions/${id}/remarks`).set('Authorization', `Bearer ${skinDoctor}`).send({ categories: ['facial'], notes: 'Initial observation' });
    expect(remark.status).toBe(201);
    const remarkVersion = await request(app).post(`/api/remarks/${remark.body.data.id}/versions`).set('Authorization', `Bearer ${skinDoctor}`).send({ categories: ['facial', 'threads'], notes: 'Added a second category' });
    expect(remarkVersion.body.data.versions).toHaveLength(2);
    expect(remarkVersion.body.data.versions.at(-1).notes).toBe('Initial observation');
    const admin = await helpers.tokenFor(app, 'admin');
    const adminWrite = await request(app).post(`/api/prescriptions/${createdRx.body.data.id}/versions`).set('Authorization', `Bearer ${admin}`).send({
      prescriptionDate: created.body.data.submission.formDate,
      medicines: [{ name: 'Nope', dose: '1', frequency: 'daily', duration: '1 day' }],
    });
    expect(adminWrite.status).toBe(403);
    const managerView = await request(app).get(`/api/submissions/${id}`).set('Authorization', `Bearer ${manager}`);
    expect(managerView.body.data.prescriptions).toEqual([]);
    const completed = await request(app).patch(`/api/doctor/patients/${id}/consultation`).set('Authorization', `Bearer ${skinDoctor}`).send({ status: 'COMPLETED' });
    expect(completed.body.data.consultationStatus).toBe('COMPLETED');
  });

  it('accepts a real PDF and rejects invalid files and unauthorized access', async () => {
    const { created } = await bookedSkin();
    const id = created.body.data.submission.id;
    const badExt = await request(app).post(`/api/submissions/${id}/documents`).set('Authorization', `Bearer ${manager}`).attach('files', Buffer.from('hello'), { filename: 'note.exe', contentType: 'application/octet-stream' });
    expect(badExt.status).toBe(400);
    const notes = await request(app).post(`/api/submissions/${id}/documents`).set('Authorization', `Bearer ${manager}`).attach('files', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(notes.status).toBe(201);
    const tooBig = Buffer.alloc(10 * 1024 * 1024 + 20, 1);
    tooBig.write('%PDF-1.4', 0);
    const oversized = await request(app).post(`/api/submissions/${id}/documents`).set('Authorization', `Bearer ${manager}`).attach('files', tooBig, { filename: 'large.pdf', contentType: 'application/pdf' });
    expect(oversized.status).toBe(400);
    const uploaded = await request(app).post(`/api/submissions/${id}/documents`).set('Authorization', `Bearer ${manager}`).attach('files', pdf, { filename: 'labs.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);
    const documentId = uploaded.body.data[0].id;
    const stranger = await request(app).get(`/api/documents/${documentId}/download`).set('Authorization', `Bearer ${surgeryDoctor}`);
    expect(stranger.status).toBe(403);
    const allowed = await request(app).get(`/api/documents/${documentId}/view`).set('Authorization', `Bearer ${skinDoctor}`);
    expect(allowed.status).toBe(200);
    expect(allowed.headers['content-type']).toMatch(/pdf/);
    const doctorDelete = await request(app).delete(`/api/documents/${documentId}`).set('Authorization', `Bearer ${skinDoctor}`).send({});
    expect(doctorDelete.status).toBe(403);
    const otherManager = await helpers.tokenFor(app, 'reception2');
    const otherDelete = await request(app).delete(`/api/documents/${documentId}`).set('Authorization', `Bearer ${otherManager}`).send({ reason: 'not mine' });
    expect(otherDelete.status).toBe(403);
    const removed = await request(app).delete(`/api/documents/${documentId}`).set('Authorization', `Bearer ${manager}`).send({ reason: 'Uploaded in error' });
    expect(removed.status).toBe(200);
    const access = await DocumentAccessLog.countDocuments({ document: documentId });
    expect(access).toBeGreaterThan(0);
    const deletion = await AuditLog.findOne({ action: 'DOCUMENT_DELETED' });
    expect(deletion).toBeTruthy();
  });
});
