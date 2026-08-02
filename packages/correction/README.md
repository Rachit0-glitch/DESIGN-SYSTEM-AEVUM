# @aevum/correction

`@aevum/correction` implements the bounded Autonomous 2D Correction Loop. It consumes immutable Phase 7 validation
evidence, generates deterministic candidates, compiles approved candidates into one Command Engine transaction,
dry-runs the transaction, evaluates a revalidated tentative document, and commits only measurable non-regressive
improvements.

## Public API

- `createCorrectionSession(input)` creates an immutable, versioned session tied to an exact document and validation
  report.
- `generateCorrectionCandidates(input)` ranks safe corrections and records protected, unsupported, low-confidence,
  missing-node, hierarchy, and content-change rejections.
- `compileCorrectionTransaction(input)` merges compatible candidates by node and emits deterministic `node.update`
  commands in one atomic transaction.
- `dryRunCorrection(plan, document)` executes the complete transaction against immutable state without publishing it.
- `applyCorrection(plan, document, evaluation)` repeats the dry run and commits only an accepted evaluation.
- `evaluateCorrection(input)` enforces score improvement, worst-region, protected-region, typography, layout,
  confidence, document-validity, and critical-issue rules.
- `createCorrectionReport(input)` records pass history, accepted and rejected corrections, improvement, regressions,
  diagnostics, final score, and stop reason.
- `createCorrectionEngine(options)` runs the bounded render-revalidate-accept loop through a replaceable revalidation
  adapter.

Runtime schemas and serializers are exported for sessions, passes, candidates, transaction plans, evaluations, and
reports.

## Session Lifecycle

```text
CREATED
-> RUNNING
-> candidate generation
-> atomic dry run
-> candidate revalidation
-> ACCEPTED or REJECTED pass
-> next bounded pass or stop
-> COMPLETED or FAILED
```

The loop stops on threshold success, no safe candidates, no measurable improvement, regression, transaction failure,
or `maxPasses`. A plateau is never reported as success unless the validation threshold is actually reached.

## Protected State

Locked nodes are always protected. Sessions may protect a property globally or on one node, including position, size,
spacing, typography, color, border, radius, shadow, gradient, asset placement, visibility, opacity, hierarchy, or the
whole node. Hierarchy changes and text-content replacement are never generated in Phase 8. Protected regions must
remain byte-for-byte equivalent at the validation-result level.

## Transaction Safety

The correction package never modifies object fields directly. Every accepted change is a validated `node.update`
Command Engine command. Compilation rejects conflicting fields. Dry-run and commit each use a fresh atomic
transaction; any execution failure rolls the transaction back to its input document. A revalidation rejection never
reaches commit.

## Boundaries

The core package depends on `command-engine`, `document-model`, `validation`, `shared`, and Zod. Rendering and Scene
Projection remain worker concerns. Creative redesign, missing-content invention, unbounded loops, direct canonical
mutation, networking, and deployment are outside this package.

## Canonical References

- `../../AGENTS.md`
- `../../docs/04_RECONSTRUCTION_PIPELINE.md`
- `../../docs/06_ANIMATION_AND_RENDERING.md`
- `../../docs/09_VISUAL_VALIDATION.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
