# @aevum/blender-bridge

## Responsibility

Controlled Blender operation execution for professional 3D workflows.

## What It Owns

Blender operation manifests, isolated execution, output inspection, and result registration handoff.

## What It Must Not Own

Treat Blender scenes as canonical state.

## Allowed Dependencies

document-model, assets, renderer-3d, sandbox, job-system, telemetry.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
