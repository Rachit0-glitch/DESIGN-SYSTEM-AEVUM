# @aevum/studio

## Responsibility

Inspection and control interface for projects, documents, previews, validation overlays, export configuration, and job status.

## What It Owns

User-facing inspection workflows and expert correction surfaces.

## What It Must Not Own

Own canonical state or bypass the Command Engine.

## Allowed Dependencies

Public package APIs, command contracts, MCP/API clients, and preview/runtime packages.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
