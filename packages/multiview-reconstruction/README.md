# @aevum/multiview-reconstruction

The Phase 17 Multi-View 3D Reconstruction Foundation. This package establishes the evidence and
reasoning architecture required to treat several 2D reference images (front, back, left, right,
top, three-quarter, detail, ...) as views of **one shared physical object**, and to honestly assess
whether that evidence is sufficient for a future 3D reconstruction provider to attempt a model.

It does **not** generate a mesh, GLB, or any 3D geometry. It stops at a provider-neutral
`MultiViewReconstructionProposal` and a replaceable `MultiViewReconstructionProvider` interface;
model generation is explicitly out of scope until a later phase.

## Public API

- `createMultiViewTask()` creates an immutable, versioned analysis request from reference assets,
  optional role/landmark/part/scale hints, and bounded resource limits.
- `buildMultiViewReferenceSet()` runs view-role classification, camera estimation, silhouette
  normalization, landmark triangulation, part correspondence, geometric-constraint derivation,
  coverage analysis, and readiness scoring.
- `validateMultiView()` produces a cross-view consistency report independent from Phase 7's 2D
  pixel validation.
- `createReconstructionProposal()` builds the provider-neutral contract a future reconstruction
  provider would consume.
- `createDeterministicMockProvider()` proves the provider interface is implementable without
  shipping any real reconstruction system.
- `analyzeMultiView()` composes all of the above into one immutable `MultiViewAnalysisReport`.

## Architecture

```text
Reference Images (registered assets)
  -> View Roles (user-stated or explicitly UNKNOWN; never guessed)
  -> Camera Estimates (role-assumed turntable geometry, or UNKNOWN)
  -> Silhouette Evidence (caller-supplied contour + real shoelace-formula statistics)
  -> Landmark Observations -> Least-Squares Ray Triangulation -> Reprojection Error
  -> Part Evidence & Cross-View Correspondence
  -> Geometric Constraints (silhouette-derived dimensions, bounding-box symmetry proxy)
  -> Coverage Analysis -> Reconstruction Readiness -> Conflict Detection
  -> Cross-View Validation Report
  -> Provider-Neutral Reconstruction Proposal
  -> MultiViewReconstructionProvider (replaceable; Phase 17 ships a deterministic test double only)
```

Everything above the provider boundary is real, deterministic, provider-independent computation:
vector/quaternion algebra, perspective ray casting, least-squares multi-view triangulation,
reprojection error, shoelace-formula silhouette statistics, and constraint/coverage/readiness
scoring. Nothing below the provider boundary — real computer vision, segmentation, camera pose
estimation from pixels, or mesh generation — is implemented; those integrate later behind the
unchanged `CameraEstimator`, `SilhouetteProvider`, and `MultiViewReconstructionProvider`
interfaces.

Future candidate geometry from a real provider must still flow through Phase 14 inspection, Phase
15 Blender Bridge execution, and Phase 16 professional mesh processing exactly as any other
imported asset would — this package never talks to Blender or the Command Engine directly.

## Honesty boundaries

- View roles with no supplied hint are classified `UNKNOWN`, never guessed.
- Camera estimates come only from an explicit, disclosed turntable **assumption** tied to a
  resolved role (`method: "ROLE_ASSUMED_TURNTABLE"`, confidence capped at 0.6) or from an
  explicit `UNKNOWN` when no assumption applies (`DETAIL`/`UNKNOWN` roles). There is no real
  camera-pose-from-pixels estimation.
- Silhouettes require a caller-supplied contour (`method: "MANIFEST_PROVIDED"`); there is no real
  background-removal or segmentation model.
- The bounding-box symmetry proxy is disclosed as an approximation, not true contour-matching
  symmetry detection.
- `createDeterministicMockProvider()` never returns a candidate geometry asset and labels its own
  output as a test fixture, not an AI-generated reconstruction.

## Current Limits

No real vision provider, no external reconstruction API, no paid model-generation dependency, and
no new user-side credential are introduced by this package. Landmark and part correspondence rely
entirely on caller-supplied hints (typically from a human reviewer or an upstream Agent step) —
there is no automatic point-matching across images. Occlusion is recorded from supplied visibility
metadata, not inferred from pixels.
