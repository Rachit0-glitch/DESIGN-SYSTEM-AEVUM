# @aevum/project-store

## Responsibility

Project persistence, document versions, snapshots, command logs, recovery, autosave, and locking.

## What It Owns

Durable project and version storage abstractions.

## What It Must Not Own

Own renderer, reconstruction, or exporter logic.

## Allowed Dependencies

document-model, command-engine, assets, shared, telemetry.

## Current Status

`IMPLEMENTED`. Phase 2 provides current project state, replay-based undo/redo, immutable snapshots, project locks,
workspace/open-document records, and persistence/autosave interfaces. Phase 12 adds a workspace-scoped production
Supabase repository for canonical projects, current documents, immutable versions, MCP audits, and idempotency.

## Public API

- `createProjectStore()` and `createWorkspace()`
- Command execution and atomic multi-command transactions
- Replay-based `undo()` and `redo()`
- Immutable snapshot creation and reading
- Project lock acquisition, inspection, and release
- `ProjectPersistenceAdapter` and `AutosaveController` interfaces
- `ProjectRepository`, `createInMemoryProjectRepository()`, and `createSupabaseProjectRepository()`
- Compare-and-swap document commits with atomic audit and idempotency persistence
- Empty, history, transaction, and rollback fixtures

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/03_DESIGN_DOCUMENT_MODEL.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
