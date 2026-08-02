# @aevum/renderer-2d

`@aevum/renderer-2d` converts an immutable `SceneProjectionResult` into a deterministic, renderer-independent
Render Graph. It does not create HTML, CSS, SVG markup, Canvas commands, browser objects, or pixels.

## Public API

- `createRenderer(configuration?)` creates a renderer with a bounded LRU cache.
- `render(projection)` builds an uncached immutable renderer output.
- `buildRenderGraph(projection)` runs the complete graph-building pipeline.
- `resolvePaintOrder(projection)` returns stable hierarchy, z-order, and mask dependency order.
- `resolveEffects(runtimeNode)` validates and resolves canonical effect metadata.

The public graph contains `PAINT`, `CLIP`, `MASK`, `BLEND`, `TEXT`, `IMAGE`, `VECTOR`, and `EFFECT` operations.
Backend hints (`DOM`, `SVG`, `CANVAS`, `WEBGL`, and `RASTER`) describe likely future adapters; they do not execute
those adapters.

## Pipeline

```text
Scene Projection
-> Visibility Resolution
-> Paint Order Resolution
-> Clip Resolution
-> Style Resolution
-> Text Resolution
-> Image Resolution
-> Vector Resolution
-> Effect Resolution
-> Render Graph
-> Renderer Output
```

Every stage returns new immutable values. Layout and text shaping are intentionally not performed: Scene Runtime
owns resolved constraints and layout metadata, while the Typography package remains the authority for future
shaping and measurement implementations.

## Style Metadata Bridge

Canonical schema `1.1.0` does not yet have first-class fields for all blend, gradient, stroke, corner, effect,
image-repeat, or boolean-vector semantics. Until a command-driven document migration introduces them, the renderer
accepts validated optional metadata at `node.metadata.customData["aevum.renderer2d"]`. Invalid metadata is ignored
and reported as `UNRESOLVED_STYLE`; it is never interpreted as CSS or silently coerced.

Shape `fillTokenId` and `strokeTokenId` references are resolved by Scene Runtime. Canonical color tokens become
solid paints. Other token kinds remain unresolved with diagnostics.

## Cache

The cache key includes the projection fingerprint, renderer version, complete viewport, and quality mode. Cached
outputs are immutable and returned by identity. The cache is bounded and least-recently-used.

## Boundaries

Dependencies are limited to `scene-runtime`, `shared`, and Zod. This package does not depend on React, Next.js,
browser APIs, Three.js, render exporters, or target exporters, and it never mutates canonical state.

## Canonical References

- `../../AGENTS.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/06_ANIMATION_AND_RENDERING.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
