import request from 'supertest';
import app from '../src/index';

describe('TS-State-Manager API', () => {
    it('GET /health returns 200', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('healthy');
        expect(res.body.domain).toBe('manager');
    });

    it('POST /api/v1/process returns 201 for valid payload', async () => {
        const res = await request(app)
            .post('/api/v1/process')
            .send({ payload: 'test_data' });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.processed).toBe('test_data');
    });

    it('POST /api/v1/process returns 400 for missing payload', async () => {
        const res = await request(app).post('/api/v1/process').send({});
        expect(res.status).toBe(400);
    });
});
