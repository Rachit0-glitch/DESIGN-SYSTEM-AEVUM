# @aevum/preview-runtime

## Responsibility

Isolated interactive and deterministic preview runtime for validation, export preview, and browser checks.

## What It Owns

Preview bootstrapping and runtime hosting.

## What It Must Not Own

Own canonical state, command execution, or export adapter policy.

## Allowed Dependencies

scene-runtime, renderer-2d, renderer-3d, animation, assets, telemetry.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
