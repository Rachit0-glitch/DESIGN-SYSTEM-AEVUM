# @aevum/asset-worker

## Responsibility

Asset hashing, extraction, derivative generation, optimization, texture-map tasks, and preservation checks.

## What It Owns

Asset processing jobs and derivative traceability.

## What It Must Not Own

Overwrite original assets or own project state.

## Allowed Dependencies

assets, job-system, sandbox, telemetry, shared.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
