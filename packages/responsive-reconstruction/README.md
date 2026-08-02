# Responsive Reconstruction

`@aevum/responsive-reconstruction` owns deterministic, evidence-aware responsive proposals for the Canonical Design
Document. It generates editable breakpoint, container-query, orientation, reduced-motion, camera, asset-crop, and
quality-profile overrides; compiles them into one atomic Command Engine transaction; and verifies each target through
Scene Runtime, the Hybrid 2D Renderer, and Visual Validation.

The engine never treats mobile as a scaled desktop copy. Its local inference adapter uses semantic layout changes,
readable typography floors, focal-point crops, content priority, protected properties, and explicit reference evidence.
It never invents text or assets and never mutates canonical state directly.

## Public API

- `createResponsiveReconstructionTask()`
- `generateResponsiveProposal()`
- `compileResponsiveTransaction()`
- `dryRunResponsiveProposal()`
- `applyResponsiveProposal()`
- `validateResponsiveVariants()`
- `createResponsiveReport()`
- `createResponsiveReconstructionEngine()`

See `docs/03_DESIGN_DOCUMENT_MODEL.md`, `docs/04_RECONSTRUCTION_PIPELINE.md`, and
`docs/11_ROADMAP_AND_STATUS.md` for canonical requirements and status.
