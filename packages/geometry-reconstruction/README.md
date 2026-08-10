# @aevum/geometry-reconstruction

The Phase 18 Multi-View 3D Reconstruction Execution package. This is the first place in AEVUM
that turns Phase 17's multi-view evidence (`@aevum/multiview-reconstruction`) into an actual
candidate 3D mesh — not a fixture, not a placeholder.

## What this is not

This is **not** general-purpose photoreal 3D reconstruction. It works best for:

- product-like, roughly convex objects
- bounded geometry with strong silhouette/landmark evidence
- clean multi-view sets (front/back/left/right/top and similar)

It does **not** yet handle characters, hair, cloth, organic anatomy, transparent objects, or
extreme occlusion — those remain later work. No external or paid reconstruction provider (Tripo,
Meshy, Rodin, Luma, Replicate, fal, or any photogrammetry service) is integrated; the only real
provider today is `LOCAL_BASELINE`.

## Pipeline

```text
Phase 17 MultiViewReferenceSet + MultiViewReconstructionProposal
  -> evidence-sufficiency gate (readiness INSUFFICIENT -> BLOCKED, no fabricated geometry)
  -> candidate generation
       - one box per Phase 17 Part (preserves part identity) OR one root box
       - an alternative cylinder candidate only when the TOP silhouette is genuinely round
         and symmetry evidence supports it
       - a voxel visual-hull candidate (real multi-view silhouette-volume intersection) when
         2+ calibrated silhouette views exist
  -> real cross-view scoring per candidate
       - silhouette IoU/precision/recall via rasterized polygon overlap
       - Chamfer boundary distance and centroid/area difference
       - landmark-to-surface distance (closest-point-on-triangle)
       - constraint satisfaction against Phase 17's silhouette-derived dimensions
       - a local structural-validity check (finite coordinates, no degenerate triangles,
         bounded triangle count) — NOT a claim of real Blender/manifold topology validation
  -> deterministic best-candidate selection
  -> bounded, non-regressing correction loop (box/cylinder dimension local search only;
     multi-part and voxel-hull candidates are not yet corrected)
  -> GLB export (`@gltf-transform/core`)
  -> asset registration (GENERATED origin, full multi-parent provenance) [separate call]
  -> Command Engine plan: `asset.register` + `scene3d.import` (Phase 14, unchanged) [separate call]
```

## Public API

- `runReconstructionSession()` — the full generate/score/correct pipeline; returns an immutable
  `ReconstructionSessionReport` plus the winning candidate's GLB bytes. Never touches a canonical
  document.
- `registerCandidateAsset()` / `buildCanonicalImportPlan()` — the explicit, separate steps that
  register the GLB and build (but never execute) the `asset.register` + `scene3d.import` commands.
- `createLocalBaselineProvider()` — the real provider; `createDeterministicTestProvider()` —
  Phase 17's own mock provider, re-exposed unchanged, for interface-compatibility testing.
- `listReconstructionProviders()` — the bounded provider registry (`LOCAL_BASELINE`,
  `DETERMINISTIC_TEST` only).

## Honesty boundaries

- Camera/dimension conversion is derived from Phase 17's disclosed turntable-radius assumption —
  results are relative to that assumption unless real scale evidence is present.
- The voxel visual hull is genuine silhouette-volume intersection; it inherits that method's
  well-known limitation (it cannot recover concavities no silhouette reveals). Its surface is a
  real per-voxel boundary-face mesh — explicitly not smooth marching-cubes output.
- "Topology validity" here is a local, provider-independent structural check. Real topology
  validation is Phase 16's Blender-backed `mesh.validate`/`mesh.topology_inspect`, invoked
  separately once a candidate is registered and imported (see `docs/11_ROADMAP_AND_STATUS.md`
  Phase 18 evidence for the real-Blender-gated proof of that handoff).
- `MultiViewReconstructionProvider` (Phase 17) is a synchronous, proposal-only interface. Real
  execution needs the full evidence set and an inherently async GLB export, so this package
  defines its own `GeometryReconstructionProvider` (evidence-plus-async) rather than forcing a
  real provider into an interface built for a deterministic mock. Phase 17's original interface
  and mock provider are untouched.
