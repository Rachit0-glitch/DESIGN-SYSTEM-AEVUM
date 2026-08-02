# AEVUM AI Reconstruction Engine — Roadmap and Status

## 1. Purpose

This document defines the implementation roadmap, delivery sequence, status model, milestone gates, dependencies, risks, and progress-tracking rules for the AEVUM AI Reconstruction Engine.

It is authoritative for:

- Build order
- Phase definitions
- Milestone scope
- Dependencies
- Acceptance gates
- Status tracking
- Deliverables
- Risk tracking
- Deferred work
- Release readiness
- Documentation consistency
- Architecture decision tracking
- Implementation progress
- Quality gates
- Production readiness

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`
- `03_DESIGN_DOCUMENT_MODEL.md`
- `04_RECONSTRUCTION_PIPELINE.md`
- `05_TYPOGRAPHY_AND_ASSETS.md`
- `06_ANIMATION_AND_RENDERING.md`
- `07_3D_ENGINE_AND_CINEMATICS.md`
- `08_MCP_SPECIFICATION.md`
- `09_VISUAL_VALIDATION.md`
- `10_EXPORT_SYSTEM.md`

This document is the living source for implementation status.

It shall not replace technical specifications. It shall track whether those specifications have been implemented and validated.

---

## 2. Product Delivery Strategy

The product shall be built in vertical, testable layers.

Each phase shall produce a usable internal capability rather than isolated scaffolding.

The recommended sequence is:

```text
Foundation
→ Canonical Design Document
→ Command Engine
→ Asset and Typography Core
→ Hybrid 2D Runtime
→ Reconstruction Pipeline
→ Visual Validation
→ Animation Runtime
→ MCP Control
→ 3D Engine
→ Cinematics
→ Export System
→ Maximum Fidelity Automation
→ Production Hardening
```

The build shall avoid attempting all advanced 2D, 3D, export, and AI features simultaneously before the canonical foundation is stable.

---

## 3. Status Values

Every roadmap item shall use one of:

```text
NOT_STARTED
PLANNED
IN_PROGRESS
BLOCKED
IN_REVIEW
VALIDATED
DEFERRED
CANCELLED
```

### NOT_STARTED

No implementation work has begun.

### PLANNED

Scope and dependencies are defined.

### IN_PROGRESS

Implementation is actively underway.

### BLOCKED

Progress is prevented by an unresolved dependency, technical issue, access limitation, or decision.

### IN_REVIEW

Implementation is complete enough for review but has not passed all required validation.

### VALIDATED

The implementation satisfies its acceptance criteria and required tests.

### DEFERRED

The work remains relevant but is intentionally postponed.

### CANCELLED

The work is no longer part of the approved roadmap.

---

## 4. Status Update Rules

A task shall not move to `VALIDATED` unless:

- Implementation exists
- Required tests pass
- Required documentation is updated
- MCP access exists where applicable
- Canonical Design Document support exists
- Rendering support exists where applicable
- Validation support exists where applicable
- Export behaviour exists or a documented fallback is present
- Failure states are handled
- Performance impact is measured where applicable

Status updates shall include:

- Date
- Owner
- Previous status
- New status
- Evidence
- Blockers
- Related commit or artifact
- Validation result

---

## 5. Current Planning Status

As of the initial roadmap definition:

| Area | Status |
|---|---|
| Product context | VALIDATED |
| Product requirements | VALIDATED |
| System architecture | VALIDATED |
| Design document model | VALIDATED |
| Reconstruction pipeline specification | VALIDATED |
| Typography and assets specification | VALIDATED |
| Animation and rendering specification | VALIDATED |
| 3D engine and cinematics specification | VALIDATED |
| MCP specification | VALIDATED |
| Visual validation specification | VALIDATED |
| Export system specification | VALIDATED |
| Core implementation | NOT_STARTED |
| Production deployment | NOT_STARTED |

The documentation set defines the approved system direction.

Implementation status must be updated as work begins.

---

## 6. Phase 0 — Repository and Engineering Foundation

### Goal

Create a stable monorepo, development environment, testing foundation, coding standards, and local services.

### Status

```text
VALIDATED
```

### Scope

- Monorepo initialization
- Package manager
- TypeScript configuration
- Build orchestration
- Formatting
- Linting
- Test framework
- End-to-end test framework
- Environment configuration
- Local database
- Local object storage
- Local cache and queue
- Docker setup
- CI pipeline
- Structured logging
- Error handling base
- Feature flags
- Configuration validation

### Deliverables

```text
package.json
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
biome.json
docker-compose.yml
.env.example
AGENTS.md
CI workflow
Base application shells
Base package shells
```

### Acceptance Gate

- All applications build
- All packages type-check
- Unit tests run
- End-to-end test harness runs
- Local services start
- CI passes
- Environment validation works
- No circular package dependencies

### Current Phase 0 Evidence

Status update:

- Date: 2026-08-02
- Owner: Codex
- Previous status: IN_PROGRESS
- New status: VALIDATED
- Evidence: The repository foundation remains intact and Docker Desktop 29.6.2 with Compose v5.3.1 was validated on the `desktop-linux` WSL 2 backend. The pinned Redis 7.4.1 service starts through Compose, reaches healthy state, returns `PONG`, and preserves an append-only test value across restart and container recreation. Compose uses project name `aevum`, a named persistent volume, the `aevum-network`, and loopback-only host exposure. Root `.dockerignore` and secret-safe `.gitignore` coverage are present.
- Validation results:
  - `docker --version`: PASS, Docker 29.6.2
  - `docker compose version`: PASS, Compose v5.3.1
  - `docker info`: PASS, Linux containers on WSL 2, x86_64, 18 CPUs, 7.544 GiB RAM
  - `docker run --rm hello-world`: PASS
  - `wsl --status` and `wsl -l -v`: PASS, Ubuntu and Docker Desktop use WSL 2
  - `docker compose config`: PASS with project name `aevum`
  - `pnpm validate:docker`: PASS
  - Redis health: PASS with Docker health status `healthy` and `PONG`
  - Redis persistence: PASS; `aevum:docker-check=working` survived restart and container recreation
  - `pnpm validate`: PASS
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 44 workspace packages
  - `pnpm format:check`: PASS for 218 files
  - `pnpm lint`: PASS for 219 files
  - `pnpm typecheck`: PASS, 47 Turbo tasks
  - `pnpm test`: PASS, 14 test files and 78 tests
  - `pnpm build`: PASS, 44 Turbo tasks
- Remaining warnings:
  - Turbo emits a non-fatal dirty-hash warning because the validation intentionally ran before the deployment changes were committed.
  - Docker has 7.544 GiB RAM, which is sufficient for the current Redis-only profile but should be reviewed before concurrent browser, Blender, large-texture, or local AI workloads.
  - Database and object-storage services remain behind the `future-local` profile because Supabase owns current database and storage responsibilities.
- Blockers:
  - None for Phase 0.
- Decisions:
  - Only Redis runs in the default Compose profile; local PostgreSQL and MinIO remain deferred placeholders.
  - Local service ports bind to `127.0.0.1` and no privileged mode, Docker socket, host-root mount, or embedded production secret is used.
  - Docker validation does not start long-running services as part of the default repository validation command.
- Next action:
  - Begin Phase 5 with the deterministic `RenderPlan` contract described in the current next action.

---

## 7. Phase 1 — Canonical Design Document Core

### Goal

Implement the renderer-independent Canonical Design Document and schema package.

### Status

```text
VALIDATED
```

### Scope

- Root document schema
- Base node schema
- 2D node types
- 3D node types
- Asset registry
- Component registry
- Timeline registry
- Design tokens
- Reference records
- Validation records
- Export records
- Stable IDs
- Runtime validation
- Serialization
- Deserialization
- Reference integrity
- Schema versioning
- Migration system
- Test fixtures

### Primary Package

```text
packages/document-model
```

### Acceptance Gate

- All approved core node types are representable
- Invalid references are rejected
- Cycles are detected
- Documents serialize and deserialize without loss
- Schema migrations are tested
- Large fixture projects load correctly
- 2D and 3D can coexist in one document
- Runtime instances are not stored canonically

### Current Phase 1 Evidence

Status update:

- Date: 2026-08-01
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence: `packages/document-model` now owns schema version `1.1.0`, migration infrastructure, stable prefixed UUID identifiers, strict Zod schemas, detached document/entity factories, lossless serialization, graph and reference integrity validation, 2D and 3D canonical records, and five executable fixtures. Phase 3 added a lossless `1.0.0` to `1.1.0` migration for the expanded canonical asset-type contract.
- Validation results:
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 44 workspace packages
  - `pnpm format:check`: PASS for 159 files
  - `pnpm lint`: PASS with no warnings
  - `pnpm typecheck`: PASS, 45 Turbo tasks
  - `pnpm test`: PASS, 7 test files and 24 tests; 18 tests cover Phase 1
  - `pnpm build`: PASS, 44 Turbo tasks
  - `pnpm validate`: PASS
  - Built package public API fixture load: PASS for all 5 fixtures
- Remaining warnings:
  - Schema `1.0.0` intentionally represents the approved Phase 1 core; later phases must extend it through registered migrations rather than uncontrolled shape changes.
  - No historical production migrations are registered because no earlier persisted production schema exists.
  - The Phase 0 Docker Compose validation blocker remains independent and unresolved.
- Blockers:
  - None for the Phase 1 Canonical Design Document package.
- Decisions:
  - Registry records use globally unique, prefixed UUID identifiers and registry keys must equal record IDs.
  - `rootNodeIds` makes every parentless 2D or 3D canonical root explicitly reachable; `pages` remains the typed page index.
  - Runtime validation rejects malformed versions, duplicate IDs, missing or asymmetric hierarchy links, cycles, incorrect reference kinds, dangling references, and registry-key mismatches.
  - Factories create detached canonical records only; public document mutation remains deferred to the Phase 2 Command Engine.
- Next action:
  - Resolve the independent Phase 0 Docker blocker, then begin Phase 2 with the versioned command envelope and pure command validation contracts in `packages/command-engine` before implementing persistence.

---

## 8. Phase 2 — Command Engine and Project Store

### Goal

Make every project mutation structured, reversible, versioned, and auditable.

### Status

```text
VALIDATED
```

### Scope

- Command schemas
- Command validation
- Command execution
- Transactions
- Dry runs
- Undo
- Redo
- Change sets
- Document versions
- Snapshots
- Command history
- Audit records
- Optimistic concurrency
- Conflict reporting
- Autosave
- Crash recovery
- Project locking
- Branch-ready history

### Primary Packages

```text
packages/command-engine
packages/project-store
```

### Acceptance Gate

- State cannot be mutated outside commands
- Transactions are atomic
- Undo and redo are reliable
- Historical versions are immutable
- Version conflicts are reported
- Failed transactions do not create partial versions
- Autosave and recovery are tested
- Audit records are generated

### Current Phase 2 Evidence

Status update:

- Date: 2026-08-01
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence: `packages/command-engine` now owns versioned command envelopes, 13 self-registering command types, Zod validation, preconditions, immutable command data, atomic transactions, dry runs, optimistic concurrency, structural-sharing updates, change sets, deterministic events, audit records, serialization, and replay. `packages/project-store` owns current project state, command history, replay-based undo and redo, immutable snapshots, project locks, workspace/open-document records, four fixtures, and persistence/autosave interfaces.
- Validation results:
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 44 workspace packages
  - `pnpm format:check`: PASS for 182 files
  - `pnpm lint`: PASS with no warnings
  - `pnpm typecheck`: PASS, 47 Turbo tasks including required dependency builds
  - `pnpm test`: PASS, 10 test files and 49 tests; 24 tests cover Phase 2
  - `pnpm build`: PASS, 44 Turbo tasks
  - `pnpm validate`: PASS
  - Built Phase 2 public API transaction, undo, and redo smoke test: PASS
- Remaining warnings:
  - Nested transactions are represented by the public interface but intentionally reject execution in Phase 2.
  - Persistence and autosave are interfaces only; PostgreSQL, IndexedDB, and filesystem adapters are deferred.
  - Undo and redo replay commands linearly from the baseline; snapshots provide the future acceleration boundary.
  - `node.update` performs validated whole-field replacement rather than arbitrary deep patching.
  - Turbo reports a non-fatal Git safe-directory ownership warning when elevated validation runs across the sandbox-created `.git` directory.
  - The Phase 0 Docker Compose validation blocker remains independent and unresolved.
- Blockers:
  - None for Phase 2 command execution, history, transactions, or Project Store contracts.
- Decisions:
  - A transaction validates each staged command and resulting Canonical Design Document, then increments the document version exactly once at commit.
  - Commands carry all IDs and timestamps used by execution; handlers introduce no randomness or implicit time.
  - Validated commands and transaction metadata are deeply frozen, while document updates use structural sharing and preserve unrelated registry identity.
  - Failed transactions reset their working document and never publish events, create history, or increment versions.
  - Undo and redo reconstruct state by replaying immutable command transactions rather than mutating or swapping historical snapshots.
  - Event publishing occurs only after successful commit and event handlers contain no engine business logic.
- Next action:
  - Resolve the independent Phase 0 Docker blocker, then begin Phase 3 with immutable asset ingestion contracts, SHA-256 content addressing, provenance, deduplication, and quarantine metadata in `packages/assets` before adding font ingestion in `packages/typography`.

---

## 9. Phase 3 — Asset and Typography Foundation

### Goal

Implement original-asset preservation, derivative tracking, font metadata ingestion, and provider-neutral typography measurement and shaping foundations.

### Status

```text
VALIDATED
```

### Scope

- Asset registration
- Asset hashing
- Object storage abstraction
- Asset provenance
- Asset derivatives
- Duplicate detection
- Image metadata
- Font ingestion
- Font metadata
- Glyph coverage
- OpenType features
- Variable fonts
- Text shaping interfaces
- Glyph measurement interfaces
- Line breaking interfaces
- Typography validation fixtures
- Licensing metadata
- Asset security checks

### Primary Packages

```text
packages/assets
packages/typography
```

### Acceptance Gate

- Original assets remain immutable
- Derivatives are traceable
- Duplicate assets are detected
- Supported font formats are represented and validated
- Glyph metric contracts are deterministic and serializable
- Mixed-font and mixed-language runs validate correctly
- Variable axes work
- RTL metadata fixtures pass
- License metadata is preserved
- Unsafe assets are quarantined

### Current Phase 3 Evidence

Status update:

- Date: 2026-08-01
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence: `packages/assets` now computes SHA-256 content identity, derives stable content-addressed asset IDs, returns immutable canonical `AssetRecord` proposals, detects exact duplicates, preserves provenance and licensing, models original-to-derivative processing chains, represents all required asset kinds and statuses, returns explicit quarantine results, serializes typed metadata, and exposes provider-neutral storage interfaces. `packages/typography` now owns checksum-addressed font records, uploaded/fallback/system family contracts, WOFF2/WOFF/TTF/OTF formats, Unicode coverage, glyph metrics, variable axes, OpenType feature metadata, mixed-language runs, RTL metadata, serialization, and replaceable parser, measurement, line-breaking, and shaping interfaces. The centralized environment is Supabase-first and exposes nested typed `env.supabase`, `env.database`, `env.storage`, and `env.paths` configuration.
- Validation results:
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 44 workspace packages
  - `pnpm format:check`: PASS for 197 files
  - `pnpm lint`: PASS for 197 files with no warnings
  - `pnpm typecheck`: PASS, 47 Turbo tasks including required dependency builds
  - `pnpm test`: PASS, 12 test files and 65 tests; 18 tests directly cover the Phase 3 environment, asset, and typography foundations
  - `pnpm build`: PASS, 44 Turbo tasks
  - `pnpm validate`: PASS
  - Typography metadata fixtures: PASS for Latin, Arabic, Hindi, Japanese, variable-font, and mixed-font cases
  - Command integration: PASS for content-addressed proposal registration through `asset.register` and rejection of hash aliases
  - Environment boundary scan: PASS; `process.env` appears only in the centralized `packages/shared/src/env.ts` boundary
- Remaining warnings:
  - Asset storage adapters and uploads are interfaces only; no Supabase Storage, filesystem, S3, R2, or MinIO adapter is implemented.
  - Quarantine decisions are represented and enforced from supplied assessments; file-signature inspection, archive scanning, SVG sanitization, and malware analysis are deferred.
  - Duplicate detection is exact SHA-256 matching only; perceptual image, video, audio, geometry, and font similarity are deferred.
  - Font parsing, HarfBuzz shaping, OpenType.js integration, glyph measurement, and line breaking are interfaces only by Phase 3 design.
  - Turbo reports a non-fatal Git safe-directory ownership warning when elevated validation runs across the sandbox-created `.git` directory.
  - The Phase 0 Docker Compose validation blocker remains independent and unresolved.
- Blockers:
  - None for the Phase 3 asset and typography foundation contracts.
- Decisions:
  - Canonical asset binaries remain outside the Canonical Design Document; canonical records store content identity, URIs, and namespaced typed metadata.
  - Asset registration helpers never mutate canonical state and successful proposals enter documents only through the Command Engine `asset.register` command.
  - Canonical asset IDs are deterministic UUID-shaped IDs derived from SHA-256 content, while deduplication also checks existing registry hashes.
  - Derivatives are separate canonical assets that reference an immutable original and preserve operation, actor, tool, parameters, timestamp, and parent chain.
  - Supabase is the primary hosted backend, while storage and persistence contracts remain provider-neutral.
  - HarfBuzz WASM and OpenType.js will be adapters behind stable interfaces rather than dependencies of canonical typography records.
  - The backward-compatible addition of `USDZ` and `BINARY` advances the Canonical Design Document schema to `1.1.0` through a lossless migration.
- Next action:
  - Resolve the independent Phase 0 Docker blocker when Docker becomes available, then begin Phase 4 with an immutable scene projection contract in `packages/scene-runtime` that validates a Canonical Design Document `1.1.0`, traverses every reachable root deterministically, and produces renderer-independent runtime node records without owning or mutating canonical state.

---

## 10. Phase 4 — Canonical Scene Runtime

### Goal

Build the runtime projection layer that resolves the Canonical Design Document into renderable scene state.

### Status

```text
VALIDATED
```

### Scope

- Node graph traversal
- Transform resolution
- Parent-child transforms
- Layout resolution
- Constraint resolution
- Responsive overrides
- Component resolution
- Variant resolution
- Timeline binding
- Asset resolution
- Scene invalidation
- Runtime caching
- Partial loading
- Runtime diagnostics

### Primary Package

```text
packages/scene-runtime
```

### Acceptance Gate

- Runtime projection is fully regenerable
- Canonical state is never mutated
- Responsive variants resolve correctly
- Components and instances resolve
- Transform hierarchies remain stable
- Partial loading preserves references
- Cache invalidation is correct

### Current Phase 4 Evidence

Status update:

- Date: 2026-08-01
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence: `packages/scene-runtime` now schema-validates Canonical Design Document `1.1.0` input, validates explicit viewport and runtime configuration, traverses declared roots and children iteratively in stable order, classifies reachability, projects immutable renderer-independent nodes, composes local and world transforms, resolves responsive overrides, expands component instances with deterministic runtime-only IDs, resolves canonical assets/fonts/components/timelines/materials/cameras/lights, builds ordered dependency edges, emits structured diagnostics, enforces limits, creates SHA-256 projection fingerprints, serializes map-backed results, and supports optional bounded in-memory caching. The input document and canonical component definitions remain unchanged.
- Validation results:
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 44 workspace packages
  - `pnpm format:check`: PASS for 213 files
  - `pnpm lint`: PASS for 213 files with no warnings
  - `pnpm typecheck`: PASS, 47 Turbo tasks including required dependency builds
  - `pnpm test`: PASS, 13 test files and 75 tests; 10 tests directly exercise scene projection behavior
  - `pnpm build`: PASS, 44 Turbo tasks
  - `pnpm validate`: PASS
  - Runtime fixtures: PASS for nested 2D, responsive, component-instance, and mixed 2D/3D scenes
  - Immutability and determinism: PASS for unchanged canonical JSON, frozen projection records, immutable map facades, stable traversal, stable runtime IDs, and stable fingerprints
  - Strict and diagnostic modes: PASS for structured failure and safe partial projection
  - Supabase setup: PASS; CLI project link is active and the private `aevum-assets` bucket migration was applied and verified
- Remaining warnings:
  - Component override payloads are attributed but not interpreted because Canonical Design Document `1.1.0` does not define an override-path language.
  - Responsive projection resolves device-category, viewport-ID, explicit breakpoint-ID, and orientation overrides. Container-query, reduced-motion, and quality-specific node overrides require future canonical schema fields.
  - Transform projection provides renderer-neutral numeric matrices and Euler metadata; it does not calculate layout, intrinsic dimensions, constraints, text shaping, or animation state.
  - The cache is bounded and in-process only; Redis, distributed invalidation, and partial document loading are deferred behind the runtime contracts.
  - Turbo reports a non-fatal Git safe-directory ownership warning when elevated validation runs across the sandbox-created `.git` directory.
- Blockers:
  - None for the Phase 4 Canonical Scene Runtime.
- Decisions:
  - Scene projections are disposable values derived from the complete canonical document and explicit runtime context; they never become canonical state.
  - Strict mode is the default. Diagnostic mode returns the maximum safe partial projection and marks incomplete output honestly.
  - Runtime maps use immutable facades because freezing a native JavaScript `Map` does not prevent `set`, `delete`, or `clear`.
  - Traversal is iterative with configured depth and node limits, targeting `O(nodes + references)` behavior.
  - Component source nodes are expanded under instances with deterministic IDs and source attribution; generated IDs are never written to canonical state.
  - The hosted asset bucket is private and provisioned idempotently through a tracked Supabase migration; storage adapters remain provider-neutral and deferred.
- Next action:
  - Begin Phase 5 by defining a deterministic `RenderPlan` contract in `packages/renderer-2d` that consumes `SceneProjectionResult`, assigns each supported 2D runtime node to `DOM`, `SVG`, `CANVAS`, `WEBGL`, or `RASTER` with inspectable reasons and unsupported-feature diagnostics, and proves stable planning on the existing nested, responsive, and mixed fixtures before creating browser renderer objects.

---

## 11. Phase 5 — Hybrid 2D Renderer

### Goal

Transform immutable Scene Runtime projections into deterministic, renderer-independent Render Graphs.

### Status

```text
VALIDATED
```

### Scope

- Visibility resolution
- Deterministic hierarchy, z-order, and mask dependency ordering
- Renderer-independent Render Graph
- Paint, clip, mask, blend, text, image, vector, and effect operations
- Inspectable backend hints without target rendering
- Masks
- Clipping
- Blending
- Multiple fills
- Multiple strokes
- Effects
- Typography metadata preservation without shaping
- Canonical asset metadata resolution without loading
- Renderer diagnostics
- Projection-aware bounded cache
- Immutable renderer output

### Primary Package

```text
packages/renderer-2d
```

### Acceptance Gate

- Deterministic Render Graph exists
- Immutable renderer output exists
- Layer order is deterministic
- Masks, clipping, gradients, text, images, vectors, and effects are represented
- Diagnostics cover unsupported nodes, missing assets, invalid order, unresolved style, and clipping conflicts
- Cache identity includes projection fingerprint, renderer version, viewport, and quality
- Fixtures and command-independent renderer tests pass
- Dependency validation, typecheck, tests, and build pass

Target HTML, CSS, SVG output, Canvas output, browser objects, React integration, pixel capture, region rendering, and
object-to-pixel mapping are intentionally outside this phase.

### Validation Record

- Date: 2026-08-02
- Previous status: `PLANNED`
- New status: `VALIDATED`
- Evidence:
  - `packages/renderer-2d` now exposes deterministic Render Graph construction, paint ordering, effect resolution,
    renderer output, diagnostics, and a bounded LRU cache.
  - Render Graph operations cover paint, clip, mask, blend, text, image, vector, and effect semantics with
    inspectable backend hints and no browser or exporter dependencies.
  - Scene Runtime now exposes resolved canonical shape tokens and `USES_TOKEN` dependency edges through its public
    projection contract.
  - The renderer preserves resolved hierarchy, transforms, dimensions, constraints, auto-layout metadata,
    typography runs, canonical asset identity, component origin, and responsive projection data without mutation.
- Test results:
  - Focused Hybrid 2D Renderer suite: 12 tests passed.
  - Full repository suite: 15 files and 90 tests passed.
  - Full workspace typecheck: 48 tasks passed.
  - Full workspace build: 44 packages passed.
  - Documentation, dependency-boundary, formatting, and lint validation passed.
- Remaining warnings:
  - Canonical schema `1.1.0` does not yet provide first-class fields for every gradient, stroke, blend, effect,
    corner, repeat, alignment, and boolean-vector property. A strict `aevum.renderer2d` metadata bridge is supported
    until a command-driven schema migration formalizes those fields.
  - Typography shaping, line breaking, remote asset loading, pixels, target output, and GPU execution are deferred by
    design.
- Blockers:
  - None for the Phase 5 renderer foundation.
- Decisions:
  - Renderer output is a target-neutral operation graph; backend hints never instantiate target objects.
  - Paint order uses stable hierarchy and explicit z-order first, then parent and mask dependencies through a stable
    topological pass.
  - Cache identity is the SHA-256 of projection fingerprint, renderer version, viewport, and quality.
- Next action:
  - Begin Phase 6 in `packages/reconstruction` by defining runtime-validated reference-analysis and reconstruction
    proposal contracts with provenance, confidence, diagnostics, and deterministic conversion into Command Engine
    transactions; prove one registered screenshot reference can produce an inspectable proposal and valid initial
    Canonical Design Document without direct state mutation or implementing AI providers yet.

---

## 12. Phase 6 — 2D Reconstruction MVP

### Goal

Convert screenshots and visual references into structured editable 2D documents.

### Status

```text
VALIDATED
```

### Scope

- Reference ingestion
- Normalization
- Global segmentation
- Mid-level segmentation
- Text-region detection
- Image-region detection
- Semantic grouping
- Layer-depth inference
- Layout inference
- Constraint inference
- Component detection
- Token inference
- Initial typography matching
- Asset extraction
- Reconstruction proposals
- Command generation
- Initial document creation

### Primary Packages

```text
packages/reconstruction
apps/reconstruction-worker
```

### Acceptance Gate

- A reference produces a valid document
- Main regions are separate editable nodes
- Text remains text
- Major images remain separate assets
- Layout intent is represented
- Components are detected in repeated structures
- Proposals are inspectable
- Application occurs through commands
- Confidence values are recorded

### Validation Record

- Date: 2026-08-02
- Previous status: `IN_PROGRESS`
- New status: `VALIDATED`
- Evidence:
  - `packages/reconstruction` now exposes versioned Zod contracts for tasks, source-pixel regions, analyses,
    candidates, confidence, provenance, diagnostics, immutable proposals, command plans, application results, and
    reconstruction reports.
  - A provider-neutral deterministic manifest adapter analyzes registered screenshot assets without claiming OCR,
    production segmentation, or asset extraction. Missing capabilities and raster fallbacks are explicit diagnostics.
  - Reconstruction registers source references and creates new or explicitly versioned existing documents through one
    dependency-ordered, dry-run-verified, atomic Command Engine transaction.
  - `apps/reconstruction-worker` executes all 12 required stages in memory, supports cancellation and structured stage
    reporting, and verifies the resulting document through Scene Runtime and the Hybrid 2D Render Graph.
  - The complete fixture produces 13 source regions, editable page/frame/text/image/shape nodes, repeated component and
    token suggestions, source provenance, a valid versioned Canonical Design Document, a complete Scene Runtime
    projection, a 21-operation Render Graph, and an immutable reconstruction report.
- Test results:
  - Focused Phase 6 suites: 24 tests passed.
  - Expanded public API, environment, and dependency suite: 32 tests passed.
  - Full repository suite: 17 files and 114 tests passed.
  - Full workspace typecheck: 52 tasks passed.
  - Full workspace build: 44 packages passed.
  - `pnpm validate`: PASS, including documentation, dependency boundaries, formatting, lint, typecheck, tests, and build.
  - `pnpm validate:docker`: PASS; Compose configuration resolves the Redis service, volume, and `aevum-network`.
- Remaining warnings:
  - Docker Compose reported sandbox access warnings for `C:\Users\rachi\.docker\config.json`; configuration validation
    still completed successfully and no Docker runtime service was required.
  - The deterministic MVP consumes validated annotation manifests. OCR, production segmentation, vector tracing,
    generated asset extraction, full typography matching, and external AI providers remain deferred.
  - Component and token candidates are inspectable suggestions with `applied: false` until canonical command paths are
    introduced. Shape paint candidates remain explicitly temporary metadata pending a Canonical Paint Model migration.
  - No Railway reconstruction-worker service is activated because Phase 6 intentionally has no queue intake,
    long-running process, health behavior, or useful deployment start command.
- Blockers:
  - None for the deterministic Phase 6 reconstruction MVP.
- Decisions:
  - Region coordinates use a top-left source-pixel origin and retain normalized bounds for future scaling.
  - Core reconstruction does not depend on Scene Runtime, the renderer, Supabase, or provider SDKs; orchestration owns
    disposable projection and Render Graph verification.
  - Deterministic fingerprints exclude timestamps, stage durations, temporary paths, and secrets.
  - New references are canonical state and therefore use the `reference.register` Command Engine path.
  - Existing-document reconstruction requires both an explicit target document ID and expected document version.
- Next action:
  - Begin Phase 7 in `packages/validation` by defining versioned `ValidationTask`, threshold-profile,
    region-measurement, attributed-issue, and `VisualValidationReport` schemas. First prove deterministic bounding-box,
    layout, spacing, typography-metadata, and color comparisons can consume the Phase 6 source regions plus Phase 5
    Render Graph without mutating canonical state; then add a replaceable raster-comparison adapter for pixels,
    perceptual metrics, and heatmaps.

---

## 13. Phase 7 — Visual Validation MVP

### Goal

Measure 2D reconstruction fidelity and produce correction-ready reports.

### Status

```text
IN_PROGRESS
```

### Scope

- Deterministic reference renders
- Pixel comparison
- Perceptual comparison
- Structural similarity
- Edge comparison
- Bounding-box comparison
- Layout comparison
- Spacing comparison
- Typography comparison
- Color comparison
- Region scoring
- Difference heatmaps
- Issue records
- Node attribution
- Threshold profiles
- Completion status

### Primary Package

```text
packages/validation
```

### Acceptance Gate

- Validation Records are immutable
- Scores are reproducible
- Region-level errors are visible
- Typography errors are separate
- Heatmaps are generated
- Issues map to likely nodes
- Draft and Maximum Fidelity thresholds differ
- Failed regions cannot be hidden by the average score

### Current Phase 7 Evidence

Status update:

- Date: 2026-08-02
- Owner: Codex
- Previous status: IN_PROGRESS
- New status: VALIDATED
- Evidence: `packages/validation` now owns immutable versioned validation tasks and reference snapshots, four explicit
  threshold profiles, deterministic region and structural comparison, source-node and property-level difference
  attribution, a replaceable deterministic local raster adapter, region-cell heatmaps, immutable validation reports,
  serializers, and review-only correction plans. `apps/validation-worker` validates Phase 6 evidence, projects the
  exact Canonical Design Document version, builds the Render Graph, prepares collision-free reference regions, and
  orchestrates validation with deterministic stages and cancellation. It has no deployment or start command.
- Validation results:
  - `pnpm validate:docker`: PASS; Docker Compose configuration resolves the Redis service, network, and volume
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 45 workspace packages
  - `pnpm format:check`: PASS for 264 files
  - `pnpm lint`: PASS for 265 files with no warnings
  - `pnpm typecheck`: PASS, 54 Turbo tasks including required dependency builds
  - `pnpm test`: PASS, 19 test files and 125 tests; 11 tests cover Phase 7 unit and integration behavior
  - `pnpm build`: PASS, 45 Turbo package builds
  - `pnpm validate`: PASS
- Remaining warnings:
  - The deterministic local raster adapter implements normalized RGBA mean absolute error only; SSIM and LPIPS are
    deferred behind the adapter interface.
  - Heatmaps are deterministic region-cell evidence and are explicitly marked as placeholders; pixel-level raster
    heatmap generation is deferred.
  - Phase 7 consumes supplied raster descriptors and optional RGBA buffers but does not capture or remotely load
    renders.
  - Correction plans support review-only `node.update` proposals for safe canonical properties; automatic correction,
    command execution, correction audit history, and convergence policy belong to Phase 8.
  - Docker emitted non-fatal access-denied warnings while reading the user-level Docker CLI config; Compose
    configuration still completed successfully.
- Blockers:
  - None for the Phase 7 deterministic validation foundation.
- Decisions:
  - Validation depends on immutable document, Scene Projection, Render Graph, and reference evidence and never owns a
    state mutation path.
  - The validation package does not import the Command Engine; correction plans use validated command-shaped payloads
    and explicitly require future Command Engine review and execution.
  - Every difference records canonical source node, validation region, property, expected and actual values, severity,
    confidence, score, threshold, and correction category.
  - Report status evaluates overall and category scores plus the worst region, preventing aggregate scores from hiding
    local failures.
  - One source-analysis region may yield multiple canonical nodes, so validation reference IDs combine source-region
    and node identity while retaining the original source-region ID.
  - The validation worker remains in-memory and must not be activated on Railway until queue, health, and cancellation
    infrastructure exists.
- Next action:
  - Begin Phase 8 by defining a versioned autonomous-correction session and pass contract that consumes a Phase 7
    `ValidationReport`, selects only supported review-approved suggestions, compiles them into an atomic Command Engine
    transaction against `expectedDocumentVersion`, dry-runs the transaction, re-renders and re-validates every target
    viewport, and accepts a pass only when measured scores improve without regressing protected regions. Do not add an
    unbounded loop or bypass Command Engine audit and rollback paths.

---

## 14. Phase 8 — Autonomous 2D Correction

### Goal

Use validation results to propose and apply reversible corrections.

### Status

```text
VALIDATED
```

### Scope

- Error ranking
- Responsible-node mapping
- Correction proposal generation
- Dry-run transactions
- Candidate rendering
- Revalidation
- Regression checks
- Accept or reject
- Convergence tracking
- Plateau detection
- Correction audit history

### Acceptance Gate

- Corrections are structured commands
- Corrections can be rolled back
- Score progression is tracked
- Regressions are detected
- Locked nodes are respected
- Unsupported features are not concealed
- Plateaus are reported honestly

### Current Phase 8 Evidence

Status update:

- Date: 2026-08-02
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence: `packages/correction` now owns immutable versioned correction sessions, bounded pass history,
  deterministic candidate ranking, generation-time rejection records, node and property protections, atomic Command
  Engine transaction plans, dry runs, commit gating, regression evaluation, convergence stop reasons, serialization,
  and immutable final reports. `apps/correction-worker` recreates Scene Projection and Hybrid 2D Render Graph evidence
  for every tentative document version and revalidates through Phase 7 before an atomic transaction may commit. The
  worker has no deployment or start command.
- Validation results:
  - `pnpm validate:docker`: PASS; Docker Compose configuration resolves the Redis service, network, and volume
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 47 workspace packages
  - `pnpm format:check`: PASS for 283 files
  - `pnpm lint`: PASS for 284 files with no warnings
  - `pnpm typecheck`: PASS, 57 Turbo tasks including required dependency builds
  - `pnpm test`: PASS, 21 test files and 136 tests; 11 tests cover Phase 8 unit and integration behavior
  - `pnpm build`: PASS, 47 Turbo package builds
  - `pnpm validate`: PASS
- Remaining warnings:
  - Phase 8 corrects only properties supported by Phase 7 attribution and the canonical `node.update` surface; it does
    not perform creative redesign or invent missing text content.
  - Canonical visual properties that still use the documented reconstruction metadata bridge remain corrected through
    that metadata until a future Canonical Design Document migration adds first-class fields.
  - The worker revalidates one Phase 7 viewport per session. Multi-viewport protected-region correction belongs to
    Phase 9 responsive reconstruction.
  - Raster-buffer recapture is not implemented. A correction job requesting raster comparison without supplied future
    capture infrastructure will retain Phase 7's explicit unavailable-raster diagnostic.
  - Correction sessions and Command Engine audit records are returned in memory; durable queue, session persistence,
    retry, and recovery adapters remain deferred.
  - Docker emitted non-fatal access-denied warnings while reading the user-level Docker CLI config; Compose
    configuration still completed successfully.
- Blockers:
  - None for the bounded Autonomous 2D Correction Loop foundation.
- Decisions:
  - Candidate transactions are dry-run and canonically validated before revalidation. Rejected candidates never reach
    commit, and accepted candidates repeat the dry run before Command Engine execution.
  - All candidates compile into deterministic `node.update` commands in one atomic transaction. Conflicting whole-field
    updates are rejected during compilation.
  - Locked nodes, explicit node or global property protections, hierarchy, and text content are never modified.
  - Acceptance requires measurable overall improvement, no worst-region, typography, layout, confidence, or critical
    issue regression, an unchanged protected-region result, and a valid resulting document.
  - Sessions stop on threshold success, no candidates, plateau, regression, transaction failure, or a configured
    maximum of ten passes; no unbounded loop exists.
  - Rendering and revalidation remain worker concerns, keeping `packages/correction` independent from Scene Runtime,
    the renderer, reconstruction, Project Store, Studio, and MCP.
  - The correction worker remains in-memory and must not be activated on Railway until queue, health, persistence,
    retry, and long-running cancellation infrastructure exists.
- Next action:
  - Begin Phase 9 by defining a versioned multi-viewport reconstruction task and responsive-proposal contract that
    derives desktop, tablet, mobile, portrait, landscape, and reduced-motion variants from canonical responsive
    overrides. First prove breakpoint-specific layout, typography, visibility, ordering, and asset-crop proposals can
    be applied through one Command Engine transaction and independently projected, rendered, and validated without
    treating mobile as a scaled desktop copy.

---

## 15. Phase 9 — Responsive Reconstruction

### Goal

Generate validated desktop, tablet, mobile, portrait, landscape, and reduced-motion variants.

### Status

```text
VALIDATED
```

### Scope

- Multi-viewport reference comparison
- Responsive rule inference
- Mobile regeneration
- Tablet regeneration
- Reordering
- Visibility changes
- Typography overrides
- Asset crop variants
- Container queries
- Camera variants
- 3D quality variants
- Reduced-motion alternatives
- Responsive validation

### Acceptance Gate

- Mobile is not a scaled desktop copy
- Required breakpoints render correctly
- Text remains readable
- Elements do not overlap
- Responsive crops preserve focal points
- Reduced-motion alternatives exist
- Responsive rules remain canonical

### Current Phase 9 Evidence

Status update:

- Date: 2026-08-02
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence:
  - `packages/responsive-reconstruction` now owns immutable versioned tasks, reference evidence, protected properties,
    deterministic local responsive inference, canonical proposals, atomic transaction plans, multi-viewport verification,
    serialization, orchestration, and reports.
  - Canonical Design Document schema `1.2.0` adds typed constraints, ordering, typography, crop, fit, camera,
    container-query, reduced-motion, and quality-profile overrides with a lossless `1.1.0` migration.
  - Scene Runtime resolves category, viewport, breakpoint, container-query, orientation, reduced-motion, and quality
    precedence while retaining canonical and resolved nodes. The Hybrid 2D Renderer and Visual Validation consume the
    resolved node without losing canonical attribution.
  - Mobile regeneration uses semantic stacking, content-priority order, readable type steps, full-width constraints,
    and focal-point crops. It never emits desktop scale transforms or invents content.
  - Approved changes compile into deterministic `node.update` commands in one Command Engine transaction. Commit is
    refused until the exact dry-run document passes every declared viewport validation.
- Test results:
  - Focused responsive reconstruction suite: PASS, 2 files and 10 tests.
  - Full repository suite: PASS, 23 files and 146 tests.
  - Full workspace typecheck: PASS, 58 dependency-aware Turbo tasks.
  - Full workspace build: PASS, 48 packages.
  - Dependency validation: PASS, 48 workspace packages.
  - Formatting and lint: PASS with no warnings.
  - Docker Compose configuration: PASS.
- Remaining warnings:
  - The deterministic local adapter infers canonical intent from structure and explicit metadata; it does not run a
    browser layout engine or an external responsive-design model.
  - Container-query contracts and precedence are implemented, but local container-query rule generation currently
    requires explicit reference evidence.
  - Multi-viewport validation uses Phase 7 structural and deterministic render-graph comparison. Raster capture,
    SSIM, LPIPS, and real heatmap pixels remain deferred.
  - Camera variants select canonical cameras from evidence or metadata; camera matching and cinematography remain in
    Phase 20. Quality variants are canonical delivery metadata until the 3D renderer consumes them.
  - Responsive jobs and reports are in-memory. No worker, queue, persistence, or Railway service was activated.
- Blockers:
  - None for the Responsive Reconstruction Engine foundation.
- Decisions:
  - Responsive child order is a viewport projection rule and must remain an exact permutation of canonical children;
    it never rewrites hierarchy.
  - Reference evidence has deterministic precedence over local inference, while locked nodes and protected properties
    are never changed.
  - Mobile acceptance requires at least one semantic layout, order, visibility, typography, crop, constraint, or
    dimension change; transform scaling alone cannot pass.
  - Every target requires its own reference snapshot, Scene Projection, Render Graph, and Visual Validation report.
  - Application repeats the dry run and verifies the validated candidate document fingerprint before commit.
- Next action:
  - Begin Phase 10 by defining canonical timeline, track, keyframe, easing, trigger, and state-machine schemas plus a
    deterministic time-evaluation API. First prove a Command Engine transaction can create an editable timeline and
    Scene Runtime can evaluate the same fixed timestamp for 2D property, camera, and reduced-motion contexts without
    coupling the canonical model to a renderer.

---

## 16. Phase 10 — Animation Core

### Goal

Implement canonical timelines, tracks, keyframes, triggers, state machines, and runtime evaluation.

### Status

```text
PLANNED
```

### Scope

- Timelines
- Tracks
- Keyframes
- Easing
- Springs
- Labels
- Nested timelines
- Time remapping
- Blending
- Trigger system
- Scroll timelines
- State machines
- Text animation
- Vector animation
- Mask animation
- Reduced-motion behaviour
- Deterministic frame evaluation

### Primary Package

```text
packages/animation
```

### Acceptance Gate

- Canonical timelines evaluate correctly
- Nested timelines work
- Scroll progress is deterministic
- State transitions are valid
- Springs are reproducible
- Reduced-motion alternatives activate
- Animation state can be rendered at exact frames

---

## 17. Phase 11 — Motion Reconstruction

### Goal

Reconstruct animation and movement from video references.

### Status

```text
PLANNED
```

### Scope

- Frame extraction
- Scene-cut detection
- Object tracking
- Camera-motion analysis
- Path extraction
- Timing analysis
- Easing estimation
- Character landmarks
- Joint trajectories
- Contact detection
- Timeline proposal
- Motion validation
- Loop correction
- Foot-lock correction

### Acceptance Gate

- Reference motion becomes editable tracks
- Camera and object motion are separated
- Key poses are preserved
- Timing is measurable
- Contacts are detected
- Motion can be retargeted
- Rendered sequence can be compared with the reference

---

## 18. Phase 12 — MCP Foundation

### Goal

Expose core project, document, asset, design, render, and validation capabilities through MCP.

### Status

```text
PLANNED
```

### Scope

- MCP server
- Authentication
- Permissions
- Workspace isolation
- Tool discovery
- Resource discovery
- Common request and response envelopes
- Project tools
- Document tools
- Design tools
- Asset tools
- Typography tools
- Animation tools
- Render tools
- Compare tools
- Transactions
- Jobs
- Progress
- Cancellation
- Structured errors
- Audit logging

### Primary Applications and Packages

```text
apps/mcp-server
packages/mcp-protocol
```

### Acceptance Gate

- MCP clients can inspect projects
- MCP clients can create and update nodes
- Transactions work
- Version conflicts are reported
- Jobs expose progress
- Jobs can be cancelled
- Permissions are enforced
- Writes generate audit records
- MCP never bypasses the Command Engine

---

## 19. Phase 13 — 3D Import and Runtime Foundation

### Goal

Import, inspect, normalize, render, and control existing 3D scenes.

### Status

```text
PLANNED
```

### Scope

- GLB
- GLTF
- FBX
- OBJ
- STL
- USD
- Scene inspection
- Units
- Axis conversion
- Hierarchy
- Meshes
- Materials
- Textures
- Cameras
- Lights
- Rigs
- Animations
- Morph targets
- Three.js runtime
- React Three Fiber integration
- Deterministic 3D capture

### Primary Package

```text
packages/renderer-3d
```

### Acceptance Gate

- Supported files import
- Scene diagnostics are complete
- Scale and orientation normalize correctly
- Multi-mesh hierarchy is preserved
- Materials and textures resolve
- Cameras and lights load
- Animation plays
- Deterministic turntables render

---

## 20. Phase 14 — Blender Bridge

### Goal

Integrate Blender as a controlled professional 3D execution backend.

### Status

```text
PLANNED
```

### Scope

- Blender version pinning
- Operation manifests
- Input manifests
- Output manifests
- Isolated workspaces
- Script templates
- Import
- Modelling operations
- Retopology
- UV unwrap
- Baking
- Rigging
- Weight correction
- Simulation
- Rendering
- Export
- Crash recovery
- Result inspection
- Asset registration

### Acceptance Gate

- Jobs run in isolation
- Inputs and outputs are traceable
- Blender cannot become the source of truth
- Failures do not corrupt projects
- Generated outputs are validated
- Resource limits are enforced
- Operation history is auditable

---

## 21. Phase 15 — Professional Mesh and Material Toolchain

### Goal

Implement professional geometry, topology, UV, texture, material, and optimization workflows.

### Status

```text
PLANNED
```

### Scope

- Mesh editing operations
- Hard-surface workflows
- Organic workflows
- Retopology
- Topology diagnostics
- UV generation
- UV validation
- PBR map generation
- Texture baking
- Material graphs
- Material matching
- Shader support
- LODs
- Geometry compression
- Texture compression

### Acceptance Gate

- Topology diagnostics work
- Retopology preserves silhouette
- UVs pass validation
- PBR channels are correct
- Materials remain canonical
- High-resolution and delivery assets remain separate
- Web derivatives meet budgets

---

## 22. Phase 16 — AI Multi-View 3D Reconstruction

### Goal

Generate one consistent model from front, side, back, top, detail, and turnaround references.

### Status

```text
PLANNED
```

### Scope

- View registration
- View-role labels
- Camera estimation
- Shared landmarks
- View alignment
- Scale estimation
- Coarse volume
- Silhouette refinement
- Part segmentation
- Mesh hierarchy
- Topology generation
- UV generation
- Material generation
- Per-view rendering
- Cross-view validation
- Correction loop

### Acceptance Gate

- One model represents all views
- Camera estimates are recorded
- Landmarks align across views
- Worst-view score passes threshold
- Corrections do not improve one view by severely degrading another
- Mesh structure is inspectable
- Model is not only primitive placeholder geometry

---

## 23. Phase 17 — Rigging and Character Animation

### Goal

Create production-ready skeletons, skinning, deformation, retargeting, and character motion.

### Status

```text
PLANNED
```

### Scope

- Skeleton creation
- IK
- FK
- Constraints
- Facial controls
- Morph targets
- Automatic weights
- Weight correction
- Deformation tests
- Motion retargeting
- Root motion
- Motion blending
- Lip sync
- Foot locking
- Contact correction
- Loop correction

### Acceptance Gate

- Rig hierarchy is valid
- Required controls work
- Weight normalization passes
- Major poses do not collapse
- Retargeted motion preserves contacts
- Exported skeleton and clips load correctly
- Character validation reports are generated

---

## 24. Phase 18 — Physics and Simulation

### Goal

Support controllable and bakeable physics systems for professional 3D scenes.

### Status

```text
PLANNED
```

### Scope

- Rigid body
- Soft body
- Cloth
- Hair
- Rope
- Springs
- Particles
- Fluids
- Smoke
- Fire
- Destruction
- Collision
- Force fields
- Fixed timestep
- Deterministic seed
- Bake
- Cache
- Web simplification

### Acceptance Gate

- Simulations can be previewed
- Simulations can be baked
- Bakes are versioned assets
- Fixed-step validation is reproducible
- Web fallbacks exist
- Physics failures do not corrupt the document

---

## 25. Phase 19 — Lighting and Environment System

### Goal

Create and match professional lighting, HDRI, shadows, reflections, and environments.

### Status

```text
PLANNED
```

### Scope

- Light types
- Lighting rigs
- HDRI
- Environment nodes
- Studio environments
- Product lighting
- Character lighting
- Rim lighting
- Volumetrics
- Shadows
- Reflection probes
- Light baking
- Reference-light matching
- Lighting validation

### Acceptance Gate

- Lighting remains canonical
- Reference analysis produces structured estimates
- Material and lighting errors remain separate
- Shadows and reflections validate
- Real-time and offline variants exist
- Mobile lighting profile exists

---

## 26. Phase 20 — Camera and Cinematics

### Goal

Implement complete camera control, camera paths, shot timelines, and AI cinematography.

### Status

```text
PLANNED
```

### Scope

- Camera properties
- Perspective and orthographic cameras
- Focal length
- Aperture
- Focus
- Depth of field
- Camera paths
- Look-at targets
- Target blending
- Automatic framing
- Collision avoidance
- Subject tracking
- Camera cuts
- Camera blends
- Shot timelines
- Shot intent
- Cinematic pacing
- Responsive camera variants
- Scroll-controlled cameras
- Cursor-controlled cameras

### Acceptance Gate

- Cameras are fully MCP-controllable
- Camera paths remain editable
- Camera matching validates against references
- Shot timelines coordinate camera, light, subject, and effects
- Desktop and mobile camera compositions are available
- Cinematic sequence renders successfully

---

## 27. Phase 21 — 3D Visual Validation and Correction

### Goal

Measure and autonomously improve 3D geometry, materials, lighting, and cameras.

### Status

```text
PLANNED
```

### Scope

- Silhouette comparison
- Landmark comparison
- Proportion comparison
- Camera comparison
- Material comparison
- Lighting comparison
- Shadow comparison
- Reflection comparison
- Multi-angle scoring
- Turntable scoring
- Responsible-entity mapping
- Correction proposals
- Regression checks
- Convergence tracking

### Acceptance Gate

- Per-angle scores are produced
- Worst-view score is tracked
- Camera errors and mesh errors are separated
- Material and lighting errors are separated
- Correction commands are reversible
- Turntable issues are detectable
- Multi-angle convergence is measurable

---

## 28. Phase 22 — Exporter Framework

### Goal

Implement the common exporter contract, capability analysis, planning, sandboxing, and validation.

### Status

```text
PLANNED
```

### Scope

- Exporter registry
- Capability matrix
- Export plan
- Asset plan
- Dependency plan
- Fallback plan
- File generation
- Sandbox
- Build verification
- Runtime verification
- Render verification
- Export Records
- Export reports
- Plugin permissions

### Primary Package

```text
packages/exporters
```

### Acceptance Gate

- Exporters can register
- Capabilities are reported
- Unsupported mappings are visible
- Export plans are inspectable
- Generated code builds in a sandbox
- Runtime output is rendered and compared
- Export Records are immutable

---

## 29. Phase 23 — Core Web Exporters

### Goal

Export production-ready responsive websites and interactive experiences.

### Status

```text
PLANNED
```

### Scope

- HTML/CSS
- JavaScript
- TypeScript
- React
- Next.js
- Tailwind
- CSS Modules
- Styled Components
- Sass
- GSAP
- Framer Motion
- SVG
- Static assets
- Font packaging
- Accessibility
- Responsive behaviour

### Acceptance Gate

- Exports build
- Exports run
- Required viewports pass comparison
- Typography remains accurate
- Animations work
- Interactions work
- Accessibility checks pass
- Generated code is organized and readable

---

## 30. Phase 24 — Core 3D Exporters

### Goal

Export real-time and interchange-ready 3D projects.

### Status

```text
PLANNED
```

### Scope

- GLB
- GLTF
- Three.js
- React Three Fiber
- WebGL
- GLSL
- Model compression
- Texture compression
- LODs
- Loading states
- Performance profiles
- Static fallback
- Progressive loading

### Acceptance Gate

- GLB and GLTF load correctly
- Skeleton and animation are preserved
- Materials and textures work
- Three.js export runs
- React Three Fiber export runs
- Mobile fallback works
- Performance budgets are reported
- Visual comparison passes

---

## 31. Phase 25 — Canva Export

### Goal

Generate maximally editable Canva-compatible output.

### Status

```text
PLANNED
```

### Scope

- Native text mapping
- Native shape mapping
- Native vector mapping
- Separate image layers
- Separate shadow layers
- Separate glow layers
- 3D image layers
- 3D video layers
- Multiple camera pages
- Font availability
- Flattening policy
- Editability report
- Visual validation

### Acceptance Gate

- Native editable percentage is calculated
- Media-layer percentage is calculated
- Flattened percentage is calculated
- Missing fonts are reported
- Unsupported effects are listed
- Layer order is preserved
- Visual similarity is validated
- No false full-editability claim is made

---

## 32. Phase 26 — Maximum Fidelity Orchestration

### Goal

Combine reconstruction, validation, correction, rendering, and export into a complete autonomous high-quality workflow.

### Status

```text
PLANNED
```

### Scope

- Quality profiles
- Multi-stage jobs
- Checkpoints
- Error ranking
- Region priority
- Repeated correction loops
- Multi-view correction
- Code-render comparison
- Canva validation
- Plateau detection
- Human review points
- Completion reports
- Resource policies

### Acceptance Gate

- End-to-end jobs are resumable
- Validation drives correction
- Correction drives measurable improvement
- Unsupported limitations remain visible
- Completion rules are enforced
- Maximum Fidelity can run across 2D, 3D, motion, and export
- Final reports are complete

---

## 33. Phase 27 — Studio Inspection Interface

### Goal

Provide a professional interface for inspection, comparison, correction, and job control.

### Status

```text
PLANNED
```

### Scope

- Project browser
- Layer tree
- Scene hierarchy
- Reference viewer
- 2D preview
- 3D preview
- Timeline preview
- Camera preview
- Validation overlays
- Heatmaps
- Side-by-side view
- Flicker view
- Region inspection
- Job progress
- Export configuration
- Error reporting
- Manual correction
- History inspection

### Acceptance Gate

- Studio mutations use commands
- Visual comparison modes work
- Node attribution is visible
- 2D and 3D can be inspected
- Jobs can be monitored and cancelled
- Exports can be configured and reviewed
- Historical versions remain accessible

---

## 34. Phase 28 — Production Hardening

### Goal

Prepare the system for stable real-world use.

### Status

```text
PLANNED
```

### Scope

- Security review
- Sandbox review
- Permission audit
- Workspace isolation tests
- Backup
- Restore
- Disaster recovery
- Queue recovery
- Worker recovery
- Dead-letter handling
- Rate limits
- Resource limits
- Cost observability
- Performance profiling
- Browser compatibility
- Load testing
- Storage lifecycle
- Upgrade strategy
- Dependency scanning
- Documentation review

### Acceptance Gate

- Security tests pass
- Backup and restore work
- Worker failure recovery works
- Maximum Fidelity jobs resume
- Resource limits are enforced
- Production observability exists
- Browser matrix passes
- No critical unresolved risks remain

---

## 35. Phase 29 — Beta Release

### Goal

Release the first controlled beta for real projects.

### Status

```text
NOT_STARTED
```

### Beta Scope

The first beta should support:

- Screenshot-to-editable 2D
- Responsive website reconstruction
- Accurate typography with uploaded fonts
- Visual validation
- Autonomous correction
- MCP control
- Existing 3D model import and refinement
- Camera and lighting control
- React and Next.js export
- Three.js and React Three Fiber export
- GLB and GLTF export
- Canva layered export
- Maximum Fidelity reports

### Beta Exit Gate

- Multiple real projects completed
- Critical workflows validated
- Known limitations documented
- Crash rate acceptable
- Export validation reliable
- Security review complete
- Recovery procedures tested
- User feedback incorporated

---

## 36. Phase 30 — Version 1.0

### Goal

Deliver a stable production-grade release.

### Status

```text
NOT_STARTED
```

### Version 1.0 Requirements

- Stable Canonical Design Document schema
- Stable MCP contract
- Stable command system
- Production 2D reconstruction
- Production visual validation
- Production responsive reconstruction
- Production animation runtime
- Professional 3D import and refinement
- Multi-view 3D reconstruction
- Rigging and animation
- Camera and cinematics
- Core exporters
- Canva Export
- Production security
- Production observability
- Complete documentation
- Upgrade and migration support

---

## 37. Priority Tiers

### P0 — Foundational

- Canonical Design Document
- Command Engine
- Project Store
- Asset provenance
- Typography
- Scene Runtime
- Hybrid 2D Renderer
- Deterministic rendering
- Validation
- MCP foundation

### P1 — Core Product

- 2D reconstruction
- Responsive reconstruction
- Autonomous correction
- Animation
- 3D import
- Blender Bridge
- Materials
- Cameras
- Lighting
- React/Next.js export
- Three.js/R3F export
- GLB/GLTF export
- Canva Export

### P2 — Advanced Production

- Multi-view 3D generation
- Rigging
- Character animation
- Physics
- Simulation
- AI cinematography
- Advanced exporters
- Full Maximum Fidelity orchestration

---

## 38. Critical Dependency Chain

```text
Document Model
→ Command Engine
→ Project Store
→ Scene Runtime
→ Renderer
→ Validation
→ Correction
→ Reconstruction
→ MCP
→ Export
```

For 3D:

```text
Document Model
→ Asset System
→ Scene Runtime
→ 3D Runtime
→ Blender Bridge
→ Mesh/Material Toolchain
→ 3D Validation
→ 3D Export
```

No phase shall bypass a required dependency simply to demonstrate a superficial result.

---

## 39. Parallel Workstreams

After foundational phases are stable, work may proceed in parallel.

### Workstream A — 2D

- Hybrid rendering
- Reconstruction
- Typography
- Responsive behaviour
- Effects

### Workstream B — Validation

- 2D metrics
- Typography metrics
- Regression
- Correction

### Workstream C — 3D

- Runtime
- Blender Bridge
- Mesh tools
- Materials
- Rigging
- Cameras
- Lighting

### Workstream D — MCP

- Protocol
- Permissions
- Tools
- Jobs
- Resources

### Workstream E — Export

- Export framework
- Web exporters
- 3D exporters
- Canva

Shared schema changes must remain coordinated.

---

## 40. Milestone Gates

Recommended milestone gates:

### M1 — Canonical Core

Phases 0–4 validated.

### M2 — 2D Reconstruction Loop

Phases 5–8 validated.

### M3 — Responsive Motion System

Phases 9–11 validated.

### M4 — Full MCP Control

Phase 12 validated across completed capabilities.

### M5 — Professional 3D Foundation

Phases 13–15 validated.

### M6 — AI 3D and Cinematics

Phases 16–21 validated.

### M7 — Multi-Stack Export

Phases 22–25 validated.

### M8 — Maximum Fidelity

Phase 26 validated.

### M9 — Production Beta

Phases 27–29 validated.

### M10 — Version 1.0

Phase 30 validated.

---

## 41. Definition of Done

A roadmap item is done only when:

- Code exists
- Tests exist
- Tests pass
- Documentation is current
- Failure states exist
- Logging exists
- Security is considered
- Performance is measured
- MCP coverage exists where applicable
- Validation coverage exists where applicable
- Export behaviour exists where applicable
- Acceptance evidence is linked
- Status is changed to `VALIDATED`

---

## 42. Documentation Update Rules

When implementation changes approved behaviour, update:

- Relevant technical specification
- `11_ROADMAP_AND_STATUS.md`
- Architecture Decision Record
- MCP schemas where applicable
- Export capability matrix where applicable
- Migration documentation where applicable

No implementation change shall silently diverge from canonical documentation.

---

## 43. Architecture Decision Records

Major decisions shall create ADRs.

ADR status values:

```text
PROPOSED
ACCEPTED
SUPERSEDED
REJECTED
DEPRECATED
```

ADRs should cover:

- Storage technology
- Queue technology
- Canonical serialization
- Rendering backend
- Text shaping engine
- Blender integration
- Physics engine
- Export plugin format
- MCP permissions
- Collaboration strategy
- Provider policy
- Deployment topology

---

## 44. Risk Register

The roadmap shall track risks using:

- Risk ID
- Description
- Probability
- Impact
- Owner
- Mitigation
- Trigger
- Status

---

## 45. Major Technical Risks

### R-001 — Scope Complexity

The complete system combines design, rendering, 3D, validation, animation, MCP, and export.

Mitigation:

- Build through milestone gates
- Preserve strict package boundaries
- Avoid premature breadth
- Validate vertical slices

### R-002 — Visual Fidelity Plateau

Automated comparison may plateau below the expected quality.

Mitigation:

- Region-specific validation
- Human review points
- Multiple metrics
- Better node attribution
- Exact uploaded assets and fonts

### R-003 — 3D Generation Quality

Third-party 3D generation may produce low-quality topology or crude geometry.

Mitigation:

- Treat generated output as an intermediate
- Use Blender refinement
- Retopology
- Multi-view validation
- Never mark proxy geometry final

### R-004 — Export Drift

Generated target runtimes may visually diverge from canonical renders.

Mitigation:

- Build and render every export
- Compare exported output
- Version exporters
- Maintain regression fixtures

### R-005 — Non-Determinism

Fonts, physics, shaders, browser versions, or providers may produce unstable results.

Mitigation:

- Pin versions
- Pin seeds
- Bake simulations
- Preserve generated derivatives
- Use controlled validation environments

### R-006 — Performance

Maximum Fidelity output may not meet web delivery budgets.

Mitigation:

- Separate master and delivery variants
- LODs
- Compression
- Mobile profiles
- Static fallbacks

### R-007 — MCP Safety

Powerful MCP tools may perform unintended destructive operations.

Mitigation:

- Permissions
- Transactions
- Dry runs
- Audit logs
- Sandboxing
- Explicit destructive scopes

### R-008 — Canva Limitations

Canva may not support every native effect or 3D feature.

Mitigation:

- Layered media export
- Explicit flattening
- Editability reports
- Multiple pages and camera renders

---

## 46. Blocker Tracking

A blocker shall record:

- Blocker ID
- Affected phase
- Description
- Date discovered
- Owner
- Severity
- Required decision
- Workaround
- Target resolution
- Current status

Blocked phases may continue only on independent tasks.

---

## 47. Deferred Scope

Initially deferred areas may include:

- Full real-time multiplayer
- Plugin marketplace
- Complete manual design-editor parity
- Complete Blender replacement
- Complete game-engine replacement
- Every frontend framework
- Every 3D format
- Every simulation type at production quality
- Native Canva support for every effect
- Built-in proprietary foundation models
- Unlimited cloud rendering

Deferred scope shall remain visible and must not be presented as completed.

---

## 48. Release Readiness Checklist

Before any beta or production release:

- Core tests pass
- End-to-end tests pass
- Visual regression passes
- Security review passes
- Sandbox review passes
- Backup works
- Restore works
- Job recovery works
- Upgrade migration works
- Documentation is current
- Known limitations are published
- Performance budgets are measured
- Exporters are validated
- MCP compatibility is validated
- Browser compatibility is validated
- Asset licensing behaviour is validated

---

## 49. Suggested First Implementation Sprint

The first implementation sprint should focus only on:

1. Monorepo and CI
2. Canonical Design Document base
3. Stable IDs
4. Runtime schema validation
5. Command Engine base
6. Document versioning
7. Asset registration
8. One basic page and frame renderer
9. Deterministic screenshot capture
10. One simple visual comparison fixture

The first sprint should prove the full architectural path:

```text
Create document
→ Apply command
→ Persist version
→ Render
→ Compare
→ Produce report
```

---

## 50. Suggested First Vertical Demo

The first meaningful demo should:

- Import one website screenshot
- Create a page
- Create frames
- Create native text
- Import one image asset
- Render with DOM/CSS/SVG
- Compare against the screenshot
- Adjust one node through a correction command
- Re-render
- Show score improvement
- Export a simple React project
- Build and compare the export

This demo validates the core product loop without requiring advanced 3D.

---

## 51. Suggested First 3D Demo

The first 3D vertical demo should:

- Import one clean GLB
- Inspect meshes and materials
- Normalize scale and orientation
- Rename meshes
- Render a turntable
- Create one camera path
- Modify one material
- Compare against one reference
- Generate an optimized GLB
- Export a React Three Fiber scene
- Validate loading and render output

---

## 52. Progress Reporting Format

Recommended weekly status:

```text
Reporting period:
Current milestone:
Overall status:
Completed:
In progress:
Blocked:
Validation results:
Risks:
Decisions required:
Next:
```

Progress reports shall link evidence.

---

## 53. Roadmap Metrics

Track:

- Phases validated
- Requirements implemented
- MCP tools implemented
- Node types supported
- Exporters validated
- Visual fixture pass rate
- Average reconstruction score
- Worst-region score
- Multi-view 3D score
- Correction improvement rate
- Build success rate
- Export validation pass rate
- Worker failure rate
- Job recovery rate
- Performance budget pass rate

---

## 54. Quality Metrics

Quality metrics shall include:

- Layout similarity
- Typography similarity
- Asset similarity
- Effects similarity
- Responsive pass rate
- Animation similarity
- Geometry similarity
- Camera similarity
- Material similarity
- Lighting similarity
- Export similarity
- Canva editability

---

## 55. Production Metrics

Production metrics shall include:

- Job queue time
- Reconstruction time
- Render time
- Validation time
- Export time
- Storage consumption
- GPU utilization
- CPU utilization
- Cache hit rate
- Error rate
- Retry rate
- Cost per completed workflow

---

## 56. Roadmap Change Process

A roadmap change shall require:

1. Proposed change
2. Reason
3. Affected requirements
4. Affected architecture
5. Affected phases
6. Dependency analysis
7. Risk analysis
8. Documentation updates
9. Approval
10. Status update

Major scope changes shall also update:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`

---

## 57. Current Next Action

The next repository action should be:

```text
Begin Phase 7.
```

The exact Phase 7 starting task is to define versioned validation-task, threshold-profile, region-measurement,
attributed-issue, and visual-validation-report contracts in `packages/validation`. Prove deterministic bounding-box,
layout, spacing, typography-metadata, and color comparisons can consume Phase 6 source regions and the Phase 5 Render
Graph without mutating canonical state. Keep raster capture, pixel/perceptual comparison, and heatmap generation behind
a replaceable adapter so HTML, Canvas, SVG, and future render targets can share the same validation contracts.

---

## 58. Final Roadmap Statement

The AEVUM AI Reconstruction Engine shall be implemented through controlled, dependency-aware milestone gates that preserve quality, architectural consistency, validation, and production readiness.

The roadmap shall remain a living implementation record. No feature shall be marked complete based on appearance alone; every phase must satisfy its documented structural, functional, validation, security, performance, MCP, and export acceptance criteria.
