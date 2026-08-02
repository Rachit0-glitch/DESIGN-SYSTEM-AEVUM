# @aevum/scene-runtime

## Responsibility

Creates an immutable, disposable, renderer-independent projection of a validated Canonical Design Document `1.3.0`.

## Public API

- `projectScene(document, viewport, configuration)` performs a one-shot projection.
- `createSceneProjector(options)` creates a projector with an optional bounded in-memory cache.
- `resolveRuntimeConfiguration()` and `validateProjectionInput()` validate runtime inputs.
- `createProjectionFingerprint()` and `createProjectedInstanceId()` provide deterministic identities.
- `resolveResponsiveOverrides()`, `resolveNodeAnimation()`, and transform helpers expose pure resolution primitives.
- `serializeSceneProjection()` converts immutable maps into ordered JSON-compatible data.
- `sceneRuntimeFixtures` provides nested, responsive, component, and mixed 2D/3D fixtures.

## Projection Flow

The runtime schema-validates input, validates configuration and viewport context, discovers declared roots, traverses
the reachable graph iteratively, expands component instances, resolves responsive data, evaluates animation at a fixed
time, resolves transforms and references, builds dependency edges, emits ordered diagnostics, and freezes the result.

Declared root order and child order determine pre-order traversal indexes. Object registry keys are sorted whenever they influence diagnostics or dependency output. Fingerprints include the complete canonical document plus every output-affecting runtime input.

## Runtime Ownership

This package owns traversal, reachability classification, transform composition, responsive and animation projection,
component-instance expansion, reference resolution, dependency graphs, diagnostics, projection serialization, and
cache contracts.

It does not own canonical state, persistence, layout calculation, text shaping, playback, storage access, DOM/CSS,
React, Three.js, Blender, MCP, reconstruction, validation, or export policy. Canonical animation evaluation is delegated
to `animation-core`.

## Strict And Diagnostic Modes

Strict mode is the default. Structural and unresolved-reference errors throw typed errors containing ordered diagnostics. Diagnostic mode (`strictMode: false`) returns the maximum safe partial projection and marks `complete: false`.

Schema-invalid and unsupported-version documents are never partially projected or cached.

## Responsive Precedence

Base node data is followed by matching device-category, viewport-ID, explicit breakpoint-ID, ordered container-query,
orientation, reduced-motion, and quality-profile overrides. Later matches win. Runtime nodes preserve both the
untouched canonical source and the fully resolved node used by renderers and validation.

## Component Behavior

Instances expand into deterministic runtime-only IDs with source component, source node, instance, variant, and override attribution. Canonical override payloads are preserved but not interpreted until a canonical override-path contract exists. Recursive components produce diagnostics and stop expansion safely.

## Complexity And Limits

Normal projection targets `O(nodes + references)`. Traversal is iterative and enforces configurable depth and node-count limits. The bounded cache is an in-process LRU abstraction; Redis and distributed invalidation are deferred.

## Dependency Rules

Allowed dependencies are `animation-core`, `document-model`, `shared`, and pure validation utilities. Renderer,
exporter, database, Supabase client, UI, and worker dependencies are prohibited.

## Current Limitations

- No flex, grid, intrinsic, constraint, or text layout calculation.
- No HarfBuzz shaping, continuous playback, rendering, persistence, or asset loading.
- Canonical `1.3.0` defers nested timelines, time remapping, blend weights, sampled curves, and formal component
  override-path language.
- Transform matrices use renderer-neutral numeric arrays and Euler composition; render adapters remain responsible for backend conversion.
