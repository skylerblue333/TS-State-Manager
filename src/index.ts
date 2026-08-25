import express from 'express';
import { z } from 'zod';
import { PolicyEngine, PolicyRule } from './policy';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const keySchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const policyIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/);
const writeSchema = z.object({
  value: z.unknown(),
  expectedVersion: z.number().int().positive().optional(),
});
const ruleSchema = z.object({
  id: z.string(),
  priority: z.number(),
  effect: z.enum(['allow', 'deny']),
  subjects: z.array(z.string()),
  actions: z.array(z.string()),
  resources: z.array(z.string()),
  conditions: z.record(z.string()).optional(),
});
const policyWriteSchema = z.object({
  rules: z.array(ruleSchema),
  expectedVersion: z.number().int().positive().optional(),
});
const policyRequestSchema = z.object({
  subject: z.string(),
  action: z.string(),
  resource: z.string(),
  context: z.record(z.string()).optional(),
});

type Entry = { value: unknown; version: number; updatedAt: string };
const MAX_ENTRIES = 10_000;
const state = new Map<string, Entry>();
export const policyEngine = new PolicyEngine();

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

app.put('/api/v1/policies/:id', (req, res) => {
  const parsedId = policyIdSchema.safeParse(req.params.id);
  const parsedBody = policyWriteSchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) return res.status(400).json({ error: 'invalid_policy' });

  try {
    const existing = policyEngine.getPolicy(parsedId.data);
    const policy = policyEngine.putPolicy(
      parsedId.data,
      parsedBody.data.rules as PolicyRule[],
      parsedBody.data.expectedVersion,
    );
    return res.status(existing ? 200 : 201).json(policy);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_policy';
    if (message === 'version_conflict') return res.status(409).json({ error: message });
    if (message === 'capacity_exhausted') return res.status(507).json({ error: message });
    return res.status(400).json({ error: message });
  }
});

app.get('/api/v1/policies/:id', (req, res) => {
  const parsedId = policyIdSchema.safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ error: 'invalid_policy_id' });
  const policy = policyEngine.getPolicy(parsedId.data);
  if (!policy) return res.status(404).json({ error: 'policy_not_found' });
  return res.json(policy);
});

app.post('/api/v1/policies/:id/evaluate', (req, res) => {
  const parsedId = policyIdSchema.safeParse(req.params.id);
  const parsedBody = policyRequestSchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) return res.status(400).json({ error: 'invalid_request' });

  try {
    return res.json(policyEngine.evaluate(parsedId.data, parsedBody.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_request';
    if (message === 'policy_not_found') return res.status(404).json({ error: message });
    return res.status(400).json({ error: message });
  }
});

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`sky-state-store listening on ${port}`));
}
