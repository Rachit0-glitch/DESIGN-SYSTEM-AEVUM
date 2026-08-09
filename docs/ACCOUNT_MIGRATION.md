# AEVUM Account Migration Runbook

## Purpose

This runbook preserves the operational state required to move the AEVUM AI Reconstruction Engine from the current
provider accounts to a new owner without exposing credentials or interrupting the source deployments before the
replacement stack is validated.

The Canonical Design Document, project history, assets, audit records, and all future state must remain recoverable.
Never commit provider tokens, Supabase keys, passwords, JWT secrets, database URLs, or downloaded environment files.

## Migration State

Prepared on 2026-08-09 from Git commit `d08c380be34d8852f2e8b1564fa18de27d91b886`.

### GitHub

- Source: `designerswebsite0-cpu/DESIGN-SYSTEM-AEVUM`
- Target: `Rachit0-glitch/DESIGN-SYSTEM-AEVUM`
- Source default branch: `main`
- Source and local `main` commit: `d08c380be34d8852f2e8b1564fa18de27d91b886`
- Target repository state during preparation: empty
- GitHub Actions repository secrets: none
- GitHub Actions repository variables: none

A verified local Git bundle containing the complete repository history exists in the account-migration recovery
backup. Keep the source repository available as the rollback remote until the new deployments pass every gate below.

### Supabase

- Source project: `Design-System-Aevum`
- Source project reference: `iauyxyccwbbwwamkjeeh`
- Region: `ap-northeast-1`
- PostgreSQL major version: 17
- Applied migrations: `20260801174219`, `20260802000100`, `20260809000100`
- Storage bucket: private `aevum-assets`
- Preparation inventory: zero Auth users, zero storage objects, zero canonical workspaces/projects/documents/versions,
  zero idempotency records, and 35 MCP audit records

The committed migrations are the canonical schema source. A secret-free REST data snapshot preserves the remaining
audit records. A native `supabase db dump` may be captured as an additional check when Docker Desktop is running, but
the migration is not dependent on that dump because no user, project, document, or asset content exists at this
checkpoint.

### Railway

- Source workspace: `designerswebsite0-cpu's Projects`
- Project: `DESIGN-SYSTEM-AEVUM`
- Project ID: `255a9851-3737-4e11-98ae-1b56238d1d09`
- Environment: `production`
- Environment ID: `32474699-b721-4abe-b695-34883706f193`
- `@aevum/api`: online at `https://aevumapi-production.up.railway.app`
- `mcp-server`: online at `https://mcp-server-production-ead2.up.railway.app`
- `@aevum/blender-bridge`: inactive/failed and must remain inactive until its owning phase

The MCP deployment uses `apps/mcp-server/railway.toml`. Recreate services in the target Railway account rather than
disconnecting the source project first.

Required MCP variable names to recreate are:

```text
AEVUM_RUNTIME_MODE
AEVUM_SERVICE
MCP_ALLOWED_ORIGINS
MCP_AUTH_MODE
MCP_DEPLOYMENT_VERSION
MCP_SERVER_HOST
MCP_TRUST_PROXY
NODE_ENV
SUPABASE_ANON_KEY
SUPABASE_JWT_SECRET
SUPABASE_PROJECT_ID
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
SUPABASE_URL
```

Railway-provided `RAILWAY_*` variables must not be copied manually. Supabase credentials must come from the new
Supabase project, not from the old project.

### Vercel

- Source account: `designerswebsite0-5411`
- Project: `design-system-aevum`
- Project ID: `prj_JPrYrbNxlAj6BJmv1RRwDMVqiy8V`
- Production alias: `https://design-system-aevum.vercel.app`
- Framework preset: Other
- Build command: `pnpm --filter '@aevum/studio...' run build`
- Output directory: `public`
- Node.js: 24.x
- Project environment variables during preparation: none
- Project-wide Vercel SSO protection: disabled

Create and validate a target-account deployment before moving or removing the production alias.

## Cutover Order

1. Switch GitHub CLI to `Rachit0-glitch`, push the complete `main` history to the empty target repository, and verify
   the local, source, and target commit hashes match.
2. Keep the old GitHub repository configured as a read-only rollback remote.
3. Create the new Supabase project, preferably in `ap-northeast-1`, link the CLI, and run `supabase db push` from the
   committed migrations.
4. Verify RLS, grants, schema versions, the private `aevum-assets` bucket, and the MCP atomic commit function.
5. Import the preserved data snapshot only after the new schema passes validation. Recheck row counts and storage
   object checksums.
6. Create the target Railway project and services. Configure variables through the Railway CLI without printing
   values. Use credentials issued by the new Supabase project.
7. Deploy and validate Railway `/health`, `/ready`, `/version`, authenticated MCP read/write, idempotency, workspace
   isolation, authorization, audit, restart persistence, CORS, limits, headers, rate limiting, redaction, and errors.
8. Create the target Vercel project from the new GitHub repository with the recorded build settings. Validate its
   production deployment before changing aliases.
9. Update allowed origins and any service URLs, then run `pnpm validate`, `pnpm validate:docker`, the production MCP
   smoke, and endpoint checks against the replacement stack.
10. Observe the replacement stack before retiring the source deployments. Rotate all old provider credentials only
    after rollback is no longer required.

## Rollback

Until cutover is accepted:

- Do not delete or transfer the source GitHub repository.
- Do not remove the source Supabase project or storage bucket.
- Do not stop the source Railway API or MCP service.
- Do not remove the source Vercel production project or alias.
- Do not overwrite local `.env` or `.env.local`; write target values only after the target resources exist and preserve
  the source values in the provider dashboards until credential rotation.

If a target validation gate fails, direct clients back to the source URLs and continue diagnosing the target. No
canonical writes should be allowed against both stacks simultaneously after production traffic is switched.

## Completion Gate

The account migration is complete only when:

- Git history and commit hashes match on the target repository.
- Supabase migrations, row counts, Auth state, storage objects, policies, and RPC behaviour match the source snapshot.
- Railway API and MCP services are online and pass restart validation.
- Vercel production deployment is ready and the intended alias resolves to it.
- Environment variables reference only target provider resources.
- Full repository and production smoke validation pass.
- Source providers remain available through the agreed rollback window.
- Old credentials are rotated or revoked after final acceptance.
