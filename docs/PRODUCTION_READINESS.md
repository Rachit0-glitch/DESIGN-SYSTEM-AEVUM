# Production Readiness Contract

Phase 24 release readiness is an evidence gate, not a marketing label. A release is ready only when every blocking
row below is verified against the repository revision being deployed and the production services report that same
revision. `GET /ready` is the machine-readable runtime signal for API and MCP dependency health; this document is
the operational contract spanning services.

## Blocking Gates

| Domain | Required evidence | Failure action |
| --- | --- | --- |
| Studio | Vercel root responds, CSP/security headers are present, production auth boots, canonical document loads | Roll back Vercel deployment |
| API | `/health`, `/ready`, and `/version` return 200; readiness confirms Supabase and schema | Keep Studio unavailable for writes; roll back API |
| MCP | Current protocol/deployment version, authenticated read/write smoke, permissions and isolation tests | Disable external MCP access; roll back MCP |
| Authentication | Supabase login, restoration, refresh, logout, rejected invalid/expired credentials | Block project access |
| Authorization | Workspace, project, document, role, and permission checks pass | Reject request; never fall back to broad access |
| Persistence | Atomic document/version/audit/idempotency commits and reload verification pass | Reject write and preserve prior version |
| Database | All migrations applied, RLS/grants/indexes/constraints reviewed, private bucket exists | Do not deploy dependent services |
| Assets | Immutable registry validation and private bucket exist; unsupported upload UI remains unavailable | Isolate asset failure; preserve document |
| Command integrity | Dry run, expected version, locked-node, rollback, and audit tests pass | Reject canonical mutation |
| Concurrency | Stale writes conflict; repeated idempotency keys replay the original result | Re-read and replan; no last-write-wins |
| Recovery | Supabase backup/PITR policy recorded and isolated restore procedure documented | Escalate; never test restore over production |
| Browser | Chromium E2E passes; unsupported WebGL receives bounded fallback | Keep 2D editor usable |
| Failure isolation | Studio, API, MCP, renderer, Agent, asset, Fidelity, and Blender failures do not mutate canonical state | Contain subsystem and return sanitized diagnostic |
| Observability | Request, actor, scope, tool, transaction, version, dry-run, result, and deployment IDs correlate | Treat unauditable writes as release blockers |
| Security | Secret scan, CORS, CSP, headers, payload/time/rate limits, redaction, dependency checks pass | Block release |
| Performance | Initial Studio entry remains below 250 kB minified; optional 3D loads on demand; service limits are bounded | Investigate regression before release |

## Recovery And Rollback

1. Record the Git commit, Vercel deployment, Railway deployment IDs, Supabase migration list, and service versions.
2. For application rollback, redeploy the last verified immutable Vercel/Railway deployment. Do not reverse a
   database migration until its data compatibility has been reviewed.
3. Supabase recovery uses a new isolated project or branch restored from the platform backup/PITR snapshot. Run
   schema, document hash, version history, audit, and idempotency checks there before a controlled cutover.
4. Preserve production data. Never run destructive recovery drills against the production project.

## Deliberate Boundaries

The private `aevum-assets` bucket and canonical asset registry exist, but Studio upload and signed-download flows are
not yet production implementations. Original bytes must not be accepted until MIME, byte limits, hashing,
quarantine, provenance, and atomic registration are connected. Blender remains a local/private execution backend;
Railway must report Blender-dependent tools unavailable rather than pretending to execute them.
