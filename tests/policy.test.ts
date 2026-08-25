import request from 'supertest';
import { app } from '../src/index';
import { PolicyEngine } from '../src/policy';

describe('SkyPolicy engine', () => {
  it('defaults to deny and applies deny precedence at equal priority', () => {
    const engine = new PolicyEngine();
    engine.putPolicy('content', [
      {
        id: 'allow-editors',
        priority: 10,
        effect: 'allow',
        subjects: ['editor'],
        actions: ['publish'],
        resources: ['article'],
      },
      {
        id: 'deny-restricted',
        priority: 10,
        effect: 'deny',
        subjects: ['editor'],
        actions: ['publish'],
        resources: ['article'],
        conditions: { region: 'restricted' },
      },
    ]);

    expect(
      engine.evaluate('content', {
        subject: 'editor',
        action: 'publish',
        resource: 'article',
        context: { region: 'restricted' },
      }),
    ).toMatchObject({ allowed: false, reason: 'deny_rule', enforcementPerformed: false });

    expect(
      engine.evaluate('content', {
        subject: 'viewer',
        action: 'publish',
        resource: 'article',
      }),
    ).toMatchObject({ allowed: false, reason: 'default_deny' });
  });

  it('isolates stored rules from caller mutation and supports optimistic versions', () => {
    const engine = new PolicyEngine();
    const rules = [
      {
        id: 'allow-read',
        priority: 1,
        effect: 'allow' as const,
        subjects: ['user'],
        actions: ['read'],
        resources: ['profile'],
      },
    ];
    const first = engine.putPolicy('profiles', rules);
    rules[0].subjects[0] = '*';
    expect(engine.evaluate('profiles', { subject: 'guest', action: 'read', resource: 'profile' }).allowed).toBe(false);
    expect(() => engine.putPolicy('profiles', rules, 99)).toThrow('version_conflict');
    expect(engine.putPolicy('profiles', rules, first.version).version).toBe(2);
  });

  it('rejects wildcard request tokens and duplicate rule IDs', () => {
    const engine = new PolicyEngine();
    expect(() =>
      engine.putPolicy('dup', [
        { id: 'same', priority: 1, effect: 'allow', subjects: ['*'], actions: ['read'], resources: ['doc'] },
        { id: 'same', priority: 2, effect: 'deny', subjects: ['*'], actions: ['read'], resources: ['doc'] },
      ]),
    ).toThrow('duplicate_rule_id');

    engine.putPolicy('safe', [
      { id: 'allow', priority: 1, effect: 'allow', subjects: ['*'], actions: ['read'], resources: ['doc'] },
    ]);
    expect(() => engine.evaluate('safe', { subject: '*', action: 'read', resource: 'doc' })).toThrow('invalid_subject');
  });
});

describe('SkyPolicy HTTP integration contract', () => {
  const id = `policy-${Date.now()}`;

  it('registers and evaluates a policy without claiming enforcement', async () => {
    const create = await request(app)
      .put(`/api/v1/policies/${id}`)
      .send({
        rules: [
          {
            id: 'allow-service-read',
            priority: 100,
            effect: 'allow',
            subjects: ['service.analytics'],
            actions: ['read'],
            resources: ['metrics'],
          },
        ],
      });
    expect(create.status).toBe(201);
    expect(create.body.version).toBe(1);

    const decision = await request(app)
      .post(`/api/v1/policies/${id}/evaluate`)
      .send({ subject: 'service.analytics', action: 'read', resource: 'metrics' });
    expect(decision.status).toBe(200);
    expect(decision.body).toMatchObject({
      allowed: true,
      reason: 'allow_rule',
      enforcementPerformed: false,
      policyVersion: 1,
    });
  });
});
