export type PolicyEffect = 'allow' | 'deny';

export interface PolicyRule {
  id: string;
  priority: number;
  effect: PolicyEffect;
  subjects: string[];
  actions: string[];
  resources: string[];
  conditions?: Record<string, string>;
}

export interface PolicyRequest {
  subject: string;
  action: string;
  resource: string;
  context?: Record<string, string>;
}

export interface PolicyDecision {
  allowed: boolean;
  policyId: string;
  policyVersion: number;
  matchedRuleIds: string[];
  reason: 'allow_rule' | 'deny_rule' | 'default_deny';
  enforcementPerformed: false;
}

interface StoredPolicy {
  id: string;
  version: number;
  rules: PolicyRule[];
}

const TOKEN = /^[A-Za-z0-9._:-]{1,64}$/;
const MAX_POLICIES = 1_000;
const MAX_RULES = 256;
const MAX_CONDITIONS = 16;

function assertToken(value: string, field: string, allowWildcard = false): void {
  if (allowWildcard && value === '*') return;
  if (!TOKEN.test(value)) throw new Error(`invalid_${field}`);
}

function cloneRule(rule: PolicyRule): PolicyRule {
  return {
    ...rule,
    subjects: [...rule.subjects],
    actions: [...rule.actions],
    resources: [...rule.resources],
    conditions: rule.conditions ? { ...rule.conditions } : undefined,
  };
}

function validateRule(rule: PolicyRule): void {
  assertToken(rule.id, 'rule_id');
  if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 1_000_000) {
    throw new Error('invalid_priority');
  }
  if (rule.effect !== 'allow' && rule.effect !== 'deny') throw new Error('invalid_effect');
  if (!rule.subjects.length || !rule.actions.length || !rule.resources.length) {
    throw new Error('empty_matcher');
  }
  for (const value of rule.subjects) assertToken(value, 'subject', true);
  for (const value of rule.actions) assertToken(value, 'action', true);
  for (const value of rule.resources) assertToken(value, 'resource', true);

  const entries = Object.entries(rule.conditions ?? {});
  if (entries.length > MAX_CONDITIONS) throw new Error('too_many_conditions');
  for (const [key, value] of entries) {
    assertToken(key, 'condition_key');
    if (value.length < 1 || value.length > 128) throw new Error('invalid_condition_value');
  }
}

function tokenMatches(patterns: string[], value: string): boolean {
  return patterns.includes('*') || patterns.includes(value);
}

function conditionsMatch(expected: Record<string, string> | undefined, actual: Record<string, string>): boolean {
  if (!expected) return true;
  return Object.entries(expected).every(([key, value]) => actual[key] === value);
}

export class PolicyEngine {
  private readonly policies = new Map<string, StoredPolicy>();

  putPolicy(id: string, rules: PolicyRule[], expectedVersion?: number): StoredPolicy {
    assertToken(id, 'policy_id');
    if (!Array.isArray(rules) || rules.length < 1 || rules.length > MAX_RULES) {
      throw new Error('invalid_rule_count');
    }
    if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) {
      throw new Error('invalid_expected_version');
    }

    const seen = new Set<string>();
    for (const rule of rules) {
      validateRule(rule);
      if (seen.has(rule.id)) throw new Error('duplicate_rule_id');
      seen.add(rule.id);
    }

    const current = this.policies.get(id);
    if (expectedVersion !== undefined && current?.version !== expectedVersion) {
      throw new Error('version_conflict');
    }
    if (!current && this.policies.size >= MAX_POLICIES) throw new Error('capacity_exhausted');

    const stored: StoredPolicy = {
      id,
      version: (current?.version ?? 0) + 1,
      rules: rules.map(cloneRule),
    };
    this.policies.set(id, stored);
    return this.getPolicy(id)!;
  }

  getPolicy(id: string): StoredPolicy | undefined {
    const policy = this.policies.get(id);
    if (!policy) return undefined;
    return { id: policy.id, version: policy.version, rules: policy.rules.map(cloneRule) };
  }

  evaluate(id: string, request: PolicyRequest): PolicyDecision {
    assertToken(id, 'policy_id');
    assertToken(request.subject, 'subject');
    assertToken(request.action, 'action');
    assertToken(request.resource, 'resource');

    const context = request.context ?? {};
    if (Object.keys(context).length > MAX_CONDITIONS) throw new Error('too_many_context_entries');
    for (const [key, value] of Object.entries(context)) {
      assertToken(key, 'context_key');
      if (value.length < 1 || value.length > 128) throw new Error('invalid_context_value');
    }

    const policy = this.policies.get(id);
    if (!policy) throw new Error('policy_not_found');

    const matching = policy.rules
      .filter((rule) =>
        tokenMatches(rule.subjects, request.subject) &&
        tokenMatches(rule.actions, request.action) &&
        tokenMatches(rule.resources, request.resource) &&
        conditionsMatch(rule.conditions, context),
      )
      .sort((a, b) => b.priority - a.priority || (a.effect === b.effect ? a.id.localeCompare(b.id) : a.effect === 'deny' ? -1 : 1));

    if (!matching.length) {
      return {
        allowed: false,
        policyId: id,
        policyVersion: policy.version,
        matchedRuleIds: [],
        reason: 'default_deny',
        enforcementPerformed: false,
      };
    }

    const highestPriority = matching[0].priority;
    const top = matching.filter((rule) => rule.priority === highestPriority);
    const decisive = top.find((rule) => rule.effect === 'deny') ?? top[0];

    return {
      allowed: decisive.effect === 'allow',
      policyId: id,
      policyVersion: policy.version,
      matchedRuleIds: top.map((rule) => rule.id),
      reason: decisive.effect === 'allow' ? 'allow_rule' : 'deny_rule',
      enforcementPerformed: false,
    };
  }
}
