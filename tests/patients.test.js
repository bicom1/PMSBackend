import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

let app;
let helpers;
let fx;
let manager;

beforeAll(async () => {
  helpers = await import('./helpers.js');
  await helpers.connectTestDb();
  app = (await import('../src/app.js')).createApp();
});

beforeEach(async () => {
  await helpers.resetDatabase();
  fx = await helpers.createFixture();
  manager = await helpers.tokenFor(app, 'reception');
});

describe('patient registration and identification', () => {
  it('creates independent skin and surgery patient IDs', async () => {
    const skin = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    expect(skin.status).toBe(201);
    expect(skin.body.data.patient.patientCode).toBe('SKN-000001');
    const surgery = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      departmentCode: 'SURGERY',
      patient: { fullName: 'Sana Malik', contactNumber: helpers.phone(2), cnic: helpers.cnic(2), gender: 'Female' },
    }));
    expect(surgery.status).toBe(201);
    expect(surgery.body.data.patient.patientCode).toBe('SRG-000001');
  });

  it('attaches a returning patient instead of issuing a new ID', async () => {
    const first = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    const second = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      mode: 'attach',
      existingPatientId: first.body.data.patient.id,
      visit: { weightKg: 63 },
    }));
    expect(second.status).toBe(201);
    expect(second.body.data.returningPatient).toBe(true);
    expect(second.body.data.patient.patientCode).toBe('SKN-000001');
    const list = await request(app).get('/api/submissions').set('Authorization', `Bearer ${manager}`);
    expect(list.body.meta.total).toBe(2);
  });

  it('does not treat a shared phone number as the same person', async () => {
    await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    const blocked = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      patient: { fullName: 'Hamza Khan', cnic: helpers.cnic(8), gender: 'Male', contactNumber: '03001234567' },
    }));
    expect(blocked.status).toBe(409);
    expect(blocked.body.errors.code).toBe('PHONE_CONFLICT');
    const created = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      acknowledgePhoneConflict: true,
      patient: { fullName: 'Hamza Khan', cnic: helpers.cnic(8), gender: 'Male', contactNumber: '03001234567' },
    }));
    expect(created.status).toBe(201);
    expect(created.body.data.patient.patientCode).toBe('SKN-000002');
  });

  it('requires verification when the CNIC matches and the name differs', async () => {
    const first = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    const blocked = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      patient: { fullName: 'Sara Khan' },
    }));
    expect(blocked.status).toBe(409);
    expect(blocked.body.errors.code).toBe('CNIC_NAME_CONFLICT');
    const corrected = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      mode: 'attach',
      existingPatientId: first.body.data.patient.id,
      correction: { reason: 'Corrected spelling at the counter' },
      patient: { fullName: 'Sara Khan' },
    }));
    expect(corrected.status).toBe(201);
    expect(corrected.body.data.patient.patientCode).toBe('SKN-000001');
    expect(corrected.body.data.patient.fullName).toBe('Sara Khan');
  });

  it('links a verified person across departments and keeps sequences separate', async () => {
    const skin = await helpers.postIntake(app, manager, helpers.intakePayload(fx));
    const surgery = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      departmentCode: 'SURGERY',
      confirmIdentityLink: true,
    }));
    expect(surgery.status).toBe(201);
    expect(surgery.body.data.patient.patientCode).toBe('SRG-000001');
    expect(skin.body.data.patient.patientCode).toBe('SKN-000001');
    const detail = await request(app).get(`/api/patients/${surgery.body.data.patient.id}`).set('Authorization', `Bearer ${manager}`);
    expect(detail.body.data.linked.patientCode).toBe('SKN-000001');
  });

  it('issues unique IDs when registrations happen together', async () => {
    const calls = await Promise.all([1, 2, 3, 4, 5].map((serial) => helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      patient: { fullName: `Patient ${serial}`, contactNumber: helpers.phone(serial), cnic: helpers.cnic(serial) },
    }))));
    expect(calls.every((res) => res.status === 201)).toBe(true);
    const codes = new Set(calls.map((res) => res.body.data.patient.patientCode));
    expect(codes.size).toBe(5);
  });

  it('accepts a typed value when it is not in the dropdown', async () => {
    const created = await helpers.postIntake(app, manager, helpers.intakePayload(fx, {
      departmentCode: 'SURGERY',
      patient: { nationality: 'Afghanistan', occupation: 'Pilot', city: 'Gilgit' },
      visit: { weightKg: 22.5, heightCm: 215, referredBy: 'Instagram' },
      surgeryDetails: {
        anesthesiaType: 'Local with sedation',
        diet: 'Clear liquids',
        bloodTestStatus: 'Sent out',
        locationOfSurgery: 'Ward 3',
        mri: 'Booked externally',
        followUpSessions: 18,
      },
    }));
    expect(created.status).toBe(201);
    expect(created.body.data.patient.nationality).toBe('Afghanistan');
    expect(created.body.data.patient.city).toBe('Gilgit');
    expect(created.body.data.patient.occupation).toBe('Pilot');
    expect(created.body.data.submission.heightCm).toBe(215);
    expect(created.body.data.submission.referredByLabel).toBe('Instagram');
    const detail = await request(app).get(`/api/submissions/${created.body.data.submission.id}`).set('Authorization', `Bearer ${manager}`);
    expect(detail.body.data.surgeryDetails.locationOfSurgeryLabel).toBe('Ward 3');
    expect(detail.body.data.surgeryDetails.followUpSessions).toBe(18);
  });

  it('prevents two simultaneous records for the same CNIC', async () => {
    const payload = helpers.intakePayload(fx);
    const [first, second] = await Promise.all([
      helpers.postIntake(app, manager, payload),
      helpers.postIntake(app, manager, payload),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});
