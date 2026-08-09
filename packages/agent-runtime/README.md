# @aevum/agent-runtime

Phase 13 bounded orchestration runtime. It executes validated plans over the same typed MCP boundary used by external
agents, propagating authentication, workspace/project/document scope, correlation IDs, deterministic idempotency keys,
timeouts, retries, cancellation, and explicit approvals.

Write execution is dry-run first. Version conflicts refresh canonical state and trigger bounded replanning; stale writes
are never blindly retried. The runtime has no dependency on `apps/mcp-server`, Project Store, Supabase, Command Engine,
the filesystem, or shell execution. Tests use a replaceable in-process MCP transport adapter.
