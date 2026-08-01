# @aevum/renderer-3d

## Responsibility

Browser 3D runtime contracts, scene loading, camera/lighting/material runtime, and deterministic 3D capture support.

## What It Owns

3D runtime interpretation of canonical scene data.

## What It Must Not Own

Depend on exporters or treat runtime scenes as source of truth.

## Allowed Dependencies

scene-runtime, document-model, assets, animation, shared.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
