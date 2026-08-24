import express from 'express';
import { z } from 'zod';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const keySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const writeSchema = z.object({
  value: z.unknown(),
  expectedVersion: z.number().int().positive().optional(),
});

type Entry = { value: unknown; version: number; updatedAt: string };
const MAX_ENTRIES = 10_000;
const state = new Map<string, Entry>();

app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'sky-state-store' }));
app.get('/readyz', (_req, res) => res.json({ status: 'ready', entries: state.size, capacity: MAX_ENTRIES }));

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send(`sky_state_entries ${state.size}\nsky_state_capacity ${MAX_ENTRIES}\n`);
});

app.put('/api/v1/state/:key', (req, res) => {
  const parsedKey = keySchema.safeParse(req.params.key);
  const parsedBody = writeSchema.safeParse(req.body);
  if (!parsedKey.success || !parsedBody.success) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const key = parsedKey.data;
  const current = state.get(key);
  const expected = parsedBody.data.expectedVersion;

  if (expected !== undefined && current?.version !== expected) {
    return res.status(409).json({
      error: 'version_conflict',
      currentVersion: current?.version ?? null,
    });
  }
  if (!current && state.size >= MAX_ENTRIES) {
    return res.status(507).json({ error: 'capacity_exhausted' });
  }

  const entry: Entry = {
    value: parsedBody.data.value,
    version: (current?.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  state.set(key, entry);
  return res.status(current ? 200 : 201).json({ key, ...entry });
});

app.get('/api/v1/state/:key', (req, res) => {
  const parsedKey = keySchema.safeParse(req.params.key);
  if (!parsedKey.success) return res.status(400).json({ error: 'invalid_key' });
  const entry = state.get(parsedKey.data);
  if (!entry) return res.status(404).json({ error: 'not_found' });
  return res.json({ key: parsedKey.data, ...entry });
});

app.delete('/api/v1/state/:key', (req, res) => {
  const parsedKey = keySchema.safeParse(req.params.key);
  if (!parsedKey.success) return res.status(400).json({ error: 'invalid_key' });
  if (!state.delete(parsedKey.data)) return res.status(404).json({ error: 'not_found' });
  return res.status(204).send();
});

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`sky-state-store listening on ${port}`));
}
