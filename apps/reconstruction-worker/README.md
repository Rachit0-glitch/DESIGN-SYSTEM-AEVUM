# @aevum/reconstruction-worker

## Responsibility

The Phase 6 Reconstruction Worker orchestrates one reconstruction job in memory. Domain contracts remain in
`@aevum/reconstruction`; this app owns job validation, stage execution, cancellation, structured logging, Scene Runtime
projection, Render Graph compatibility checks, and final result assembly.

## Job Lifecycle

```text
VALIDATE_TASK -> LOAD_REFERENCE -> ANALYZE_REFERENCE -> BUILD_PROPOSAL -> VALIDATE_PROPOSAL
-> GENERATE_COMMANDS -> DRY_RUN -> APPLY_TRANSACTION -> PROJECT_SCENE
-> BUILD_RENDER_GRAPH -> CREATE_REPORT -> COMPLETE
```

`createReconstructionWorker()` accepts a configured reconstruction engine, optional logger, stage callback, and clock.
`execute()` accepts a runtime-validated job and optional `AbortSignal`. Stage events and logs contain identifiers,
status, diagnostic counts, and durations; assets, provider payloads, and secrets are never logged.

The worker applies only the proposal's deterministic Command Engine transaction. It then projects the resulting
Canonical Design Document in diagnostic mode and builds a renderer-independent Render Graph. Verification failures are
reported and never trigger corrective mutation.

## Deployment Policy

This is intentionally an in-memory testable runtime. It has no queue intake, long-running process, health endpoint, or
start command, so no Railway reconstruction-worker service is activated in Phase 6. A future deployment requires a real
queue contract, useful continuous runtime, health behavior, cancellation propagation, and persistence adapter.

## Current Limitations

No Redis, Supabase persistence, uploads, external AI calls, OCR, segmentation engines, pixels, visual comparison, or
automatic correction are implemented. Those capabilities must integrate through the existing provider-neutral and job
boundaries.

See `../../docs/04_RECONSTRUCTION_PIPELINE.md` and `../../docs/11_ROADMAP_AND_STATUS.md`.
