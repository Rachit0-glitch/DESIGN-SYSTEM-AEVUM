# @aevum/agent-worker

Inactive Phase 13 application shell for bounded AI Agent orchestration. The in-memory API validates a session-scoped
job, records the required worker stages, invokes Agent Runtime, exposes health/readiness/version server factories, and
supports cancellation and graceful shutdown.

There is intentionally no Railway manifest, network job-ingress route, queue listener, or automatic server startup.
The worker must remain undeployed until production authentication, durable persistence, queue ownership, production
provider policy, smoke tests, and deployment gates are completed. Existing API, MCP, Vercel, Supabase, and Blender
service state is not changed by this package.
