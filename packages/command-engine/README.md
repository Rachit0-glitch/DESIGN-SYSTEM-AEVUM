# @aevum/command-engine

## Responsibility

Structured commands, command validation, transactions, undo/redo, change sets, and audit metadata.

## What It Owns

The only meaningful mutation path for canonical state.

## What It Must Not Own

Depend on Studio, renderers, exporters, or MCP server implementations.

## Allowed Dependencies

document-model, shared, telemetry contracts where needed.

## Current Status

`IMPLEMENTED`. Phase 2 provides versioned command schemas, dynamic registration, immutable execution, atomic transactions, change sets, replay support, structured errors, events, and audit records. See the roadmap for validation evidence.

## Public API

- Command schemas, command IDs, serialization, and runtime validation
- `registerCommand()`, `getCommand()`, and `listCommands()`
- `executeCommand()`, `beginTransaction()`, `commit()`, and `rollback()`
- Change sets, audit records, and publish-only command events
- `replayHistory()` for deterministic command replay

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/03_DESIGN_DOCUMENT_MODEL.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
