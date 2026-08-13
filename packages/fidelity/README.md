# @aevum/fidelity

Cross-domain Maximum Fidelity measurement and bounded convergence for AEVUM. The package consumes canonical runtime
projections and render graphs, produces real raster evidence, and reuses Validation and Phase 8 Correction for
persistent changes. It never owns canonical state. See `docs/09_VISUAL_VALIDATION.md`.

## Public API

- Profiles and contracts: `resolveFidelityProfile()`, fidelity task/measurement/report schemas
- Raster: `createPlaywrightRasterBackend()`, `normalizeReference()`, `comparePixels()`, `buildPixelHeatmap()`
- Structure: `compareStructuralFidelity()` for bounds, crop, gradient, paint order, and line-break evidence
- Reference analysis: replaceable `ReferenceAnalysisAdapter` and deterministic local adapter
- Fonts: `rankFontCandidates()` using family and measured advance evidence
- Orchestration: `createFidelityEngine()`, `createFidelityTask()`, `prioritizeFidelityIssues()`
- Correction: `createPhase8FidelityBridge()` delegates atomic correction mechanics to `@aevum/correction`

## Determinism And Safety

Raster requests are dimension, pixel, node, time, font, and image bounded. Cache keys include document identity,
Render Graph fingerprint, viewport, quality, time, reduced motion, and raster configuration. Original assets are
resolved read-only. Reports distinguish score, coverage, confidence, provenance, and unsupported features.

## Current Limitations

Chromium and operating-system rasterization can vary across runtime versions, so reproducibility requires the pinned
browser/runtime recorded by the backend. Canvas supports browser-native shaping but is not a HarfBuzz replacement;
some OpenType feature and variable-axis behavior is browser dependent. Inset shadows, backdrop blur, arbitrary alpha
mask contours, complex boolean vectors, full color-profile conversion, local-window SSIM/LPIPS, OCR, external vision,
and rendered 3D/video comparison remain explicit unsupported or adapter-backed capabilities. No screenshot is used as
the final editable design.
