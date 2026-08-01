# @aevum/document-model

## Responsibility

Canonical Design Document schemas, IDs, serialization contracts, validation, and future migrations.

## What It Owns

Renderer-independent canonical project representation.

## What It Must Not Own

Depend on renderers, exporters, Studio, MCP server, project store, or command engine.

## Allowed Dependencies

shared and schema validation libraries only.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/03_DESIGN_DOCUMENT_MODEL.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
