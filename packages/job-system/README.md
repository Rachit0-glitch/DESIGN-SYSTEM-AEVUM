# @aevum/job-system

## Responsibility

Job definitions, queues, retries, progress, cancellation, leases, checkpoints, and failure classification.

## What It Owns

Long-running work orchestration contracts.

## What It Must Not Own

Own domain-specific reconstruction, render, or export logic.

## Allowed Dependencies

shared, telemetry.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
