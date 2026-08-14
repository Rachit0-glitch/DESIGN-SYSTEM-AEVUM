# AEVUM Studio

Production Studio restores a Supabase user session, discovers or bootstraps an authorized project through the API,
reads its Canonical Design Document through MCP, and performs supported edits through MCP dry-run and Command
Engine persistence. Browser storage is a recovery cache only and never replaces production canonical state.

The 3D workspace is loaded on demand. Development mode retains the explicit deterministic fixture used by tests;
production fails closed when its public Supabase/API/MCP configuration is absent. The browser bundle must contain
only the Supabase anonymous key, never a service-role key. Current limitations and release gates are recorded in
[Production Readiness](../../docs/PRODUCTION_READINESS.md).
