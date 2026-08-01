# @aevum/export-worker

## Responsibility

Export planning, adapter execution, build verification, render verification, packaging, and export reports.

## What It Owns

Export job orchestration and sandboxed target generation.

## What It Must Not Own

Invent target-specific source of truth or mutate documents outside commands.

## Allowed Dependencies

exporters, document-model, scene-runtime, validation, sandbox, job-system, telemetry.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
