import request from 'supertest';
import mongoose from 'mongoose';
import app from '../server';
import { User } from '../models/User';
import argon2 from 'argon2';
import { config } from '../config';

const testMongoUri = process.env.MONGODB_URI || config.mongoUri || 'mongodb://127.0.0.1:27017/vault_test';

beforeAll(async () => {
  await mongoose.connect(testMongoUri);

  // Seed test user if needed
  const existing = await User.findOne({ username: 'admin' });
  if (!existing) {
    const hashedPassword = await argon2.hash('testpassword123', {
      type: argon2.argon2id,
    });
    await User.create({
      username: 'admin',
      passwordHash: hashedPassword,
    });
  }
}, 180000);

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Authentication & Authorization Security API', () => {
  it('should reject unauthenticated access to /api/videos with 401', async () => {
    const res = await request(app).get('/api/videos');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should fail login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should successfully log in with correct password and set session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'testpassword123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.username).toBe('admin');
    expect(res.headers['set-cookie']).toBeDefined();

    const cookie = res.headers['set-cookie'];

    // Verify /api/auth/me with session cookie
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body.authenticated).toBe(true);
    expect(meRes.body.user.username).toBe('admin');

    // Verify protected endpoint access with session cookie
    const videosRes = await request(app)
      .get('/api/videos')
      .set('Cookie', cookie);
    expect(videosRes.status).toBe(200);
    expect(videosRes.body.success).toBe(true);

    // Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Verify unauthenticated after logout
    const postLogoutRes = await request(app).get('/api/videos');
    expect(postLogoutRes.status).toBe(401);
  });
});
