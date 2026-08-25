# Security

Sky State Store is an engineering-beta, process-local state primitive and is not a production trust boundary.

Current controls include bounded request bodies, bounded key syntax, bounded entry cardinality, optimistic version checks, production dependency auditing, and a non-root runtime image.

Not implemented: authentication, authorization, tenant isolation, persistence, encryption at rest, distributed locking/consensus, durable audit logs, backup/restore, or production incident guarantees. Do not expose this service directly to untrusted networks without an authenticated gateway and deployment-specific controls.
