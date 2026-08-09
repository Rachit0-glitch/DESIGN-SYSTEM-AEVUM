# @aevum/blender-bridge

Production local execution boundary for controlled Blender operations. Blender is an execution backend; the Canonical
Design Document remains authoritative.

## Runtime

Configure `BLENDER_EXECUTABLE_PATH` in the ignored local `.env`. The bridge validates the executable, launches a real
headless process, verifies embedded Python, fingerprints the binary, and classifies compatibility. Protocol `1.0.0`
is tested against Blender `5.1.2` with Python `3.13.9`.

```powershell
pnpm --filter=@aevum/blender-bridge build
node --env-file=.env apps/blender-bridge/dist/smoke.js
pnpm test:blender-real
```

## Execution Boundary

Each job receives a dedicated temporary workspace and a fresh Blender process. The bridge materializes only an
authorized registered asset, verifies its SHA-256 hash, rejects non-embedded GLB/GLTF resources, writes one internal manifest, launches Blender with
`--background --factory-startup --disable-autoexec`, collects bounded structured output, and removes the workspace.
The child environment is allowlisted and contains no application credentials.

The bridge-owned Python dispatcher supports only:

- `scene.inspect`, `scene.import_gltf`, `scene.export_glb`, `scene.validate`
- `object.inspect`, `object.transform`, `object.duplicate`, `object.delete`
- `mesh.inspect`
- `material.inspect`, `material.update_pbr`
- `camera.inspect`, `camera.update`, `camera.activate`
- `light.inspect`, `light.update`

Phase 16 extends that finite dispatcher with versioned `mesh.*`, `topology.*`, `uv.*`, `material.*`, and
`optimization.*` contracts. The production-tested paths cover topology inspection/validation, extrusion, inset,
bevel, applied subdivision, solidify, mirror, join and material separation, merge-by-distance, normal recalculation,
UV creation/unwrap/pack, PBR inspection and bounded updates, web-quality analysis, and decimation-based LOD output.
Every topology-changing operation receives an explicit selector where applicable and reports source/result counts plus
honest element-identity status.

`bridge.test_delay` is an internal test-only operation for timeout and cancellation verification. MCP does not expose
it. No Python, script, shell, operator, eval, exec, terminal, add-on, or arbitrary exporter-argument tool exists.

## Canonical Round Trip

Writes export a GLB derivative, recover `aevum.entity_id` metadata, build a reviewable reconciliation proposal, and
compile all permanent changes into one Command Engine transaction. A successful Blender process cannot partially
mutate the Canonical Design Document. Transform scalars are normalized to six decimal places after GLB float32
round trips; structural state is deterministic even when Blender-produced GLB bytes are not guaranteed identical.

Artifacts expose hashes, sizes, MIME types, provenance, and job-local logical paths. Physical temporary paths are not
part of the public protocol. Original assets are never overwritten.

## MCP and Agent

MCP tool version `1.3.0` exposes bounded `blender.*` tools plus Phase 16 reads `three.inspect_topology`,
`three.inspect_uv`, `three.validate_mesh`, `three.validate_material`, and `three.analyze_web_quality`, and writes
`three.bevel_mesh`, `three.unwrap_uv`, and `three.update_pbr_material`.
Tools remain registered but disabled unless a local `BlenderToolAdapter` is configured. Permissions are split across
`blender.read`, `blender.write`, `blender.destructive`, and `blender.export`. Dry runs validate manifests without
launching Blender. The deterministic Agent discovers these capabilities and uses inspect, dry-run, execute,
reconcile, and canonical verification steps.

## Phase 16 Capability Status

`IMPLEMENTED` and real-Blender tested: deterministic selectors; topology and UV reports; bounded growth rejection;
extrude; inset; bevel; applied subdivision; solidify; mirror; join; separation by material; normal recalculation;
UV-layer creation, unwrap, and packing; PBR validation/update round trip; targeted duplicate-vertex repair; web
quality analysis; decimation-based LOD; derivative persistence; canonical reconciliation; MCP authorization/dry run;
and Agent bevel execution with post-write inspection.

`EXPERIMENTAL`: loop cuts on regular quad rings, non-destructive modifier retention through glTF export, selected-face
and loose-part separation, voxel remesh, hole filling, loose cleanup, tris-to-quads, seam authoring, UV transforms,
texel-density estimates, and UDIM inspection. These use strict schemas and bounded execution but do not yet carry the
same real-fixture coverage as the implemented set.

`DEFERRED`: professional automatic/character retopology, QuadriFlow quality guarantees, sculpting, texture baking or
painting, AI texture generation, arbitrary shader graphs, rigging, simulation, production rendering, multi-view
reconstruction, and browser 3D playback.

## Health

`getBlenderBridgeHealth()` reports Node-side liveness. `getBlenderBridgeReadiness()` reports ready only after the
configured executable launches successfully in headless mode, embedded Python responds, compatibility is acceptable,
and the isolated workspace root is writable.

The Railway Blender Bridge remains intentionally inactive. Phase 16 validates against the configured local Blender
5.1.2 binary and does not change production infrastructure.

## Deferred

The deferred capabilities listed above remain future work and are not implied by the semantic operation registry.

Canonical references: `../../docs/02_SYSTEM_ARCHITECTURE.md`, `../../docs/07_3D_ENGINE_AND_CINEMATICS.md`, and
`../../docs/08_MCP_SPECIFICATION.md`.
