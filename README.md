# Sky State Store

A bounded, process-local TypeScript state API with optimistic compare-and-set versioning.

**Status: engineering beta.** This is a focused state primitive, not a distributed database or Redux/Zustand replacement.

## Implemented behavior

- Validated state keys (`A-Z`, `a-z`, digits, `. _ : -`, max 128 characters).
- JSON request bodies capped at 64 KiB.
- Maximum 10,000 in-process entries.
- Monotonic per-key versions.
- Optional `expectedVersion` compare-and-set writes with HTTP `409` on stale versions.
- Create/read/update/delete endpoints.
- `/healthz`, `/readyz`, and basic Prometheus-text metrics.
- Jest/Supertest behavioral coverage.
- CI gates for TypeScript build, tests, production dependency audit, Docker build, and non-root runtime verification.

## API

```bash
curl -X PUT http://localhost:3000/api/v1/state/theme \
  -H 'content-type: application/json' \
  -d '{"value":{"mode":"dark"}}'

curl http://localhost:3000/api/v1/state/theme

curl -X PUT http://localhost:3000/api/v1/state/theme \
  -H 'content-type: application/json' \
  -d '{"value":{"mode":"light"},"expectedVersion":1}'
```

## Run and verify

```bash
npm ci
npm run build
npm test -- --runInBand
npm audit --omit=dev --audit-level=high
docker build -t sky-state-store .
```

## Product boundary

State is held only in process memory and is lost on restart. Multiple replicas do not share state. This checkpoint does not provide persistence, distributed consensus, transactions across keys, authentication, authorization, encryption at rest, backups, tenant isolation, HA, or verified production deployment.

For SKYCOIN4444, this can be used as a development-time state/CAS primitive behind an authenticated service boundary. Durable application state should use an authoritative datastore.

## License

See `LICENSE`.
