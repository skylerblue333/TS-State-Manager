import express from 'express';
import { z } from 'zod';

export const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'TS-State-Manager' });
});

const state: Record<string, any> = {};

app.put('/api/state/:key', (req, res) => {
  state[req.params.key] = req.body;
  res.json({ success: true, key: req.params.key });
});

app.get('/api/state/:key', (req, res) => {
  const val = state[req.params.key];
  if (val === undefined) return res.status(404).json({ error: 'Key not found' });
  res.json({ key: req.params.key, value: val });
});


if (require.main === module) {
  app.listen(3000, () => console.log('Server running on port 3000'));
}
