# @aevum/sandbox

## Responsibility

Execution isolation, resource limits, network restrictions, export builds, and untrusted code handling.

## What It Owns

Sandbox policy and temporary workspace lifecycle contracts.

## What It Must Not Own

Own project state or exporter target semantics.

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
