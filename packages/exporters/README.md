# @aevum/exporters

## Responsibility

Common exporter interfaces, capability reports, export plans, fallback reporting, and adapter registration.

## What It Owns

Shared exporter contracts and validation hooks.

## What It Must Not Own

Hard-code one target stack as the document model.

## Allowed Dependencies

document-model, scene-runtime, assets, validation, sandbox, shared.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
