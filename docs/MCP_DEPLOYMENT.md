# AEVUM MCP Deployment

This runbook covers the Phase 12 `apps/mcp-server` service. It does not merge MCP into `apps/api`.

## Supabase Migration

The migration `supabase/migrations/20260802000100_create_mcp_foundation.sql` creates workspace membership, project,
current document, immutable document version, MCP audit, idempotency, and schema-version storage. It also creates the
atomic `aevum_mcp_commit_document` function. Migration `20260809000100_enable_mcp_audit_retention.sql` gives only the
trusted `service_role` audit-delete permission for configured retention and verified smoke cleanup; client roles remain
unable to read or mutate audit records.

Apply migrations with the linked Supabase CLI from the repository root:

```powershell
supabase migration list
supabase db push
```

The migration enables RLS on every Phase 12 table, revokes access from `anon` and `authenticated`, and grants only
the server-side `service_role` the required table and atomic-function privileges. Authorization still occurs in the
MCP server before repository access. The service-role key must never reach a browser or MCP client.

## Required Railway Configuration

Configure a separate Railway service using `apps/mcp-server/railway.toml`, with the monorepo root available to the
build. For a Git-connected monorepo service, set Railway's Config File path to `/apps/mcp-server/railway.toml`. Railway
CLI snapshot uploads only discover a root config file, so a CLI-only validation deployment may temporarily mirror that
file at `/railway.toml`; remove the mirror before committing because other services share the repository root.

Set these values in Railway, never in source control:

```text
NODE_ENV=production
AEVUM_RUNTIME_MODE=full
AEVUM_SERVICE=mcp-server
MCP_SERVER_HOST=0.0.0.0
MCP_AUTH_MODE=supabase
MCP_ALLOWED_ORIGINS=<explicit comma-separated origins>
MCP_DEPLOYMENT_VERSION=<release identifier>
SUPABASE_URL=<secret environment value>
SUPABASE_ANON_KEY=<secret environment value>
SUPABASE_SERVICE_ROLE_KEY=<secret environment value>
SUPABASE_PROJECT_ID=<secret environment value>
SUPABASE_STORAGE_BUCKET=<environment value>
SUPABASE_JWT_SECRET=<secret environment value when HS256 is enabled>
```

`DATABASE_URL` and `DATABASE_URL_DIRECT` are full-platform database settings. They are not required by the Phase 12
MCP service because its persistence adapter uses the authenticated Supabase Data API and atomic RPC.

Railway supplies `PORT`; the centralized environment module gives it precedence over `MCP_SERVER_PORT`.

## Activation Gate

Keep the Railway MCP service inactive until all of the following are evidenced:

1. Repository build and full validation pass.
2. Production environment parsing passes without printing values.
3. Supabase migrations are applied and readiness reports the expected schema version.
4. `/health`, `/ready`, and `/version` return 200.
5. A signed Supabase actor can perform one canonical read and one dry-run plus committed write.
6. The write persists one new document version, audit record, and idempotency result.
7. A cross-workspace request is denied and audited.
8. Secret scanning finds no credentials in tracked or staged files.
9. The service survives a restart and shuts down cleanly on `SIGTERM`.

For multiple replicas, install a distributed `RateLimitProvider` before enabling strict shared quotas. The included
in-memory provider is suitable for a single replica and tests.

## Verification

Health endpoints are intentionally unauthenticated and contain no secrets:

```text
GET /health
GET /ready
GET /version
```

`POST /mcp` requires a signed Supabase bearer token in production. Never record production JWTs, service-role keys,
database URLs, or full authenticated request dumps in deployment evidence.

Build the server and run the local authenticated production smoke from the repository root:

```powershell
pnpm --filter @aevum/mcp-server build
node --env-file-if-exists=.env.local --env-file=.env apps/mcp-server/dist/production-smoke.js
```

The runner creates a short-lived Auth user, seeds an isolated workspace and document, verifies a read, dry run,
committed write, persistence, audit, idempotent replay, and workspace denial, then deletes and verifies removal of all
temporary records and the Auth user. Pass `--endpoint=https://<service-domain>` to exercise the deployed service.
Pass `--restart-hold-ms=<milliseconds>` to hold the same ephemeral transaction open while restarting Railway; after
the hold, the runner verifies authentication, canonical persistence, and idempotent replay through the recovered
service before cleanup.
