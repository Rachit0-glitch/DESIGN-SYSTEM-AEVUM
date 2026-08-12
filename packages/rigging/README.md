# @aevum/rigging

The Phase 19B rigging foundation package: canonical rig/skeleton/bone/skin/weight construction
and validation. This is the first place in AEVUM that represents an armature, a bone hierarchy, a
skin binding, or per-vertex skin weights as real, validated data — not a fixture, not a
placeholder.

## What this is not

This is **not** a production auto-rigging system. It does not attempt:

- professional character auto-rigging or facial rigging
- muscle simulation, cloth, or hair bones
- motion-capture cleanup or commercial-quality retargeting
- a visual rig editor (Studio)

Two deterministic templates (`MECHANICAL_CHAIN`, `BASIC_HUMANOID`) exist to prove the
architecture end-to-end, not as production rig generators. `BASIC_HUMANOID` in particular is an
architecture-test-only skeleton (no fingers, no facial bones, no twist bones) — see Phase 19B's
Honest Scope in `docs/11_ROADMAP_AND_STATUS.md`.

## What this owns

- **Bone hierarchy validation** (`hierarchy.ts`) — real cycle, self-parent, duplicate-key, and
  dangling-reference detection over a flat bone-spec list, plus a topological (parents-before-
  children) ordering safe for deterministic ID assignment and Blender edit-bone creation.
- **Weight validation and repair** (`weights.ts`) — sum-to-one, negative, NaN, out-of-range joint
  reference, excessive-influence, unweighted-vertex, and orphan-joint-group detection, plus
  deterministic normalization that never fabricates an influence for an unweighted vertex.
- **Node construction** (`node-builder.ts`) — builds real, schema-valid `RIG_3D`/`BONE_3D`
  `DesignNode`s from provider-neutral bone specs, with deterministic content-addressed IDs and a
  real head-to-tail alignment quaternion per bone (not a zeroed placeholder).
- **Deterministic templates** (`templates/`) — `MECHANICAL_CHAIN` (a configurable base→arm→
  forearm→tool chain) and `BASIC_HUMANOID` (a small branching hips/spine/arms/legs skeleton),
  both hierarchy-validated before being returned.
- **`AutoRigProvider`** (`provider.ts`) — the provider-neutral interface both templates implement.
  No paid or external rigging service is integrated.
- **Part-to-bone association** (`part-association.ts`) — literal (case-insensitive) label matching
  between Phase 18/19A reconstructed parts and bone keys, for rigging multi-part product models.
- **Rig validation reporting** (`validation.ts`) — combines hierarchy, resource-limit, rest-pose,
  constraint-target, and IK-chain-ancestry checks into one report.

- **Evaluated poses** (`pose.ts`) - immutable parent-before-child FK, mesh-relative joint matrices,
  bounded CCD IK, supported constraints, rest reset, structured diagnostics, and fingerprints.
- **Reference deformation** (`skinning.ts`, `deformation.ts`) - real CPU linear-blend position and
  normal deformation plus measurable bounds/displacement quality reports.
- **Professional bounded weights** (`weight-editing.ts`) - inspection and selected-vertex
  set/add/subtract/clear/normalize operations with hard resource limits.
- **Retargeting foundation** (`retarget.ts`) - explicit validated mappings and basic humanoid
  semantic mapping with unmapped-bone disclosure.

## What this does not own

Real Blender execution (`apps/blender-bridge`), canonical document mutation (`@aevum/command-
engine`), MCP transport, or Agent orchestration. This package produces validated data structures
and `DesignNode` objects; it never talks to Blender and never commits a document.

## Weight data is never duplicated into the canonical document

Per-vertex joint indices and weights live in the registered GLB/GLTF asset's own `JOINTS_0`/
`WEIGHTS_0` accessors — the same pattern already used for mesh geometry (a `GeometryReference`
never stores raw vertex arrays either). `SkinBinding` on a `MESH_3D` node stores only compact
metadata (joint list, influence limit, weight method, normalization status, vertex counts).
`weights.ts`'s validation/normalization functions operate on an explicit, in-memory-only
per-vertex influence table passed in by the caller — never on the canonical document.

## Rest and evaluated pose boundary

`BONE_3D.transform` is the immutable rest/bind transform. `evaluatePose()` creates regenerable
runtime state in the order rest -> animation/FK -> IK -> constraints. Scene Runtime consumes that
result before 3D render planning. Fixed-time evaluation never mutates the source document.

## Stabilized Blender round trip

The local Blender Bridge uses `aevum.rig_fingerprint` as durable identity, keeps armature parenting
acyclic, normalizes explicitly requested automatic weights, and exports a derived GLB. Renderer 3D
reimports real skin accessors and inverse-bind matrices; Command Engine reconciliation updates
canonical geometry to the derivative asset.
