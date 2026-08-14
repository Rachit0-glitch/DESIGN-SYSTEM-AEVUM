# AEVUM API

The production API is a deliberately narrow authenticated bootstrap service for AEVUM Studio. It verifies a
Supabase access token server-side, resolves memberships and accessible projects, and atomically creates a user's
first workspace/project/document when requested. It does not mutate existing canonical documents; MCP and the
Command Engine remain the write path.

Endpoints are `GET /health`, `GET /ready`, `GET /version`, and authenticated `GET|POST /v1/bootstrap`. Production
requires explicit `API_ALLOWED_ORIGINS`, bounded payload/rate/timeout settings, and server-only Supabase service-role
credentials. See [Production Readiness](../../docs/PRODUCTION_READINESS.md).
