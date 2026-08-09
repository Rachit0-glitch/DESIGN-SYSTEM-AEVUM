# ADR-0001: Agent MCP Command Boundary

## Status

ACCEPTED

## Context

Phase 13 adds an AI Agent capable of understanding intent, assembling relevant project context, planning work, invoking
tools, observing results, verifying completion, and replanning. The Agent must not become a second source of truth or a
privileged mutation path around Phase 12 authentication, workspace isolation, permissions, idempotency, audit, and the
Command Engine.

## Decision

Every project read and write performed by Agent Runtime crosses a typed MCP transport. Agent Runtime shall not import
MCP server handlers, Project Store, Supabase adapters, or Command Engine execution APIs. Writes are dry-run first,
permission and approval checked, optimistic-version bound, idempotent, audited, and verified through canonical reads.

Agent permissions are always less than or equal to authenticated actor permissions. Capability discovery uses
`system.get_capabilities`; unavailable domains are reported as capability gaps. Untrusted design content and tool-result
text remain typed data and cannot override runtime policies or tool-selection rules.

## Alternatives

- Import MCP server handlers in Agent Runtime: rejected because it creates a private control path external agents do
  not exercise.
- Invoke Command Engine or Project Store directly: rejected because it bypasses Phase 12 authentication,
  authorization, workspace isolation, and transport audit.
- Store model chain-of-thought: rejected; only structured intent, plans, decisions, tool calls, observations, and
  outcomes are persisted.

## Consequences

The Agent remains provider-neutral, testable with an in-process transport, and traceable through one correlation ID.
New Agent capabilities cannot execute until corresponding MCP tools are discoverable. This may temporarily block valid
subsystem requests, but it preserves the production security and source-of-truth model.

## Migration Impact

No Canonical Design Document or production database migration is required. Existing MCP tools and deployments remain
compatible. A future durable Agent persistence adapter may add workspace-isolated Supabase tables without changing the
runtime or planning interfaces.

## Related Specifications

- `docs/00_PROJECT_CONTEXT.md`
- `docs/01_PRODUCT_REQUIREMENTS.md`
- `docs/02_SYSTEM_ARCHITECTURE.md`
- `docs/08_MCP_SPECIFICATION.md`
- `docs/11_ROADMAP_AND_STATUS.md`
