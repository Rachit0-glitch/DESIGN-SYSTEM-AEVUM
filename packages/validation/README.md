# @aevum/validation

`@aevum/validation` compares immutable Canonical Design Document, Scene Projection, Render Graph, and reference
evidence. It returns attributed differences, region scores, deterministic placeholder heatmaps, a versioned report,
and review-only correction proposals. It never mutates a document or executes a command.

## Public API

- `createValidationTask(input)` creates a deterministic, versioned task tied to an exact document, projection,
  Render Graph, viewport, renderer, reference, and threshold profile.
- `validateDesign(input)` validates identities, compares regions and structure, invokes a replaceable raster adapter,
  and creates the immutable report.
- `compareRegions(reference, document, projection, graph, profile)` measures layout, position, size, typography,
  visual metadata, assets, visibility, and opacity.
- `compareStructure(reference, document, projection, graph)` compares hierarchy, components, tokens, constraints,
  paint order, and Render Graph coverage.
- `buildHeatmap(reference, differences, type)` creates deterministic region-cell heatmap evidence.
- `generateCorrectionPlan(task, document, expectedNodes, differences)` emits review-only `node.update` proposals.
- `createValidationReport(input)` calculates aggregate and worst-region scores without hiding failed regions.
- `createValidationEngine(options?)` binds the public operations to an optional raster adapter.

Runtime schemas and serializers are exported for validation tasks, reference snapshots, reports, correction plans,
raster descriptors, diagnostics, and threshold profiles.

## Threshold Profiles

`DRAFT`, `STANDARD`, `HIGH_QUALITY`, and `PIXEL_PERFECT` are immutable, explicit, and versioned. They define numeric
tolerances and minimum overall, region, worst-region, layout, typography, asset, component, structure, and raster
scores. `PIXEL_PERFECT` permits no tolerance and requires every score to equal one.

## Raster Adapter

The local adapter deterministically calculates normalized RGBA mean absolute error when pixel buffers are supplied.
Without buffers it reports a checksum-only placeholder and never presents that fallback as a perceptual comparison.
The adapter interface can later host SSIM, LPIPS, and raster heatmap implementations without changing the engine API.

## Correction Boundary

Correction plans are always `executable: false`, `requiresCommandEngine: true`, tied to an expected document version,
and composed of validated `node.update` payloads. Unsupported or locked-node differences receive no automatic
suggestion. Phase 7 does not import the Command Engine because validation must not depend on state-mutating packages.

## Boundaries

The package depends only on `document-model`, `scene-runtime`, `renderer-2d`, `shared`, and Zod. It does not render
pixels, shape text, load remote assets, mutate canonical state, execute corrections, or implement an autonomous loop.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/01_PRODUCT_REQUIREMENTS.md`
- `../../docs/09_VISUAL_VALIDATION.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
