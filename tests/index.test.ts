import request from 'supertest';
import { app } from '../src/index';

describe('TS-State-Manager', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('should set and get state', async () => {
    await request(app).put('/api/state/theme').send({ mode: 'dark' });
    const res = await request(app).get('/api/state/theme');
    expect(res.status).toBe(200);
    expect(res.body.value.mode).toBe('dark');
  });

});
