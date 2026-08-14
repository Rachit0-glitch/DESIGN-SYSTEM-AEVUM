# @aevum/mcp-protocol

## Responsibility

MCP tool schemas, resources, envelopes, errors, permissions, transactions, and version negotiation contracts.

## What It Owns

Model-vendor-independent MCP protocol contracts.

## What It Must Not Own

Own UI, renderer state, or canonical project state.

## Allowed Dependencies

document-model, command-engine, job-system, shared.

## Current Status

`IMPLEMENTED` for the Phase 12 protocol foundation.

## Protocol 1.0.0

The public package exports strict Zod contracts for:

- Version negotiation and compatibility metadata
- Request and response envelopes
- Structured errors and warnings
- Actors, roles, permissions, and auth modes
- Tool descriptors and dedicated input/output schemas
- Audit and idempotency records
- Transaction, job-progress, and cancellation foundations

Unknown envelope fields are rejected. Metadata is bounded and rejects keys that could carry credentials. Canonical
document, node, asset, timeline, command, and workspace types are imported from their owning packages rather than
redeclared here.

## Initial Tools

Read tools: `system.get_capabilities`, `project.get`, `document.get`, `document.get_version`,
`document.list_versions`, `document.inspect_hierarchy`, `asset.get`, and `timeline.get`.

Write tools: `document.rename`, `node.create`, `node.update`, and `node.delete`.

Phase 24 exposes these same registered tools to external clients through a stateless Streamable HTTP JSON-RPC
adapter at `/mcp`. The adapter translates standard `initialize`, `tools/list`, and `tools/call` requests into this
versioned protocol; it does not duplicate tool execution, authorization, audit, idempotency, or Command Engine logic.

Phase 14 adds tool contract version `1.1.0`: read tools `three.inspect_asset` and `three.inspect_scene`, plus the
dry-run and idempotency capable write tool `three.update_node_transform`. The tools use dedicated `three.read` and
`three.write` permissions in addition to the canonical asset/document permissions required by each operation.

This package defines contracts only. Authentication, authorization, persistence, and execution belong to
`@aevum/mcp-server`.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
