# @aevum/renderer-2d

## Responsibility

Hybrid 2D rendering through DOM, CSS, SVG, Canvas, WebGL, and raster composition.

## What It Owns

2D render planning and deterministic 2D capture support.

## What It Must Not Own

Depend on exporters or own canonical state.

## Allowed Dependencies

scene-runtime, document-model, typography, vector-engine, assets, animation, shared.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
