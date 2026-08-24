import request from 'supertest';
import { app } from '../src/index';

describe('Sky State Store', () => {
  it('reports health and readiness', async () => {
    expect((await request(app).get('/healthz')).status).toBe(200);
    expect((await request(app).get('/readyz')).body.status).toBe('ready');
  });

  it('creates, reads, and updates versioned state', async () => {
    const key = `theme-${Date.now()}`;
    const created = await request(app).put(`/api/v1/state/${key}`).send({ value: { mode: 'dark' } });
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(1);

    const read = await request(app).get(`/api/v1/state/${key}`);
    expect(read.status).toBe(200);
    expect(read.body.value.mode).toBe('dark');

    const updated = await request(app)
      .put(`/api/v1/state/${key}`)
      .send({ value: { mode: 'light' }, expectedVersion: 1 });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);
  });

  it('rejects stale compare-and-set writes', async () => {
    const key = `cas-${Date.now()}`;
    await request(app).put(`/api/v1/state/${key}`).send({ value: 1 });
    const conflict = await request(app)
      .put(`/api/v1/state/${key}`)
      .send({ value: 2, expectedVersion: 99 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('version_conflict');
  });

  it('validates keys and supports deletion', async () => {
    expect((await request(app).put('/api/v1/state/bad key').send({ value: 1 })).status).toBe(400);
    const key = `delete-${Date.now()}`;
    await request(app).put(`/api/v1/state/${key}`).send({ value: true });
    expect((await request(app).delete(`/api/v1/state/${key}`)).status).toBe(204);
    expect((await request(app).get(`/api/v1/state/${key}`)).status).toBe(404);
  });
});
