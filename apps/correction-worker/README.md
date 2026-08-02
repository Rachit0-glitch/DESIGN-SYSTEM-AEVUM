# @aevum/correction-worker

This Phase 8 in-memory worker validates a correction job, creates the versioned session, and runs bounded correction
passes. Every tentative document is projected through Scene Runtime, converted into a Hybrid 2D Render Graph, and
revalidated through Phase 7 before the core engine may commit its Command Engine transaction.

The worker reports these stages:

```text
VALIDATE_JOB
CREATE_SESSION
RUN_CORRECTION_LOOP
CREATE_REPORT
COMPLETE
```

It supports cancellation and structured stage logging. It has no server, queue listener, start command, or active
Railway service. Deployment remains deferred until real queue, health, retry, and long-running cancellation contracts
exist.
