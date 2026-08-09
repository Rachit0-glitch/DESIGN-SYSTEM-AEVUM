# Supabase Migrations

Tracked SQL migrations are the source of truth for hosted AEVUM schema changes.

`20260802000100_create_mcp_foundation.sql` adds Phase 12 MCP persistence and records logical schema version
`202608020001`. The MCP readiness endpoint requires that version before reporting ready.

The atomic commit function verifies the expected current document version, increments exactly once, writes the
current document and immutable version, records the audit event, and stores an optional idempotency response in one
database transaction. Client roles have no direct table or function privileges; the MCP service uses the Supabase
service role only after authentication and workspace authorization.

See `docs/MCP_DEPLOYMENT.md` for application and verification steps.
