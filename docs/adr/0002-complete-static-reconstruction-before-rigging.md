# ADR-0002: Complete Static Multi-View Reconstruction Before Rigging/Character Deformation

## Status

ACCEPTED

## Context

The original roadmap sequence assigned "Rigging and Character Animation" to Phase 18, immediately
after Phase 17 (AI Multi-View 3D Reconstruction). Phase 17, as actually delivered, established
only the multi-view **evidence** architecture (reference sets, view roles, camera estimates,
landmarks, silhouettes, parts, constraints, coverage, readiness, cross-view validation, and a
provider-neutral reconstruction proposal) — it deliberately stopped above the model-generation
boundary and produced no candidate geometry.

Rigging, skinning, deformation, and character motion all require an actual mesh to operate on:
a skeleton has nothing to bind to, weights have no surface to paint, and deformation tests have no
geometry to deform without a real 3D model already existing. Starting Phase 18 as rigging would
therefore either (a) block immediately on missing input, or (b) tempt building rigging against a
throwaway placeholder mesh, which the project's own principles explicitly forbid ("Crude
primitives, proxy geometry, or low-quality topology must never be marked as finished professional
3D output" — `AGENTS.md`).

## Decision

Phase 18 is reassigned to **Multi-View 3D Reconstruction Execution**: the first real local
reconstruction provider that consumes Phase 17's evidence and proposal contracts and produces an
actual candidate mesh (box/cylinder primitive fitting and/or voxel visual-hull carving), scores it
against real cross-view evidence, runs a bounded non-regressing correction loop, and hands the
result to the existing Phase 14 (import) → Phase 15 (Blender Bridge) → Phase 16 (professional mesh
tooling) pipeline unchanged.

Rigging and Character Animation's full original scope and acceptance gate (skeleton creation, IK/
FK, facial controls, morph targets, automatic weights, weight correction, deformation tests, motion
retargeting, root motion, motion blending, lip sync, foot locking, contact/loop correction) is
preserved verbatim in `docs/11_ROADMAP_AND_STATUS.md` §24, under an explicit "Deferred: Original
Phase 18 Scope" heading. It is not deleted, shortened, or reworded — only moved out of the active
Phase 18 slot until a static reconstructed (or otherwise imported) model reliably exists to rig.

This ADR does not renumber Phases 19–31. The roadmap's numbering validator
(`scripts/validate-docs.ts`) requires Phases 0–30 to exist sequentially; a full renumbering to
insert a dedicated "reconstruction execution" phase ahead of rigging would cascade through every
subsequent phase for no architectural benefit. Reusing the Phase 18 slot — which was already
flagged as the natural next step in Phase 17's own roadmap evidence — is the minimal, explicit
adjustment. The exact numbered slot for Rigging and Character Animation is intentionally left as an
open sequencing decision for whoever plans the phase after the reconstruction-execution work
matures (see the roadmap's Phase 18 "Next action").

## Alternatives

- **Keep Phase 18 as Rigging and start it now against placeholder geometry.** Rejected: violates
  the project's explicit prohibition on treating placeholder/proxy geometry as finished output, and
  produces rigging work that would need to be redone once real reconstruction exists.
- **Renumber the whole roadmap to insert a new phase ahead of Rigging.** Rejected as unnecessary
  churn: every phase from 18 onward would shift, invalidating cross-references throughout the
  documentation set for no architectural gain over reusing the already-unclaimed Phase 18 slot.
- **Leave Rigging's scope undocumented ("just deferred") without preserving its content.** Rejected:
  the original scope and acceptance gate represent real prior planning work and must remain
  inspectable, not silently erased.

## Consequences

Phase 18 now delivers real, tested value (candidate geometry generation) that Phase 17 explicitly
left undone, closing the most significant gap between "AEVUM understands multi-view evidence" and
"AEVUM can act on it." Rigging is honestly deferred rather than started on unstable ground. The
roadmap carries one open sequencing question (where Rigging's number ultimately lands) that a
future phase-planning pass must resolve — this is recorded as an explicit warning, not silently
assumed.

## Migration Impact

No Canonical Design Document, Command Engine, or database migration is required. No existing
Phase 0–17 evidence, code, or roadmap status is altered. `packages/geometry-reconstruction` is
additive; Phase 17's `@aevum/multiview-reconstruction` package and its `MultiViewReconstructionProvider`
interface are unmodified.

## Related Specifications

- `docs/00_PROJECT_CONTEXT.md`
- `docs/02_SYSTEM_ARCHITECTURE.md`
- `docs/04_RECONSTRUCTION_PIPELINE.md`
- `docs/07_3D_ENGINE_AND_CINEMATICS.md`
- `docs/11_ROADMAP_AND_STATUS.md`
