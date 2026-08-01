# @aevum/reconstruction-worker

## Responsibility

Reference preprocessing, analysis, segmentation, inference, proposal creation, and command generation.

## What It Owns

Reconstruction job execution and inspectable proposal artifacts.

## What It Must Not Own

Write arbitrary document state directly.

## Allowed Dependencies

reconstruction, command-engine, document-model, assets, typography, validation, job-system, telemetry.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
