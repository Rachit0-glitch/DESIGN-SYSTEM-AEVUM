# @aevum/validation-worker

This Phase 7 in-memory orchestrator converts validated Phase 6 analysis and proposal evidence into a versioned
validation reference, projects the supplied Canonical Design Document, builds its Render Graph, creates a task with
exact fingerprints, and invokes `@aevum/validation`.

The worker reports these deterministic stages:

```text
VALIDATE_JOB
PROJECT_SCENE
BUILD_RENDER_GRAPH
CREATE_TASK
PREPARE_REFERENCE
COMPARE
CREATE_REPORT
COMPLETE
```

It supports cancellation and structured stage logging. It does not mutate state, execute correction proposals,
accept network requests, consume a queue, expose a start command, or activate a Railway service. Deployment remains
deferred until a real queue contract, health contract, and long-running runtime exist.
