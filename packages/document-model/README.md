# @aevum/document-model

## Responsibility

Canonical Design Document schemas, IDs, serialization contracts, validation, and migrations.

## What It Owns

Renderer-independent canonical project representation.

## What It Must Not Own

Depend on renderers, exporters, Studio, MCP server, project store, or command engine.

## Allowed Dependencies

shared and schema validation libraries only.

## Current Status

`IMPLEMENTED`. Schema `1.3.0` includes the typed responsive override contract from Phase 9 plus canonical timelines,
tracks, clips, keyframes, triggers, events, easing, and state machines for Phase 10. Migrations remain lossless from
`1.0.0`, `1.1.0`, and `1.2.0`.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/03_DESIGN_DOCUMENT_MODEL.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
