import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';

let app;
let helpers;

beforeAll(async () => {
  helpers = await import('./helpers.js');
  await helpers.connectTestDb();
  app = (await import('../src/app.js')).createApp();
});

beforeEach(async () => {
  await helpers.resetDatabase();
  await helpers.createFixture();
});

describe('authentication', () => {
  it('logs in a valid user and refreshes the session', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'admin@clinic.test', password: helpers.PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('ADMIN');
    expect(login.body.data.accessToken).toBeTruthy();
    const refresh = await agent.post('/api/auth/refresh');
    expect(refresh.status).toBe(200);
    expect(refresh.body.data.accessToken).toBeTruthy();
    const me = await agent.get('/api/auth/me').set('Authorization', `Bearer ${refresh.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('admin@clinic.test');
  });

  it('rejects an invalid password', async () => {
    const res = await helpers.login(app, 'admin', 'Wrong@12345');
    expect(res.status).toBe(401);
  });

  it('rejects an inactive account', async () => {
    const res = await helpers.login(app, 'inactive');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/inactive/i);
  });

  it('rejects a missing, invalid, and expired token', async () => {
    const missing = await request(app).get('/api/auth/me');
    expect(missing.status).toBe(401);
    const invalid = await request(app).get('/api/users').set('Authorization', 'Bearer not-a-token');
    expect(invalid.status).toBe(401);
    const expired = jwt.sign(
      { sub: '507f1f77bcf86cd799439011', type: 'access', exp: Math.floor(Date.now() / 1000) - 20 },
      process.env.JWT_ACCESS_SECRET,
    );
    const stale = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(stale.status).toBe(401);
  });

  it('blocks a clinic manager from user management', async () => {
    const token = await helpers.tokenFor(app, 'reception');
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('locks the account after repeated failed logins', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await helpers.login(app, 'reception', 'Wrong@12345');
      expect(res.status).toBe(401);
    }
    const locked = await helpers.login(app, 'reception');
    expect(locked.status).toBe(423);
  });

  it('revokes the refresh token on logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@clinic.test', password: helpers.PASSWORD });
    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    const refresh = await agent.post('/api/auth/refresh');
    expect(refresh.status).toBe(401);
  });
});
