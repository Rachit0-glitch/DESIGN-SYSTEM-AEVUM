# @aevum/mcp-server

## Responsibility

MCP-compatible AI control interface for tools, resources, jobs, transactions, and structured errors.

## What It Owns

MCP request validation, authorization, command/job translation, and audit integration.

## What It Must Not Own

Mutate canonical project state directly or depend on Studio UI.

## Allowed Dependencies

mcp-protocol, project-store, command-engine, document-model, approved authentication libraries, and shared.

## Current Status

`IMPLEMENTED` for Phase 12.

## Request Path

```text
POST /mcp
-> strict envelope validation
-> signed Supabase JWT verification
-> workspace membership resolution
-> role and permission checks
-> tool registry
-> Command Engine transaction for writes
-> atomic Supabase document/version/audit/idempotency commit
-> structured MCP response
```

The server also exposes unauthenticated `GET /health`, `GET /ready`, and `GET /version` endpoints. Readiness checks
the auth verifier, Supabase-backed Project Store, migration version, tool registry, and audit persistence boundary.

## Authentication And Isolation

Production requires `MCP_AUTH_MODE=supabase`. JWT signatures, issuer, audience, and expiry are verified before signed
claims are used. Roles and permissions are resolved from `workspace_memberships`; token metadata cannot grant project
access. Project and document queries always include the resolved workspace scope.

Development and disabled auth modes are available only outside production. They still require a repository
membership and never bypass authorization.

## Writes

Every write requires `expectedDocumentVersion` and an idempotency key. The tool compiles one high-level operation into
a typed Command Engine command. Dry runs execute command validation without persistence. Commits atomically persist
the new Canonical Design Document, immutable version record, audit record, and idempotency result. Locked nodes are
enforced by the Command Engine.

## Operations

- `pnpm --filter @aevum/mcp-server... build`
- `pnpm --filter @aevum/mcp-server start`
- Railway config: `apps/mcp-server/railway.toml`; use `/apps/mcp-server/railway.toml` as the Git service Config File
- Production bind: `MCP_SERVER_HOST=0.0.0.0`; Railway supplies `PORT`
- Graceful shutdown: `SIGINT` and `SIGTERM`, bounded by `MCP_SHUTDOWN_GRACE_MS`

Structured log events provide hooks for request/tool counts, latency, failures, authorization denials, version
conflicts, rate limits, audit failures, and readiness failures. A distributed metrics sink remains a replaceable
future adapter; a real Redis-backed distributed rate-limit provider (`createRedisRateLimitProvider`,
`apps/mcp-server/src/rate-limit.ts`) is wired in and selected automatically whenever `CACHE_URL` is configured
(Block H4) — see "Current Limitations" below for the one remaining caveat.

## Current Limitations

- HTTP JSON is the only Phase 12 transport; WebSockets are deferred.
- Multi-command transaction tools and persistent job queues are deferred. Versioned protocol foundations exist.
- The production rate-limit interface is replaceable. The real implementation is Redis-backed and coordinates
  correctly across replicas when `CACHE_URL` is configured; only the fallback used when it is *not* configured is
  in-process and single-replica-only. Verify `CACHE_URL` is actually set on the live deployment — its absence
  wouldn't fail startup, it would just silently fall back.
- The Phase 12 tools plus the three bounded Phase 14 3D tools are implemented. Raw model bytes, uploads, modelling,
  rendering, and Blender execution are not MCP operations in this phase.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/08_MCP_SPECIFICATION.md`
- `../../docs/MCP_DEPLOYMENT.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
