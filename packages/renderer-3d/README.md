# @aevum/renderer-3d

## Responsibility

`@aevum/renderer-3d` owns safe inspection of registered GLB and GLTF assets, reviewable canonical import proposals,
deterministic camera utilities, and renderer-neutral 3D Render Plans.

## Public API

- `inspect3DAsset()` validates registered asset identity, parses real GLB/GLTF bytes, enforces
  resource limits, and returns immutable diagnostics and metrics.
- `create3DImportProposal()` and `validate3DImportProposal()` normalize scenes, nodes, primitives, PBR materials,
  embedded texture derivatives, cameras, lights, transforms, bounds, and provenance.
- `compile3DImportTransaction()`, `dryRun3DImportProposal()`, and `apply3DImportProposal()` use the Command Engine's
  atomic `scene3d.import` command.
- `calculateLookAtQuaternion()`, `frameCameraToBounds()`, and `selectCamera()` are deterministic camera utilities.
- `create3DRenderPlan()` converts a Scene Runtime 3D projection into ordered renderer-neutral operations.

## Canonical Conventions

Imported glTF data resolves to right-handed, Y-up, negative-Z-forward, meter, radian, XYZW quaternion, TRS canonical
records. Original source assets are immutable. Embedded images become hashed and deduplicated derivative assets with
source-asset and source-index provenance. One canonical `MESH_3D` is created per glTF primitive so each draw unit is
independently addressable.

## Security And Determinism

The parser never fetches network resources and rejects absolute, backslash, traversal, malformed, missing, or
over-limit input. Limits cover bytes, nodes, meshes, primitives, vertices, textures, texture bytes, and hierarchy
depth. Stable IDs and fingerprints derive from registered source identity and normalized indexes rather than names.

## Boundaries

This package does not implement GPU rendering, Three.js or R3F objects, browser playback, uploads, model editing,
retopology, UV editing, rigging, physics, reconstruction, Blender execution, or visual comparison. Unsupported glTF
features remain visible through structured diagnostics.

## Allowed Dependencies

Scene Runtime, Document Model, Assets, Animation Core, Command Engine, Shared, glTF Transform, gl-matrix, and Zod.

## Status

`IMPLEMENTED` for the Phase 14 canonical 3D foundation.

## Canonical References

- `../../AGENTS.md`
- `../../docs/03_DESIGN_DOCUMENT_MODEL.md`
- `../../docs/06_ANIMATION_AND_RENDERING.md`
- `../../docs/07_3D_ENGINE_AND_CINEMATICS.md`
- `../../docs/08_MCP_SPECIFICATION.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
