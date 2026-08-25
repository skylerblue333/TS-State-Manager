# SkyPolicy — Wave 2 Slot #72 / Lane 12

**Status:** engineering beta / central policy-decision domain core.

SkyPolicy adds a bounded policy registry and deterministic decision engine to the existing Sky State Store repository. It is designed as a reusable decision boundary for SKYCOIN4444 services that need a common `subject + action + resource + context` policy contract.

## Contract

- `PUT /api/v1/policies/:id` — create or version a policy set.
- `GET /api/v1/policies/:id` — read a detached policy snapshot.
- `POST /api/v1/policies/:id/evaluate` — evaluate a request.

A decision includes `allowed`, the policy version, matching rule IDs, a deterministic reason, and `enforcementPerformed: false`.

## Decision semantics

- Default is deny when no rule matches.
- Higher priority rules win.
- A deny rule wins over an allow rule at the same priority.
- Wildcards are permitted only in stored policy matchers, not in incoming request tokens.
- Optional conditions use exact string equality against caller-supplied context.
- Duplicate rule IDs, unsafe identifiers, oversized condition maps, invalid versions, and empty matcher sets are rejected.
- Policy replacement supports optimistic `expectedVersion` checks.

## SKYCOIN4444 integration

Other components can call the evaluate endpoint before performing a protected operation. Recommended integration chain:

`SkyIdentity / SkyAuth -> SkyPermissions -> SkyPolicy -> application-specific enforcement`

The caller remains responsible for obtaining a trustworthy authenticated identity, mapping it to a policy subject, and enforcing the returned decision. SkyPolicy itself does not authenticate, authorize network traffic, mutate infrastructure, or execute the requested action.

## Security boundaries

This implementation is process-local and in-memory. It does **not** provide distributed policy propagation, durable policy storage, signed policy bundles, tenant isolation, OPA/Rego compatibility, compliance certification, external identity verification, or production deployment evidence.

A returned `allowed: true` is advisory input to an enforcing component. It is not evidence that enforcement occurred. Production use would require durable storage, authenticated administration, protected transport, audit logging, deployment controls, and independent security review.
