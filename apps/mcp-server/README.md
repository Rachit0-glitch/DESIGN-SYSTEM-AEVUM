# @aevum/mcp-server

## Responsibility

MCP-compatible AI control interface for tools, resources, jobs, transactions, and structured errors.

## What It Owns

MCP request validation, authorization, command/job translation, and audit integration.

## What It Must Not Own

Mutate canonical project state directly or depend on Studio UI.

## Allowed Dependencies

mcp-protocol, command-engine, document-model, job-system, telemetry, shared.

## Current Status

`PHASE_0_SHELL`. This directory establishes ownership only. It is not a production implementation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
