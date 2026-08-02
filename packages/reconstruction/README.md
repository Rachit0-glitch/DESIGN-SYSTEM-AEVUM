# @aevum/reconstruction

## Responsibility

`@aevum/reconstruction` owns the deterministic Phase 6 data layer that converts a registered visual reference into
an inspectable analysis, immutable reconstruction proposal, ordered Command Engine transaction, and versioned report.
It never mutates a Canonical Design Document directly.

## Public API

- `createReconstructionTask()` and `validateReconstructionTask()` create versioned, runtime-validated task contracts.
- `analyzeReference()` produces source-pixel regions, candidates, confidence, provenance, and diagnostics.
- `createReconstructionProposal()` and `validateReconstructionProposal()` create and validate editable canonical nodes.
- `generateReconstructionCommandPlan()` returns the proposal's deterministic dependency-ordered command plan.
- `dryRunReconstructionProposal()` validates the complete transaction without publishing state.
- `applyReconstructionProposal()` applies one atomic Command Engine transaction to a new or explicitly versioned document.
- `createReconstructionReport()` records analysis, proposal, transaction, projection, and Render Graph verification summaries.
- `createReconstructionEngine()` binds a provider-neutral asset resolver, adapters, and limits behind one immutable facade.
- Versioned Zod schemas, serializers, interfaces, and annotated fixtures are exported for adapters and tests.

## Lifecycle

```text
Registered asset -> task -> analysis -> proposal -> validation -> command plan -> dry run -> atomic apply -> report
```

Analysis uses a replaceable `ReconstructionAdapters` contract. The built-in Phase 6 adapter reads a validated
`aevum.reconstruction.manifest` annotation attached to asset metadata. If no manifest exists, it reports the missing
capability and proposes an explicit full-reference raster fallback. It does not claim to perform computer vision.

Proposal nodes preserve top-left source-pixel and normalized bounds, source-region links, analyzer identity,
confidence, and fallback status. Original assets remain immutable. Repeated structures and exact repeated values are
suggested as components and tokens but are not applied until canonical command paths exist.

## Determinism

Region IDs, analysis/proposal/command-plan fingerprints, entity IDs, command IDs, transaction IDs, ordering, and
diagnostic ordering derive only from output-affecting inputs. Timestamps and stage durations are excluded from
deterministic fingerprints. Analyses, proposals, plans, application results, and reports are deeply frozen.

## Confidence And Diagnostics

Confidence uses `HIGH`, `MEDIUM`, `LOW`, and `UNKNOWN` labels. Typography remains `UNKNOWN` unless a future approved
matcher supplies evidence. Structured diagnostics cover source state and security, unavailable analysis capabilities,
ambiguous structure, fallbacks, limits, invalid proposals, dry-run failure, transaction failure, and cancellation.

## Boundaries And Limitations

The package depends on assets, typography contracts, the Canonical Design Document, and the Command Engine. It does
not depend on Scene Runtime, the renderer, Supabase, browser APIs, or provider SDKs. Phase 6 does not implement OCR,
production segmentation, vector tracing, extracted image generation, responsive variants, visual comparison, or AI
provider calls. Future providers replace adapters without changing the public task, analysis, proposal, or report APIs.

See `../../docs/04_RECONSTRUCTION_PIPELINE.md` and `../../docs/11_ROADMAP_AND_STATUS.md`.
