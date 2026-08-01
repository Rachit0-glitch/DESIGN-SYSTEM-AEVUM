# @aevum/render-worker

## Responsibility

Deterministic 2D, 3D, region, layer, animation-frame, sequence, and validation renders.

## What It Owns

Render job execution and reproducible render settings.

## What It Must Not Own

Own canonical state or validation scoring.

## Allowed Dependencies

document-model, scene-runtime, renderer-2d, renderer-3d, assets, typography, job-system, telemetry.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
