# @aevum/api

## Responsibility

Project, asset, job, export, version, and report API surface for Studio and external callbacks.

## What It Owns

HTTP/API orchestration and metadata access.

## What It Must Not Own

Own rendering, reconstruction, export logic, or canonical document mutation.

## Allowed Dependencies

Contracts, project store, job system, telemetry, sandbox where required.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
