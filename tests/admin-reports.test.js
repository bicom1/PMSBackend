import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';

let app;
let helpers;
let fx;
let admin;
let manager;

beforeAll(async () => {
  helpers = await import('./helpers.js');
  await helpers.connectTestDb();
  app = (await import('../src/app.js')).createApp();
});

beforeEach(async () => {
  await helpers.resetDatabase();
  fx = await helpers.createFixture();
  admin = await helpers.tokenFor(app, 'admin');
  manager = await helpers.tokenFor(app, 'reception');
});

describe('administration, audit, and reports', () => {
  it('manages users, doctor departments, and passwords', async () => {
    const created = await request(app).post('/api/users').set('Authorization', `Bearer ${admin}`).send({
      username: 'dr.new',
      password: 'Doctor@12345',
      fullName: 'New Doctor',
      email: 'dr.new@clinic.test',
      phone: '03001234567',
      role: 'DOCTOR',
      departments: [String(fx.departments.skin._id)],
    });
    expect(created.status).toBe(201);
    const duplicate = await request(app).post('/api/users').set('Authorization', `Bearer ${admin}`).send({
      username: 'dr.new',
      password: 'Doctor@12345',
      fullName: 'New Doctor',
      email: 'dr.other@clinic.test',
      phone: '03001234568',
      role: 'DOCTOR',
      departments: [String(fx.departments.skin._id)],
    });
    expect(duplicate.status).toBe(409);
    const updated = await request(app).patch(`/api/users/${created.body.data.id}`).set('Authorization', `Bearer ${admin}`).send({
      departments: [String(fx.departments.skin._id), String(fx.departments.surgery._id)],
    });
    expect(updated.body.data.departments).toHaveLength(2);
    await request(app).post(`/api/users/${created.body.data.id}/reset-password`).set('Authorization', `Bearer ${admin}`).send({ password: 'Changed@12345' });
    const oldLogin = await helpers.login(app, 'dr.new', 'Doctor@12345');
    expect(oldLogin.status).toBe(401);
    const newLogin = await helpers.login(app, 'dr.new', 'Changed@12345');
    expect(newLogin.status).toBe(200);
    const deactivated = await request(app).patch(`/api/users/${created.body.data.id}`).set('Authorization', `Bearer ${admin}`).send({ isActive: false });
    expect(deactivated.body.data.isActive).toBe(false);
    const inactive = await helpers.login(app, 'dr.new', 'Changed@12345');
    expect(inactive.status).toBe(403);
  });

  it('versions policy text and keeps the previous version', async () => {
    const published = await request(app).post('/api/policy/versions').set('Authorization', `Bearer ${admin}`).send({
      items: ['Updated acknowledgement line for the clinic.'],
    });
    expect(published.status).toBe(201);
    expect(published.body.data.version).toBe(2);
    const versions = await request(app).get('/api/policy/versions').set('Authorization', `Bearer ${admin}`);
    expect(versions.body.data).toHaveLength(2);
    const stale = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    expect(stale.status).toBe(409);
    expect(stale.body.errors.code).toBe('POLICY_CHANGED');
  });

  it('merges verified duplicate patients and preserves the surviving ID', async () => {
    const primary = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      patient: { fullName: 'Primary Person', contactNumber: helpers.phone(30), cnic: helpers.cnic(30) },
    }));
    const duplicate = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      patient: { fullName: 'Primary Person', contactNumber: helpers.phone(31), cnic: helpers.cnic(31) },
    }));
    const merged = await request(app).post('/api/patients/merge').set('Authorization', `Bearer ${admin}`).send({
      primaryId: primary.body.data.patient.id,
      duplicateId: duplicate.body.data.patient.id,
      confirmDifferentCnic: true,
      reason: 'Verified duplicate registration at the desk',
    });
    expect(merged.status).toBe(200);
    expect(merged.body.data.patientCode).toBe('SKN-000001');
    const submissions = await request(app).get('/api/submissions?patientCode=SKN-000001').set('Authorization', `Bearer ${admin}`);
    expect(submissions.body.meta.total).toBe(2);
    const managerMerge = await request(app).post('/api/patients/merge').set('Authorization', `Bearer ${manager}`).send({
      primaryId: primary.body.data.patient.id,
      duplicateId: duplicate.body.data.patient.id,
      reason: 'Managers cannot merge',
    });
    expect(managerMerge.status).toBe(403);
  });

  it('filters reports and keeps clinical columns admin-only', async () => {
    const skin = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      departmentCode: 'SURGERY',
      patient: { fullName: 'Sana Malik', contactNumber: helpers.phone(4), cnic: helpers.cnic(4) },
    }));
    await request(app).patch(`/api/submissions/${skin.body.data.submission.id}/booking`).set('Authorization', `Bearer ${manager}`).send({ status: 'BOOKED' });
    const doctor = await helpers.tokenFor(app, 'dr.skin');
    await request(app).post(`/api/submissions/${skin.body.data.submission.id}/prescriptions`).set('Authorization', `Bearer ${doctor}`).send({
      prescriptionDate: skin.body.data.submission.formDate,
      medicines: [{ name: 'PrivateMed', dose: '1 tab', frequency: 'daily', duration: '3 days' }],
    });
    const filtered = await request(app).get('/api/reports?departmentCode=SKIN&bookingStatus=BOOKED').set('Authorization', `Bearer ${manager}`);
    expect(filtered.body.meta.total).toBe(1);
    const managerCsv = await request(app).get('/api/reports/export.csv?departmentCode=SKIN').set('Authorization', `Bearer ${manager}`);
    expect(managerCsv.status).toBe(200);
    expect(managerCsv.text).toContain('Ayesha Khan');
    expect(managerCsv.text).not.toContain('PrivateMed');
    expect(managerCsv.text).not.toContain('Prescriptions');
    const adminFile = await request(app)
      .get('/api/reports/export.xlsx?departmentCode=SKIN')
      .set('Authorization', `Bearer ${admin}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(adminFile.body);
    const sheet = workbook.getWorksheet('Submissions');
    const headers = sheet.getRow(1).values.join(' ');
    expect(headers).toContain('Prescriptions');
    const content = sheet.getSheetValues().flat().join(' ');
    expect(content).toContain('PrivateMed');
    const denied = await request(app).get('/api/reports').set('Authorization', `Bearer ${doctor}`);
    expect(denied.status).toBe(403);
  });

  it('records audit events and refuses deletion', async () => {
    await request(app).post('/api/master-data').set('Authorization', `Bearer ${admin}`).send({ type: 'CITY', label: 'Gilgit' });
    const logs = await request(app).get('/api/audit-logs').set('Authorization', `Bearer ${admin}`);
    expect(logs.body.items.some((item) => item.action === 'MASTER_DATA_CHANGED')).toBe(true);
    const hidden = await request(app).get('/api/audit-logs').set('Authorization', `Bearer ${manager}`);
    expect(hidden.status).toBe(403);
    const sample = logs.body.items[0];
    const deleted = await request(app).delete(`/api/audit-logs/${sample._id}`).set('Authorization', `Bearer ${admin}`);
    expect(deleted.status).toBe(403);
  });
});
