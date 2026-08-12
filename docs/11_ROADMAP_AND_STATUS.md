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

### 5.1 Architecture Implemented vs. Production Capability Implemented

*(Added during the Phase 17 Claude onboarding audit, 2026-08-09, to keep phase `VALIDATED` status
from being read as end-user product completeness.)* A phase being `VALIDATED` means its documented
architecture, contracts, and tests pass — it does not by itself mean the end-user-facing capability
behind that architecture is production-complete. As of Phase 16, the following gaps are real and
intentional, not regressions:

- **Studio (`apps/studio`)**: architecture ownership declared only; no Figma-like canvas, screenshot
  upload flow, rendered editable layers, inspector, timeline, or 3D viewport UI exists yet.
- **2D reference understanding**: `packages/reconstruction`'s analysis stage is a deterministic,
  manifest-driven adapter (Phase 6 MVP), not a production computer-vision or multimodal model. "Any
  screenshot reconstructs pixel-perfectly" is not yet a real capability.
- **Agent reasoning**: `packages/agent-planner` ships only a deterministic, non-LLM planning
  provider (Phase 13). No external LLM (Anthropic, OpenAI, or otherwise) is wired into the Agent.
- **Exporters**: every target-stack exporter (`exporters/react`, `exporters/nextjs`, `exporters/
  threejs`, etc.) and `packages/exporters` itself remain Phase 23+ `PLANNED` placeholder shells; no
  stack produces real generated code yet.
- **Workers**: every `apps/*-worker` app besides the two production services is an intentionally
  inactive in-memory shell with no queue, listener, or deployment.
- **`apps/api`**: deployed and healthy on Railway, but implements only health/readiness endpoints —
  it is not yet the general project/asset/design REST backend described in the product docs.

The most production-mature layer today is the MCP server (`apps/mcp-server`, Phase 12) and the
local Blender Bridge (`apps/blender-bridge`, Phases 15-16), both backed by real tests against real
infrastructure (Supabase-authenticated MCP calls, a real local Blender 5.1.2 binary).

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
VALIDATED
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
    Phase 21. Quality variants are canonical delivery metadata until the 3D renderer consumes them.
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
VALIDATED
```

### Scope

- Timelines
- Tracks
- Keyframes
- Easing
- Springs
- Labels
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
packages/animation-core
```

### Acceptance Gate

- Canonical timelines evaluate correctly
- Tracks, clips, and keyframes evaluate deterministically
- Scroll progress is deterministic
- State transitions are valid
- Springs are reproducible
- Reduced-motion alternatives activate
- Animation state can be rendered at exact frames

### Implementation Record (2026-08-02)

- Previous status: `PLANNED`
- New status: `VALIDATED`
- Evidence:
  - Canonical Design Document schema `1.3.0` adds versioned timelines, tracks, clips, keyframes, markers, triggers,
    events, library-independent easing, reduced-motion timeline references, and versioned state machines.
  - `packages/animation-core` exposes immutable timeline and state-machine creation, deterministic fixed-time and
    normalized-progress evaluation, structured interpolation, easing evaluation, reduced-motion resolution, and
    structured validation diagnostics.
  - The Command Engine registers `timeline.create`; a tested atomic transaction persists canonical timelines without
    bypassing audit, version, validation, or immutability rules.
  - Scene Runtime `1.1.0` resolves responsive motion first, evaluates animation second, and supplies only resolved node
    values plus animation provenance to the Hybrid 2D Render Graph.
  - `apps/animation-worker` validates and evaluates in-memory jobs and has no listener, start command, deployment
    configuration, or active Railway service.
- Test results:
  - `pnpm validate:docker` passed (`docker compose config`).
  - `pnpm validate` passed: 12 canonical docs, 50 workspace dependency boundaries, formatting, lint, 61 typecheck
    tasks, 25 test files / 156 tests, and 50 package builds.
  - Focused Phase 10 and affected regression suite passed 68 tests before the full repository run.
- Remaining warnings:
  - None from the acceptance checks.
- Remaining limitations:
  - Nested timelines, time remapping, cross-track blending, sampled custom curves, and formal animation bindings are
    deferred.
  - Spring evaluation is deterministic metadata-driven interpolation, not a continuous simulation or playback loop.
  - Browser playback, CSS, GSAP, Framer Motion, Three.js, exporter adapters, and automatic motion reconstruction are
    not implemented in this phase.
- Blockers:
  - None for the Animation Core foundation.
- Decisions:
  - Canonical animation records live in the Design Document; playback state and evaluation output remain disposable
    runtime data.
  - Responsive motion policy is node-specific and resolves before animation evaluation.
  - Fixed-time evaluation sorts tracks by layer and stable ID and never mutates source timelines or nodes.
  - State-machine guards are typed data comparisons; arbitrary expressions are prohibited from the core runtime.
- Next action:
  - Begin Phase 11 by defining an immutable, versioned motion-analysis task and replaceable video-frame analysis adapter
    contract that emits traceable canonical timeline proposals. Prove a deterministic two-frame position path can be
    converted into a reviewable `timeline.create` Command Engine plan without executing it automatically.

---

## 17. Phase 11 — Motion Reconstruction

### Goal

Reconstruct animation and movement from video references.

### Status

```text
VALIDATED
```

### Scope

- Immutable versioned motion tasks
- MP4, MOV, WebM, GIF, and image-sequence source contracts
- Replaceable frame-provider adapters
- Deterministic frame observations
- Position, rotation, scale, opacity, and visibility analysis
- Camera-motion analysis
- Object-path extraction
- Timing analysis
- Easing estimation
- Editable keyframe detection
- Canonical timeline proposals
- Command Engine plans
- Motion validation
- Confidence, evidence, diagnostics, and immutable reports
- Animation Core runtime evaluation

### Acceptance Gate

- Motion Tasks are immutable and versioned
- Frame adapters are replaceable
- Reference motion becomes editable tracks
- Camera and object motion are separated
- Key poses are preserved
- Timing is measurable
- Timeline proposals are Phase 10 compatible
- Motion validation reports precise failures
- Generated timelines evaluate through Animation Core
- Command plans never bypass the Command Engine
- Tests and builds pass

### Current Phase 11 Evidence

Status update:

- Date: 2026-08-02
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence: `packages/motion-reconstruction` now owns immutable versioned motion tasks, MP4/MOV/WebM/GIF/image-
  sequence source contracts, a replaceable `MotionFrameProvider`, deterministic frame observations, object and camera
  track analysis, confidence and evidence lineage, editable keyframe detection, canonical Phase 10 timeline proposals,
  structured validation, serialization, fixed-time runtime samples, and immutable reports. The Command Engine now
  exposes canonical `timeline.update` and `timeline.delete` operations alongside `timeline.create`, including reference
  checks and audit events. `apps/motion-reconstruction-worker` validates and composes in-memory jobs only; it has no
  listener, queue, start command, persistence adapter, or Railway activation.
- Validation results:
  - `pnpm validate:docker`: PASS; Docker Compose resolves the Redis service, network, and volume
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 52 workspace packages
  - `pnpm format:check`: PASS for 340 files
  - `pnpm lint`: PASS for 341 files with no warnings
  - `pnpm typecheck`: PASS, 64 Turbo tasks including dependency builds
  - `pnpm test`: PASS, 27 test files and 164 tests; 8 tests cover Phase 11 unit and integration behavior
  - `pnpm build`: PASS, 52 Turbo package builds
  - `pnpm validate`: PASS
- Remaining warnings:
  - The current deterministic frame provider consumes validated observation metadata; it does not decode video or
    infer pixels. FFmpeg, OpenCV, MediaPipe, and Blender remain replaceable future adapters.
  - Camera classification is deterministic for pan, orbit, dolly, zoom, crane, and static evidence, but does not yet
    decompose simultaneous compound camera moves.
  - Scene-cut inference, optical flow, occlusion recovery, object discovery, audio synchronization, raster heatmaps,
    and rendered-video comparison are deferred.
  - Character landmarks, joint trajectories, contact detection, retargeting, loop correction, and foot locking belong
    to later character rigging and animation phases; Phase 11 does not claim those capabilities.
  - Command plans are reviewable and executable by the Command Engine but are never auto-applied by Motion
    Reconstruction.
- Blockers:
  - None for the deterministic Motion Reconstruction foundation.
- Decisions:
  - Motion evidence is supplied through a narrow adapter contract so media backends can change without changing the
    analysis, validation, proposal, or report APIs.
  - Every detected track retains confidence, source-frame indexes, evidence, and diagnostics. Generic motion-different
    messages are prohibited.
  - Keyframe detection preserves starts, ends, stops, direction changes, speed changes, and visibility changes while
    omitting redundant intermediate samples.
  - Timeline proposals use Phase 10 schemas and canonical property paths. Animation Core evaluates start, midpoint,
    and end report samples without introducing playback.
  - Create, update, and delete intents compile into exactly one deterministic Command Engine transaction command.
    Motion Reconstruction never owns document mutation.
  - The worker remains inactive and in-memory until queue, persistence, retry, health, cancellation, and deployment
    infrastructure exists.
- Next action:
  - Begin Phase 12 by defining versioned MCP request, response, error, resource, tool, job-progress, and cancellation
    envelopes in `packages/mcp-protocol`; add authentication, permission, and workspace-isolation contracts; then prove
    one read tool and one write tool in `apps/mcp-server`, with every write translated into a version-checked Command
    Engine transaction and an audit record. Do not expose worker activation or direct canonical mutation.

---

## 18. Phase 12 — MCP Foundation

### Goal

Expose core project, document, asset, design, render, and validation capabilities through MCP.

### Status

```text
VALIDATED
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

### Current Phase 12 Evidence

Status update:

- Date: 2026-08-09
- Owner: Codex
- Previous status: IN_PROGRESS
- New status: VALIDATED
- Evidence: `packages/mcp-protocol` now owns protocol `1.0.0`, strict request/response envelopes, structured errors,
  actor/role/permission schemas, dedicated schemas for twelve initial tools, audit/idempotency records, and transaction,
  job-progress, and cancellation foundations. `apps/mcp-server` now owns signed Supabase JWT verification, database-backed
  membership authorization, a transport-independent registry/executor, Command Engine-backed writes, dry runs,
  optimistic concurrency, persistent idempotency, audit logging, bounded HTTP JSON transport, explicit CORS, security
  headers, timeouts, replaceable rate limiting, health/readiness/version routes, graceful shutdown, and Railway build
  configuration. `packages/project-store` provides a production Supabase adapter and atomic document/version/audit/
  idempotency commit function. No MCP write directly mutates canonical state.
- Validation results:
  - Focused MCP validation: PASS, 7 files and 38 tests covering protocol, JWT security, environment profiles, migration
    controls, Command Engine locks, registry behavior, read/write integration, dry runs, idempotency, concurrency,
    workspace isolation, rate limits, timeouts, HTTP hardening, health, and readiness
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 52 workspace packages
  - `pnpm format:check`: PASS for 366 files
  - `pnpm lint`: PASS for 367 files with no warnings
  - `pnpm typecheck`: PASS, 66 Turbo tasks
  - `pnpm test`: PASS, 32 test files and 188 tests
  - `pnpm build`: PASS, 52 Turbo tasks
  - `pnpm validate`: PASS
  - `pnpm validate:docker`: PASS; resolved Compose model is valid
  - Supabase linked migration lint: PASS with no schema errors
  - Supabase migrations `20260802000100_create_mcp_foundation.sql` and
    `20260809000100_enable_mcp_audit_retention.sql`: APPLIED and confirmed in remote migration history
  - Production `mcp-server` environment profile: PASS without exposing values
  - Real Supabase-backed local `/health`, `/ready`, and `/version`: PASS with HTTP 200 for all three
  - Exact local `node apps/mcp-server/dist/production-smoke.js` flow: PASS with ephemeral Auth creation, sign-in,
    authenticated read, dry run, committed Command Engine write, persisted document/version/audit/idempotency records,
    idempotent replay, workspace denial, and verified cleanup
  - Railway service `mcp-server`: ACTIVE at `https://mcp-server-production-209e.up.railway.app`; the migrated service
    builds all MCP dependencies and passes its `/health` gate
  - Deployed `/health`, `/ready`, and `/version`: PASS with HTTP 200; authenticated `POST /mcp` read, dry run, write,
    persistence, replay, workspace isolation, and permission denial: PASS
  - Deployed malformed, invalid-signature, expired, wrong-issuer, and wrong-audience JWT rejection: PASS; payload limit,
    CORS denial, security headers, structured error envelope, and live rate-limit checks: PASS
  - Railway restart validation: PASS; readiness recovered, the original JWT remained valid, the committed document
    remained intact, and the pre-restart idempotency key replayed the original transaction before verified cleanup
  - Secret and residual-data review: PASS; Railway deployment-log scan found zero credential patterns, ignored environment
    files remain untracked, and the final sweep found zero ephemeral smoke users or workspaces
  - `git diff --check`: PASS
- Remaining warnings:
  - The included rate limiter is in-process and appropriate for one replica. A Redis provider is required before strict
    shared quotas across multiple replicas.
  - Multi-command transaction lifecycle tools, persistent job queues, broad MCP domain coverage, WebSockets, and
    resource discovery are deferred; versioned foundation contracts exist where required.
  - Railway CLI snapshot deployment requires a temporary root mirror of the package config because CLI 5.30 does not
    discover nested config files. The canonical config remains `apps/mcp-server/railway.toml`; Git deployment requires
    Railway's Config File setting `/apps/mcp-server/railway.toml`, as recorded in `docs/MCP_DEPLOYMENT.md`.
  - Railway's free-plan three-service quota required removing the stopped, failed, volume-free `@aevum/asset-worker`
    cloud placeholder to provision `mcp-server`. The asset-worker package remains in the repository and stays inactive.
- Blockers:
  - None.
- Decisions:
  - The production-smoke Auth failure was caused by a generated 77-character password exceeding Supabase Auth's 72-byte
    limit. The runner now generates a bounded strong password and reports only sanitized code/status diagnostics.
  - Production authorization is resolved from signed Supabase identity plus database membership; token metadata never
    grants workspace or project access.
  - Production MCP persistence uses the Supabase data API and service role after authorization. Direct database URLs
    remain required for the full platform profile, but are not falsely required by `AEVUM_SERVICE=mcp-server`.
  - Every initial write requires an expected document version and idempotency key, compiles to one Command Engine
    transaction, and persists the canonical document, immutable version, audit, and idempotency result atomically.
  - Audit scope identifiers are intentionally not foreign-keyed so denied probes against nonexistent workspaces remain
    recordable without allowing access.
  - Authenticated denials retain the verified Supabase actor identity in audit records even when membership resolution
    fails; only unauthenticated failures use the `anonymous` actor.
  - The MCP and API services remain separate deployments.
- Next action:
  - Begin Phase 13 by implementing provider-neutral Agent sessions, bounded context, explicit capability-aware plans,
    typed MCP execution, dry-run-first writes, approval, optimistic-concurrency replanning, verification, cancellation,
    structured audit, and deterministic integration fixtures. Do not create a privileged mutation path.

---

## 19. Phase 13 — AI Agent Orchestration and Tool Execution Engine

### Goal

Allow an AI Agent to understand user intent, assemble relevant canonical context, create inspectable plans, execute
actor-permitted MCP tools, observe results, verify completion, and replan within explicit budgets.

### Status

```text
VALIDATED
```

### Scope

- Immutable versioned Agent sessions, runs, observations, outcomes, and audit records
- Structured goals and provider-neutral intent analysis
- Relevance-driven context selection and deterministic context budgets
- Explicit dependency-ordered plans and cycle validation
- MCP capability discovery and typed transport-independent client
- Tool safety classification and configurable approval policy
- Dry-run-first writes, deterministic idempotency, optimistic concurrency, and bounded replanning
- Retry classification, execution budgets, cancellation, and explicit verification strategies
- Prompt-injection and tool-result trust boundaries
- Replaceable persistence and deterministic provider adapters
- Inactive Agent Worker shell with health, readiness, cancellation, and graceful shutdown

### Primary Applications and Packages

```text
packages/agent-core
packages/agent-context
packages/agent-planner
packages/agent-runtime
apps/agent-worker
```

### Acceptance Gate

- Sessions, runs, intents, plans, steps, observations, outcomes, and audits are immutable and versioned
- Plans use actor-visible capabilities and report capability gaps
- Reads and writes cross MCP with authentication, scope, correlation, and permissions preserved
- Writes are dry-run first, version checked, idempotent, approved where required, and canonically verified
- Version conflicts refresh state and replan without data loss
- Budgets, retries, cancellation, protected properties, and destructive safety are enforced
- Untrusted design and tool-result content cannot become Agent instructions
- Deterministic and integration tests pass
- Existing production services remain healthy
- Agent Worker remains inactive

### Current Phase 13 Evidence

Status update:

- Date: 2026-08-09
- Owner: Codex
- Previous status: IN_PROGRESS
- New status: VALIDATED
- Evidence: `packages/agent-core` defines immutable, versioned goals, sessions, runs, observations, outcomes, audits,
  budgets, diagnostics, approvals, and verification contracts. `packages/agent-context` provides deterministic,
  relevance-ranked context assembly with category and character budgets, omission diagnostics, working memory, and
  strict trusted-instruction boundaries. `packages/agent-planner` provides provider-neutral intent analysis, explicit
  dependency-ordered plans, capability-gap reporting, safety classification, approval requirements, and deterministic
  planning fixtures. `packages/agent-runtime` executes typed MCP operations with actor scope, dry-run-first writes,
  optimistic concurrency, deterministic idempotency, bounded retries and replanning, cancellation, timeouts, protected
  properties, post-write verification, and structured agent audit. `apps/agent-worker` is an inactive in-memory worker
  shell with health, readiness, version, cancellation, stage tracking, and graceful shutdown; it has no Railway
  manifest or public job-ingress route.
- Validation results:
  - Focused Phase 13 validation: PASS, 5 files and 27 tests
  - Full test suite: PASS, 36 files and 208 tests
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 57 workspace packages
  - `pnpm format:check`: PASS for 407 files
  - `pnpm lint`: PASS for 408 files with no warnings
  - `pnpm typecheck`: PASS, 75 Turbo tasks
  - `pnpm build`: PASS for all 57 workspace packages
  - `pnpm validate`: PASS
  - `pnpm validate:docker`: PASS; the existing Compose model remains valid
  - Environment safety tests: PASS; production rejects fixture mode and requires an MCP server URL
  - Secret scan and ignored-environment review: PASS; no credential values or local environment files are included
  - `git diff --check`: PASS
  - Railway `@aevum/api`: ONLINE; deployed `/health` returned HTTP 200
  - Railway `mcp-server`: ONLINE; deployed `/health`, `/ready`, and `/version` returned HTTP 200
  - Vercel `design-system-aevum`: READY; production alias returned HTTP 200
  - Supabase linked migration history: synchronized through `20260809000100`
  - Railway `@aevum/blender-bridge`: intentionally OFFLINE
  - Agent Worker: intentionally inactive and not deployed
- Remaining warnings:
  - The deterministic provider is the only Phase 13 planning provider. External LLM provider adapters are deferred.
  - Agent persistence is replaceable but currently in-memory; no Phase 13 database migration was required or applied.
  - The Agent can execute only capabilities exposed by the Phase 12 MCP registry and reports unsupported intents as
    capability gaps instead of bypassing MCP.
  - The inactive worker is single-process and in-memory. Durable queues, distributed execution, streaming, and
    autonomous background operation are deferred.
- Blockers:
  - None.
- Decisions:
  - MCP remains the exclusive Agent tool boundary and the Command Engine remains the exclusive canonical write path.
  - Agent records retain structured decisions, observations, diagnostics, and tool references without storing private
    chain-of-thought.
  - All external design content and tool output remains untrusted context and cannot override system or user
    instructions.
  - Agent Worker deployment remains prohibited for this phase; existing production services were inspected only and
    were not recreated, relinked, or reconfigured.
- Next action:
  - Begin Phase 14 with canonical 3D import contracts and normalized scene-runtime projections for registered GLB and
    GLTF assets, then add deterministic inspection fixtures before implementing rendering or bridge execution.

---

## 20. Phase 14 — 3D Import and Runtime Foundation

### Goal

Import, inspect, normalize, render, and control existing 3D scenes.

### Status

```text
VALIDATED
```

### Scope

- Registered GLB and GLTF parsing and inspection
- Explicit coordinate, unit, rotation, quaternion, and transform conventions
- Stable canonical scene, group, model, primitive, material, texture, camera, and light identities
- Geometry/accessor metadata, local/world bounds, performance metrics, and diagnostics
- Embedded texture hashing, deduplication, derivative records, and import provenance
- Atomic reviewable `scene3d.import` Command Engine transaction
- Immutable Scene Runtime 3D projection with transforms, responsive cameras, quality, and Animation Core evaluation
- Deterministic renderer-neutral 3D Render Plan
- Authenticated, authorized, workspace-isolated MCP reads and dry-run-first transform write
- Deterministic Agent inspection, planning, write, and persisted-state verification

### Primary Package

```text
packages/renderer-3d
```

### Acceptance Gate

- Registered GLB and GLTF bytes parse through a mature standards-compliant library
- Untrusted resources are bounded and unsafe paths, network URIs, malformed buffers, and hash mismatches are rejected
- Scene diagnostics and performance metrics are immutable, deterministic, and serializable
- Canonical hierarchy and one independently addressable mesh node per primitive are preserved
- PBR materials, embedded texture derivatives, cameras, punctual lights, transforms, and provenance resolve
- Import is reviewable, dry-runnable, atomic, versioned, auditable, and rollback safe
- Scene Runtime resolves local/world transforms, bounds, visibility, responsive camera/quality, and camera timelines
- Render Plans are deterministic and renderer neutral
- MCP and Agent integration retain authentication, authorization, workspace isolation, permissions, idempotency, audit,
  protected-property enforcement, and Command Engine-only writes
- Tests, build, validation, Docker configuration, documentation, production health, and secret checks pass

### Current Phase 14 Evidence

Status update:

- Date: 2026-08-09
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence:
  - Canonical Design Document schema `1.4.0` adds explicit 3D conventions, quaternion transforms, `GROUP_3D`, geometry
    references, bounds, import provenance, full base PBR metadata, texture bindings, and enriched camera/light records.
  - The `1.3.0` to `1.4.0` migration adds conservative conventions and legacy geometry metadata without inventing
    unavailable geometry quality.
  - `@aevum/renderer-3d` uses glTF Transform `4.4.2` for real GLB/GLTF parsing, gl-matrix `3.4.4` for transform and
    camera math, and emits immutable inspection reports, import proposals, diagnostics, and Render Plans.
  - Real deterministic fixtures cover indexed cube, hierarchical multi-mesh, multi-material, textured, camera, light,
    and nested-transform scenes in both GLB and resource-backed GLTF forms.
  - `scene3d.import` commits the complete proposal atomically. Scene Runtime projects typed 3D records and Animation
    Core camera targets. The renderer plan contains ordered scene, camera, light, transform, mesh, material, draw, and
    end operations.
  - MCP tool version `1.1.0` exposes `three.inspect_asset`, `three.inspect_scene`, and
    `three.update_node_transform`; the deterministic Agent proves inspect, plan, dry-run, commit, and verification.
- Validation results:
  - Focused Phase 14 validation: PASS, 7 files and 43 tests
  - Full repository suite: PASS, 38 files and 218 tests
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 57 workspace packages
  - `pnpm format:check`: PASS for 420 files
  - `pnpm lint`: PASS for 421 files with no warnings
  - `pnpm typecheck`: PASS, 76 Turbo tasks
  - `pnpm build`: PASS for all 57 workspace packages
  - `pnpm validate`: PASS
  - `pnpm validate:docker`: PASS; existing Compose configuration remains valid
  - `git diff --check`: PASS
  - Secret-pattern scan: PASS with zero matches; `.env` and `.env.local` remain ignored
  - Supabase migration review: no Phase 14 database migration was required or created
  - Railway `@aevum/api`: ONLINE; deployed `/health` returned HTTP 200
  - Railway `mcp-server`: ONLINE; deployed `/health`, `/ready`, and `/version` returned HTTP 200
  - Vercel `design-system-aevum`: READY; production alias returned HTTP 200
  - Railway Blender Bridge: intentionally OFFLINE
  - Agent Worker: intentionally inactive and not deployed
- Remaining warnings:
  - Implemented import formats are GLB and GLTF only. FBX, OBJ, STL, USD, USDZ, and BLEND remain future adapters.
  - Skin, animation, morph-target, and advanced material-extension metadata is inspected and diagnosed but not executed.
  - External GLTF resources must be explicitly supplied by trusted asset resolution; the parser never performs network
    fetches. No upload or remote resource resolver was added.
  - Geometry editing/repair, decimation, retopology, UV editing, texture generation, advanced material authoring,
    rigging, physics, particles, simulations, HDRI execution, visual comparison, and 3D reconstruction are deferred.
  - Render Plans are renderer-neutral contracts. Production WebGL, Three.js, R3F, frame capture, turntables, and
    high-end rendering are not implemented.
- Blockers:
  - None.
- Decisions:
  - Canonical imported primitives remain independently addressable and retain source-index provenance.
  - Generic `node.update` remains the canonical transform mutation; no redundant 3D update command was introduced.
  - No new environment variable or Supabase migration was needed; import limits are typed caller configuration.
  - Existing Railway, Vercel, Supabase, and GitHub infrastructure was inspected but not recreated or reconfigured.
  - Blender Bridge remains inactive until a real version-pinned execution backend exists.
- Next action:
  - Begin Phase 15 by defining version-pinned Blender operation, input, and output manifests plus an isolated local
    workspace/process adapter with deterministic fixture validation. Do not activate Railway until a real Blender
    binary smoke test, sandbox boundary, timeout/cancellation, artifact provenance, and canonical command handoff pass.

---

## 21. Phase 15 — Blender Bridge

### Goal

Integrate Blender as a controlled professional 3D execution backend.

### Status

```text
VALIDATED
```

### Scope

- Blender 5.1 runtime compatibility and executable fingerprinting
- Versioned, finite operation, input, output, artifact, and lifecycle contracts
- Isolated per-job workspaces, process execution, budgets, timeout, cancellation, and cleanup
- Content-verified GLB/GLTF import with external-resource rejection
- Deterministic scene, object, mesh, material, camera, and light inspection
- Controlled object transforms, duplication, deletion, PBR updates, camera/light updates, and active-camera selection
- Deterministic GLB export with identity metadata and artifact provenance
- Renderer 3D proposal recovery and canonical identity reconciliation
- Atomic Command Engine handoff for all canonical writes
- Permissioned MCP tools and deterministic Agent planning
- Liveness, executable-backed readiness, diagnostics, and local real-binary smoke validation

### Acceptance Gate

- Jobs run in isolation
- Inputs and outputs are traceable
- Blender cannot become the source of truth
- Failures do not corrupt projects
- Generated outputs are validated
- Resource limits are enforced
- Operation history is auditable

### Current Phase 15 Evidence

Status update:

- Date: 2026-08-09
- Owner: Codex
- Previous status: PLANNED
- New status: VALIDATED
- Evidence:
  - `@aevum/blender-bridge` owns protocol `1.0.0`, a finite semantic operation registry, strict manifests, isolated
    workspaces, a shell-free process runner, bounded output, timeout/cancellation, artifact hashing, cleanup, runtime
    probing, liveness, readiness, and canonical reconciliation.
  - Blender executes only bridge-owned `probe.py` and `bootstrap.py` under `--background`, `--factory-startup`,
    `--disable-autoexec`, and `--python`; arbitrary Python, shell commands, Blender expressions, and caller script paths
    are not accepted by the protocol or MCP schemas.
  - Real Blender 5.1.2 with embedded Python 3.13.9 passed import, inspection, transform, duplication, deletion, PBR,
    camera, light, validation, GLB export, failure, timeout, cancellation, and complete Agent-to-MCP execution tests.
  - Exported identity metadata is recovered by `@aevum/renderer-3d`, compared with Canonical Design Document bindings,
    converted into Phase 14 proposals, and committed atomically through new whole-record material, camera, and light
    commands plus existing canonical node commands.
  - MCP tool version `1.2.0` exposes 14 disabled-by-default Blender tools with read, write, destructive, and export
    permissions. Existing production MCP remains healthy without a Blender adapter, and Railway Blender remains off.
  - The preferred ignored local variable is `BLENDER_EXECUTABLE_PATH`; the centralized Zod environment exposes typed
    Blender configuration, bounded resources, safe defaults, and a compatibility alias without committing the path.
- Validation results:
  - Production binary smoke: PASS; protocol `1.0.0`, Blender `5.1.2`, Python `3.13.9`, `win32`, headless, `SUPPORTED`
  - Real Blender integration suite: PASS, 1 file and 8 tests
  - Portable repository suite: PASS, 40 files and 226 tests
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 57 workspace packages
  - `pnpm format:check`: PASS for 438 files before this evidence-only roadmap update
  - `pnpm lint`: PASS for 439 files with no warnings
  - `pnpm typecheck`: PASS for all 57 workspace packages
  - `pnpm build`: PASS for all 57 workspace packages
  - `pnpm validate`: PASS
  - `pnpm validate:docker`: PASS; Compose remains valid and Docker was not required for Blender execution
  - Supabase linked migrations: synchronized through `20260809000100`; no Phase 15 migration was required or created
  - Railway `@aevum/api`: ONLINE; deployed `/health` returned HTTP 200
  - Railway `mcp-server`: ONLINE; deployed `/health`, `/ready`, and `/version` returned HTTP 200
  - Vercel `design-system-aevum`: READY; production alias returned HTTP 200
  - Railway `@aevum/blender-bridge`: intentionally OFFLINE
- Remaining warnings:
  - Phase 15 supports registered GLB/GLTF input and GLB derivative output only; external resources and network loading
    are rejected. FBX, OBJ, STL, USD, USDZ, BLEND, and remote adapters remain deferred.
  - Professional mesh editing, retopology, UV workflows, baking, advanced materials, rigging, simulation, rendering,
    and visual 3D validation remain Phase 16 or later work.
  - Local process isolation uses strict manifests, controlled scripts, environment allowlisting, filesystem containment,
    and budgets. It is not an operating-system container or remote multi-tenant sandbox.
  - The MCP server registers Blender schemas but enables them only when an explicit bridge adapter is supplied.
- Blockers:
  - None.
- Decisions:
  - Blender is an execution backend and artifact producer; it never owns canonical project state.
  - Validation-only dry runs do not launch Blender or mutate state. Execution always reconciles through an atomic
    Command Engine transaction, and failures leave the Canonical Design Document unchanged.
  - Input assets and output artifacts are content verified. Original assets are never overwritten; GLB outputs are
    derivative asset proposals with provenance.
  - Existing Railway, Vercel, Supabase, and GitHub infrastructure was inspected but not recreated or reconfigured.
  - Railway Blender remains inactive by design; local real-binary validation is the Phase 15 deployment boundary.
- Next action:
  - Begin Phase 16 by defining professional mesh/material semantic operation contracts and topology, UV, and PBR
    validation reports on top of the Phase 15 bridge. Preserve finite bridge-owned execution, identity reconciliation,
    immutable derivatives, and Command Engine-only writes before implementing advanced Blender operations.

---

## 22. Phase 16 — Professional Mesh and Material Toolchain

### Goal

Implement professional geometry, topology, UV, texture, material, and optimization workflows.

### Status

```text
VALIDATED
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

### Current Phase 16 Evidence

Status update:

- Date: 2026-08-09
- Owner: Codex
- Previous status: IN_PROGRESS
- New status: VALIDATED
- Evidence:
  - Professional protocol `1.0.0` adds strict deterministic selectors, operation safety classification, topology/UV/PBR
    reports, web-quality profiles, element mappings, structured diagnostics, and bounded growth estimation.
  - The bridge-owned Blender dispatcher implements finite mesh, topology, normal, UV, PBR, optimization, and LOD
    operations without exposing Python, shell, operator names, arbitrary modifiers, paths, add-ons, or network access.
  - Real Blender 5.1.2 tests prove extrusion, inset, bevel, applied subdivision, solidify, mirror, join, material
    separation, normal repair, duplicate-position repair, UV creation/unwrap/pack, PBR round trip, GLB export and
    Phase 14 reinspection, canonical geometry reconciliation, and decimation-based LOD generation.
  - MCP tool version `1.3.0` exposes five professional 3D reads and three bounded writes using existing asset,
    document, three, and Blender permissions. Unknown code fields are rejected, writes honor locks/version checks,
    dry runs avoid Blender, and output artifacts are persisted before post-write verification.
  - The deterministic Agent discovers professional capabilities and proves inspect, topology analysis, dry run, real
    bevel execution, derivative persistence, canonical reconciliation, reinspection, and measurable verification.
  - Topology edits preserve stable canonical object/primitive identities where unambiguous, register immutable GLB
    derivatives, and report partial or destroyed element identity honestly. Heavy topology remains outside the CDD.
- Validation results:
  - Real Blender suite: PASS, 1 file and 16 tests in 131.24 seconds; Blender 5.1.2, Python 3.13.9
  - Focused portable Phase 16 suite: PASS, 6 files and 33 tests
  - Full portable repository suite: PASS, 41 files and 233 tests
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 57 workspace packages
  - `pnpm format:check`: PASS for 440 files before this evidence-only update
  - `pnpm lint`: PASS for 441 files with no warnings
  - `pnpm typecheck`: PASS, 76 tasks across 57 packages
  - `pnpm build`: PASS for all 57 workspace packages
  - `pnpm validate`: PASS
  - `pnpm validate:docker`: PASS; Compose resolves Redis and `aevum-network`
  - Supabase linked migrations: synchronized through `20260809000100`; no Phase 16 migration was required
  - Railway `@aevum/api`: RUNNING and `/health` HTTP 200
  - Railway `mcp-server`: RUNNING and `/health`, `/ready`, `/version` HTTP 200
  - Vercel `design-system-aevum`: READY and production alias HTTP 200
  - Railway `@aevum/blender-bridge`: intentionally OFFLINE with no deployment
- Remaining warnings:
  - Loop cuts on complex rings, non-destructive modifier retention, selected-face/loose-part separation, voxel remesh,
    advanced cleanup, seam authoring, UV transform, texel-density estimates, and UDIM inspection remain EXPERIMENTAL.
  - Professional automatic/character retopology, sculpting, texture baking/painting/generation, arbitrary shader
    graphs, rigging, simulation, production rendering, and visual 3D comparison remain DEFERRED.
  - Geometry reconciliation currently requires exactly one directly owned canonical primitive for the edited object;
    ambiguous multi-primitive geometry updates are rejected instead of flattening or guessing.
- Blockers:
  - None.
- Decisions:
  - Existing `blender.read`, `blender.write`, `three.read`, and `three.write` permissions are sufficient; no permission
    sprawl or raw operation-manifest MCP endpoint was introduced.
  - No CDD schema or database migration was needed. Edited geometry is an asset derivative with canonical references,
    metadata, and provenance rather than raw production topology in document state.
  - Railway Blender remains inactive; Phase 16 production capability is validated against the configured local binary.
- Next action:
  - Begin Phase 17 with immutable multi-view reference-set, view-role, camera-estimate, landmark, and cross-view
    validation contracts before implementing any model generation. Reuse Phase 16 topology, UV, PBR, derivative,
    Command Engine, MCP, and Agent boundaries; do not introduce direct AI-to-Blender execution.

---

## 23. Phase 17 — AI Multi-View 3D Reconstruction

### Goal

Generate one consistent model from front, side, back, top, detail, and turnaround references.

### Status

```text
VALIDATED
```

This status covers the foundation scope only — see "Delivered vs. deferred" immediately below.

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

### Delivered vs. deferred against the original scope above

Per the explicit Phase 17 directive, this validation intentionally covers only the evidence
architecture **above** the model-generation boundary, and deliberately does not attempt the
scope items below the line. Delivered: view registration, view-role labels, camera estimation
(geometric, role-assumed, not vision-based), shared landmarks with real triangulation, view
alignment evidence, scale estimation (evidence-only, optional), silhouette-derived coarse-volume
constraints, silhouette refinement statistics, part segmentation evidence, and cross-view
validation. Deferred to a future phase: mesh hierarchy, topology generation, UV generation,
material generation, per-view rendering, and the render-compare correction loop — none of these
can exist without an actual reconstruction provider, which Phase 17 explicitly does not integrate.

### Acceptance Gate

**Note:** the gate below was written when Phase 17 was expected to produce a model. It is retained
verbatim for historical continuity; the criteria that require an actual generated model ("One
model represents all views", "Mesh structure is inspectable", "Model is not only primitive
placeholder geometry") are **not met by this validation and are not claimed** — they apply once a
real reconstruction provider is integrated in a future phase. The criteria this validation does
satisfy are marked below.

- One model represents all views — **NOT MET (deferred; no model is generated by this phase)**
- Camera estimates are recorded — **MET**
- Landmarks align across views — **MET** (real least-squares triangulation plus reprojection-error
  and image-space consistency checks; misaligned landmarks are flagged, not silently averaged)
- Worst-view score passes threshold — **MET** (readiness scoring is capped, not just averaged, by
  the presence of any unresolved conflict diagnostic)
- Corrections do not improve one view by severely degrading another — **N/A** (no correction loop
  exists yet; nothing to regress)
- Mesh structure is inspectable — **NOT MET (deferred; no mesh exists yet)**
- Model is not only primitive placeholder geometry — **NOT MET (deferred; no model exists yet)**

### Current Phase 17 Evidence

Status update:

- Date: 2026-08-09
- Owner: Claude (Codex-to-Claude handoff)
- Previous status: PLANNED
- New status: VALIDATED (foundation scope; see "Delivered vs. deferred" above)
- Evidence:
  - New package `packages/multiview-reconstruction` (`@aevum/multiview-reconstruction`) owns
    immutable versioned multi-view tasks, reference sets, view-role classification, camera
    estimates, landmark/correspondence evidence, silhouette evidence, part evidence, geometric
    constraints, coverage analysis, reconstruction-readiness scoring, conflict detection, a
    cross-view validation report, a provider-neutral reconstruction proposal, and a replaceable
    `MultiViewReconstructionProvider` interface with a deterministic test-double implementation.
  - Real, provider-independent mathematics: quaternion/vector algebra, perspective ray casting,
    least-squares multi-view triangulation (closest point to N skew rays), image-space and
    world-space reprojection error, and shoelace-formula silhouette statistics (bounds, centroid,
    area, aspect ratio) — verified against synthetic ground-truth points in unit tests, not just
    schema shape.
  - Camera estimation uses one honest, disclosed geometric assumption (`ROLE_ASSUMED_TURNTABLE`,
    confidence capped at 0.6) tied to a resolved, evidenced view role; `DETAIL`/unresolved roles
    honestly return an `UNKNOWN` camera rather than a fabricated pose. No real vision-based camera
    pose estimation exists.
  - View roles, landmark/part correspondence, and scale evidence all come from explicit caller
    hints (typically a human reviewer or an upstream Agent step); there is no automatic point
    matching or segmentation model. Every inferred record carries `confidence` and a typed
    `provenance.source` (`USER`, `DETERMINISTIC_ANALYZER`, `CAMERA_ESTIMATOR`, ...).
  - Reconstruction readiness (`INSUFFICIENT`/`WEAK`/`USABLE`/`STRONG`/`EXCELLENT`) is a weighted
    score across view count, view diversity, camera confidence, landmark coverage, silhouette
    coverage, part correspondence, scale evidence, and cross-view consistency, then honestly
    capped downward (never up) when blocking or error-level conflict diagnostics exist — a single
    vacuously "consistent" one-observation landmark does not count as cross-view agreement.
  - MCP: one new bounded READ tool, `three.multiview_analyze` (`packages/mcp-protocol`,
    `MCP_TOOL_VERSION` `1.4.0`), reuses the existing `asset.read`/`three.read` permissions (no
    permission or tool-name sprawl), validates every referenced asset is a registered `IMAGE`
    before analysis, and never mutates the canonical document or invokes Blender.
  - Agent: `packages/agent-planner` gained a `multiview_reconstruct` deterministic operation
    (`intent.ts` capability mapping, `deterministic.ts` `multiviewReconstructionPlan`) producing an
    `INSPECT -> VERIFY -> COMPLETE` plan with no dry-run/write steps, matching the tool's read-only
    classification. Capability-gap reporting (Phase 13) is untouched and still applies if the tool
    were ever unavailable.
  - Canonical Design Document, Command Engine, and Blender Bridge are unmodified — no schema
    migration, no new commands, no new Supabase migration, and no Blender invocation from this
    package, exactly as directed.
- Test results:
  - Focused package unit suite (`tests/unit/multiview-reconstruction.test.ts`): 17 tests covering
    camera math round-trips, degenerate-triangulation refusal, synthetic known-point triangulation
    accuracy, camera-estimator honesty, view-role classification/duplication, silhouette
    statistics, coverage scoring, landmark consistency/conflict detection, confidence bucketing,
    and task determinism/immutability/serialization.
  - Integration workflow suite (`tests/integration/multiview-reconstruction-workflow.test.ts`): 5
    tests covering Acceptance Scenarios A (complete 5-view set reaches `USABLE`+ readiness with no
    conflicts), B (front-only set stays valid but honestly `WEAK`/`INSUFFICIENT`, no fabricated
    depth constraints), C (intentionally inconsistent evidence fails validation and is never
    silently averaged), E (deterministic mock provider consumes the proposal and labels its own
    output as a non-AI test fixture), and end-to-end immutability/serialization.
  - Agent integration test (`tests/integration/agent-workflow.test.ts`, Scenario D): proves the
    Agent discovers `three.multiview_analyze` via `system.get_capabilities`, calls it through the
    authenticated in-process MCP transport, and passes its own `STATE_ASSERTION` verification step.
  - Agent planner unit test (`tests/unit/agent-planner.test.ts`): proves the deterministic planner
    produces an `INSPECT -> VERIFY -> COMPLETE` plan with zero capability gaps and no dry-run/write
    steps for the `multiview_reconstruct` operation.
  - Full repository suite: `pnpm exec vitest run` — 43 test files, 257 tests, all passed (up from
    Phase 16's 41 files/233 tests).
  - `pnpm validate:docs`: PASS for 12 canonical files.
  - `pnpm validate:deps` (`node --experimental-strip-types scripts/validate-dependencies.ts`): PASS
    for 58 workspace packages (up from 57; `packages/multiview-reconstruction` added to
    `requiredDirs` and given an explicit forbidden-dependency list mirroring
    `motion-reconstruction`/`reconstruction`).
  - `pnpm exec biome format .` / `pnpm exec biome lint .`: PASS, no warnings, across all 470
    tracked files.
  - `turbo typecheck` (`node ../../node_modules/typescript/bin/tsc --noEmit` per package): PASS,
    78 tasks across all 58 workspace packages.
  - `turbo build`: PASS, 58 packages.
  - `docker compose config`: PASS; resolves the Redis service, `aevum-network`, and volume
    unchanged.
  - Secret scan: PASS — no API keys, tokens, or private-key material found in the staged diff; the
    real local `.env` was not read or modified.
  - `git diff --cached --check`: PASS (only expected CRLF-normalization notices, no whitespace or
    conflict-marker errors).
  - Production health (read-only, nothing reconfigured): Railway `@aevum/api` `/health` → HTTP 200;
    Railway `mcp-server` `/health` → healthy, `/ready` → all six checks true
    (`schemaVersion: "202608020001"`, matching the Phase 16 baseline exactly — no drift), `/version`
    → `protocolVersion 1.0.0` (deployment still reflects the pre-Phase-17 commit, as expected before
    this work is pushed and redeployed); Vercel `design-system-aevum` → HTTP 200. Railway Blender
    Bridge remains intentionally offline; no production service was reconfigured.
  - No Supabase migration was added — Phase 17 evidence does not require durable database
    persistence; the existing `documents`/`document_versions` JSON-blob storage is sufficient if a
    future phase ever needs to persist a reference set, and Phase 17 itself stays fully in-process.
- Remaining warnings:
  - The bounding-box bilateral-symmetry proxy (`deriveSymmetryConstraint`) is an explicit,
    disclosed approximation (bounding-box centroid offset), not true contour-matching symmetry
    detection.
  - Silhouette evidence requires a caller-supplied contour; there is no real background-removal or
    segmentation model behind `createManifestSilhouetteProvider`.
  - Camera estimation is a geometric turntable **assumption** tied to a resolved role, not a
    measurement; confidence is capped at 0.6 specifically so it cannot be mistaken for a calibrated
    pose.
  - Landmark and part correspondence require caller-supplied hints; there is no automatic
    point-matching or part-segmentation model.
  - `three.multiview_analyze` returns a bounded, flattened evidence summary (view/coverage/
    readiness/validation/diagnostics), not the full internal landmark/constraint/part graph — the
    richer internal shapes are intentionally not mirrored into `packages/mcp-protocol` to avoid
    schema duplication across package boundaries; a future phase can add narrower follow-up read
    tools (e.g. `three.multiview_inspect_landmarks`) if a caller genuinely needs that detail.
  - `MultiViewReconstructionProvider` ships only the deterministic test double
    (`createDeterministicMockProvider`); no photogrammetry backend or external AI provider is
    integrated, and none was requested — no new user-facing credential was introduced.
  - The roadmap's existing "Phase 18 — Rigging and Character Animation" section (below) was written
    assuming a completed model already exists by that point. Since Phase 17 deliberately stopped
    above the model-generation boundary, the scope items deferred here (mesh/topology/UV/material
    generation, per-view rendering, the render-compare correction loop, and provider integration)
    still need a numbered home before rigging becomes meaningful. This document does not
    renumber the roadmap to resolve that; it is flagged here as an open sequencing question for
    whoever plans the next phase.
- Blockers:
  - None for the Phase 17 foundation as scoped.
- Decisions:
  - Multi-view evidence (reference sets, views, landmarks, silhouettes, parts, constraints) is
    treated as reconstruction-pipeline evidence, analogous to Phase 6's `ReconstructionProposal` —
    not canonical document state. No Canonical Design Document schema change was made or needed.
  - `three.multiview_analyze` is deliberately the only new MCP tool (one bounded, read-only,
    always-enabled tool) rather than the four-to-five-tool split sketched in early planning notes,
    matching Phase 16's stated preference for reusing permissions over tool/permission sprawl.
  - Readiness scoring caps classification downward on error/critical diagnostics but never edits
    the underlying numeric score, so the raw score remains inspectable even when the classification
    is capped — mirroring Phase 8's correction-acceptance philosophy of never hiding a regression
    inside an aggregate.
- Next action:
  - Before any model-generation phase begins: decide the numbered slot for "multi-view model
    generation" (mesh/topology/UV/material generation, per-view rendering, the render-compare
    correction loop, and a real `MultiViewReconstructionProvider` implementation) relative to the
    existing "Phase 18 — Rigging" entry, since rigging requires a model to rig. That phase should
    consume this phase's `MultiViewReconstructionProposal` unchanged, register any produced
    geometry as a normal asset, and route it through the existing Phase 14 inspection -> Phase 15
    Blender Bridge -> Phase 16 professional-mesh boundaries exactly as this phase's contracts
    already assume — it must not introduce a second, parallel 3D import or Blender-execution path.

---

## 24. Phase 18 — Multi-View 3D Reconstruction Execution

### Sequencing decision

**Phase 18 was originally scoped as "Rigging and Character Animation."** Per ADR-0002
(`docs/adr/0002-complete-static-reconstruction-before-rigging.md`), that work is deferred — a
skeleton has nothing to bind to without an actual reconstructed model, and Phase 17 deliberately
stopped above the model-generation boundary. Phase 18 is reassigned to the natural next step
Phase 17's own evidence already identified: generating real candidate geometry from that evidence.
Rigging's original scope and acceptance gate are preserved verbatim below, unclaimed, until a
future phase-planning pass assigns them a number.

### Goal

Generate an actual candidate 3D mesh from Phase 17's multi-view evidence, score it against real
cross-view metrics, run a bounded non-regressing correction loop, and hand the result to the
existing Phase 14 → 15 → 16 pipeline unchanged.

### Status

```text
VALIDATED
```

### Scope

- Real local reconstruction provider execution (`LOCAL_BASELINE`)
- Candidate geometry generation (box/cylinder primitive fitting, voxel visual-hull carving)
- Part-aware reconstruction (preserves Phase 17 part identity rather than flattening)
- Cross-view scoring (silhouette IoU/precision/recall, boundary/centroid/area difference,
  landmark-to-surface distance, constraint satisfaction, coverage, local structural validity)
- Bounded, non-regressing dimension-correction loop
- GLB export and asset registration with full multi-parent provenance
- A (not executed) Command Engine plan reusing `asset.register` and Phase 14's `scene3d.import`
- A bounded provider registry (`LOCAL_BASELINE`, `DETERMINISTIC_TEST`)
- One new bounded MCP tool and one new deterministic Agent operation

### Acceptance Gate

- A known-geometry (box/cylinder) fixture reconstructs with correct broad proportions and high
  silhouette consistency
- A multi-part fixture preserves part identity in the selected candidate rather than flattening it
- Missing-view evidence honestly downgrades readiness/score rather than fabricating depth
- Conflicting evidence is reflected in diagnostics and a capped score, never silently averaged
- A correction pass never improves one view's score by regressing another beyond tolerance
- The generated GLB round-trips through real Phase 14 import and Phase 16 topology inspection
- No claim of production-quality, arbitrary-object, or photoreal reconstruction is made

### Current Phase 18 Evidence

Status update:

- Date: 2026-08-09
- Owner: Claude (Codex-to-Claude handoff)
- Previous status: PLANNED (as originally-scoped Rigging; reassigned per ADR-0002)
- New status: VALIDATED (first real local reconstruction execution baseline, as re-scoped)
- Evidence:
  - New package `packages/geometry-reconstruction` (`@aevum/geometry-reconstruction`) owns
    reconstruction-session orchestration, candidate geometry generation, cross-view scoring, the
    bounded correction loop, GLB export, asset registration, and a (not executed) canonical import
    plan. Phase 17's `@aevum/multiview-reconstruction` is consumed unchanged as evidence input.
  - Real, provider-independent geometry: parametric box/cylinder mesh generation; real multi-view
    silhouette-volume intersection (voxel visual hull) with a genuine per-voxel boundary-face
    surface extraction (explicitly not marching-cubes); a real closest-point-on-triangle landmark
    distance metric (Ericson's algorithm); rasterized polygon IoU/precision/recall; a symmetric
    Chamfer boundary distance; and a bounded, gradient-free local-search correction loop with a
    hard per-view non-regression gate — verified in unit tests against synthetic ground-truth
    points and shapes, not just schema shape.
  - Box/cylinder dimensions are derived from Phase 17's silhouette-backed constraints via each
    constraint's own camera frustum — an explicit, disclosed extension of Phase 17's
    turntable-radius assumption, never a fabricated measurement. A cylinder candidate is only
    proposed when the TOP silhouette is genuinely round and symmetry evidence supports it.
  - Part-aware reconstruction: when Phase 17 supplies part evidence, one box is fit per part
    (preserving identity); the general-purpose voxel-hull fallback is skipped in that case so it
    cannot numerically out-compete and erase the part decomposition.
  - `MultiViewReconstructionProvider` (Phase 17) is a synchronous, proposal-only interface that
    cannot carry the full evidence a real provider needs or support the inherently async GLB
    export step. Rather than force a real provider into a mock-shaped contract, this phase defines
    its own `GeometryReconstructionProvider` (full-evidence input, async output) and leaves Phase
    17's original interface and deterministic mock provider completely unchanged — re-exposed
    as-is under the `DETERMINISTIC_TEST` registry entry.
  - Every generated candidate GLB, once selected, is registered as a canonical asset with
    `GENERATED` origin and full multi-parent provenance back to every source image asset used —
    never a single-parent derivative, since the geometry synthesizes evidence from multiple views.
  - MCP: one new bounded WRITE tool, `three.reconstruction_generate_candidate`
    (`packages/mcp-protocol`, `MCP_TOOL_VERSION` `1.5.0`), reusing existing `asset.read`/
    `asset.write`/`three.write`/`document.write` permissions (no permission sprawl). It runs the
    full evidence-analysis-plus-reconstruction pipeline and, on success, executes the existing
    `asset.register` command — it never introduces a new command type, and it never imports the
    asset into the scene (`scene3d.import` has no MCP tool at all yet, for any 3D asset — not a
    gap this phase introduces).
  - Agent: `packages/agent-planner` gained a `generate_reconstruction_candidate` deterministic
    operation (readiness inspection → document-version read → bounded write → verification →
    complete), reusing Phase 13's capability-gap and approval machinery unchanged.
  - Canonical Design Document, Command Engine, and Blender Bridge are unmodified — no schema
    migration, no new command type, and no direct Blender invocation from this package.
- Test results:
  - Focused package unit suite: camera-math-dependent geometry (box/cylinder mesh generation,
    voxel carving/surface extraction, rasterized IoU, Chamfer distance, closest-point-on-triangle),
    scoring, and correction-loop non-regression logic.
  - Integration acceptance scenarios, each built from a real synthetic ground-truth shape (the
    true geometry is discarded before reconstruction and used only afterward to grade the result,
    per the project's own acceptance-testing requirement):
    - **Box**: reaches `EXCELLENT` readiness and a `TARGET_SCORE_REACHED` candidate with correct
      broad proportions.
    - **Cylinder**: the roundness/symmetry heuristic correctly selects `CYLINDER_PRIMITIVE` over
      `BOX_PRIMITIVE` (higher real score).
    - **Multi-part**: the selected candidate preserves both parts' identity (`partCount: 2`)
      rather than flattening into a single mesh.
    - **Missing view** (front only): readiness stays `WEAK`, the correction loop honestly reports
      `NO_IMPROVEMENT` rather than fabricating depth.
    - **Conflicting view** (mirrored silhouette + contradictory scale evidence): readiness is
      capped at `USABLE`, `SCALE_CONFLICT`/`VIEW_DUPLICATE` diagnostics are present, and no
      correction silently improves the score by averaging away the contradiction.
    - **Real Phase 14/16 handoff**: a generated candidate GLB is registered, imported via Phase
      14's unmodified `create3DImportProposal`/`scene3d.import`, and inspected — proving the new
      package produces output compatible with the existing pipeline without a parallel import path.
  - Agent workflow test: proves the deterministic `generate_reconstruction_candidate` plan
    executes `system.get_capabilities` → `three.multiview_analyze` → `document.get` →
    `three.reconstruction_generate_candidate` (dry run) → `three.reconstruction_generate_candidate`
    (commit) → passes its own state-assertion verification.
  - Real Blender handoff: a Phase 18 candidate GLB (box fixture) imports through the unmodified
    Phase 14 path and passes real Blender 5.1.2 `mesh.topology_inspect` with a nonzero vertex/face
    count — run as a targeted addition to `tests/integration/blender-real.test.ts` rather than the
    full ~131-second Phase 15/16 suite, since no Blender-bridge Python code was modified.
- Validation results:
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 59 workspace packages
  - `pnpm format:check` / `pnpm lint`: PASS for 493 files, no warnings
  - `pnpm typecheck`: PASS, 80 Turbo tasks
  - `pnpm build`: PASS, 59 Turbo package builds
  - `pnpm test`: PASS, 45 test files and 286 tests (up from 41 files / 233 tests at Phase 17)
  - Targeted real Blender test (`three.reconstruction_generate_candidate` → Phase 14 import →
    `mesh.topology_inspect`): PASS against Blender 5.1.2 / Python 3.13.9
  - `pnpm validate:docker`: PASS; Compose resolves Redis and `aevum-network`
  - `git diff --check`: PASS (line-ending warnings only, no whitespace errors)
  - Secret scan of all changed/new files: PASS, no matches
  - Railway `@aevum/api`: HTTP 200; Railway `mcp-server`: HTTP 200; Vercel `design-system-aevum`:
    HTTP 200 — all read-only checks, nothing reconfigured
- Remaining warnings:
  - Works best for product-like, bounded, roughly convex geometry with strong silhouette/landmark
    evidence. Characters, hair, cloth, organic anatomy, transparent objects, and extreme occlusion
    remain explicitly out of scope.
  - The voxel visual hull inherits that method's standard limitation: it cannot recover
    concavities no silhouette reveals.
  - "Topology validity" inside this package is a local structural check (finite coordinates, no
    degenerate triangles, bounded triangle count) — real Blender-backed topology validation is
    Phase 16's `mesh.validate`/`mesh.topology_inspect`, invoked separately once a candidate is a
    registered, imported asset.
  - The correction loop only refines single-part box/cylinder candidates; multi-part and
    voxel-hull candidates are not yet corrected.
  - No external or paid reconstruction provider (Tripo, Meshy, Rodin, Luma, Replicate, fal, or any
    photogrammetry service) is integrated, and none was requested — no new user-facing credential
    was introduced. `LOCAL_BASELINE` is the only real provider.
  - `three.reconstruction_generate_candidate` never performs `scene3d.import` — that step has no
    MCP tool yet for any 3D asset, matching the existing system boundary rather than introducing a
    new gap.
- Blockers:
  - None for the Phase 18 reconstruction-execution baseline as scoped.
- Decisions:
  - See ADR-0002 for the full sequencing rationale (why reconstruction execution now occupies
    Phase 18 instead of rigging, and why the roadmap was not renumbered).
  - Geometry generation happens entirely in TypeScript (no Blender round trip for creation) because
    the Blender Bridge's bounded operation set has no primitive-creation capability today — only
    inspection and editing of already-imported geometry — confirmed by inspecting
    `apps/blender-bridge/blender/{bootstrap,professional}.py` before implementation began.
  - Scoring weights (`silhouette`, `landmark`, `cameraConsistency`, `scale`,
    `constraintSatisfaction`, `coverage`, `topologyViability`) are explicit, inspectable constants,
    not hidden or learned.
  - Readiness/score capping on conflict follows Phase 17's established pattern: classification is
    capped downward on error/critical diagnostics, but the underlying numeric score is never
    edited, so regressions cannot hide inside an aggregate.
- Next action (superseded — see the Phase 19A addendum below, which completed both items):
  - Decide the numbered slot for Rigging and Character Animation (preserved below) once a
    reconstructed or otherwise-imported static model is reliably available to rig. A future phase
    should also consider: correcting multi-part and voxel-hull candidates (not just single-part
    primitives), and exposing `scene3d.import` as a bounded MCP tool so an Agent can complete the
    candidate → canonical → Scene Runtime chain without direct package access.

### Phase 19A Addendum — Reconstruction Hardening and Canonical Import

This addendum stays inside the Phase 18 slot (it hardens Phase 18's own deliverables) rather than
claiming the roadmap's already-assigned "Phase 19 — Physics and Simulation" number, consistent with
ADR-0002's decision not to renumber the roadmap.

#### Goal

Close the two gaps Phase 18 left open in its own "Next action": correct multi-part and voxel-hull
candidates (not just single-part box/cylinder primitives), and expose `scene3d.import` as a bounded
MCP write tool so an Agent can complete the generate → import chain without direct package access.

#### Status

```text
VALIDATED
```

#### Scope

- Per-part correction for multi-part candidates: bounded translation, box axis-scale, and a
  landmark-centroid reposition move, each scored against Phase 17's per-part rectangle evidence
- AABB-level part-overlap diagnostics (`PART_OVERLAP_DETECTED`)
- Evidence-driven voxel occupancy refinement on top of the existing carve, with an intentionally
  asymmetric multi-view rule (safe majority-vote removal, unanimity-required addition)
- One new bounded MCP write tool, `three.import_scene`, compiling the existing Phase 14
  `scene3d.import` command from a registered GLB/GLTF asset
- An injectable `AssetBytesResolver` adapter seam (mirroring `BlenderToolAdapter`), since no
  production asset-byte storage adapter exists in this repository
- One new deterministic Agent operation, `reconstruct_and_import`, chaining evidence inspection →
  candidate generation (dry run + commit) → canonical import (dry run + commit) → verification

#### Acceptance Gate

- A multi-part correction pass never regresses a sibling part or any view beyond tolerance
- Voxel occupancy refinement never accepts a pass that regresses any view, even on a fixture built
  to tempt an unsafe recovery (proven both by direct refinement-function tests and by a full
  reconstruction-session test against a genuinely noisy view)
- `three.import_scene` is honestly reported disabled (`enabled: false`, `MCP_TOOL_DISABLED`) with no
  configured `AssetBytesResolver`, never faked
- A dry-run then commit of `three.import_scene` increments the document version, produces real
  `MESH_3D` nodes, and writes an audit record
- The Agent's `reconstruct_and_import` operation completes end-to-end through MCP: analyze → dry-run
  generate → commit generate → dry-run import → commit import → verify mesh nodes exist
- Workspace isolation, idempotent replay, and stale-version rejection all hold for the new tool,
  matching every other write tool's existing guarantees

#### Current Phase 19A Evidence

Status update:

- Date: 2026-08-10
- Owner: Claude (Codex-to-Claude handoff)
- Previous status: PLANNED (as the "Next action" left open by Phase 18)
- New status: VALIDATED
- Evidence:
  - `part-scoring.ts`: real per-part bounding-box IoU against Phase 17's per-part rectangle
    evidence (Phase 17 attaches rectangles to parts, not full contours), plus landmark-to-surface
    distance for landmarks the part references. Constraint fit stays neutral (`0.5`) because Phase
    17 does not yet attach geometric constraints to individual parts — a disclosed limitation, not
    a fabricated signal.
  - `part-correction.ts`: bounded translation (scaled to the part's own size, not a fixed absolute
    distance), box axis-scale (box-primitive parts only — an explicit, disclosed limitation for
    voxel/cylinder parts), and a landmark-centroid reposition move that only exists when the part
    has landmarks with a resolved 3D estimate.
  - `part-overlap.ts`: AABB intersection-volume-ratio diagnostics between reconstructed parts,
    tolerant of the expected touch/slight-overlap between attached parts (a crown against a watch
    body), only flagging overlap beyond a configurable tolerance ratio.
  - `session.ts`'s multi-part correction sweeps all parts repeatedly, accepting a neighbor move only
    when the target part improves, no sibling part regresses beyond tolerance, no view regresses,
    and the whole-candidate score improves — the same non-regression discipline Phase 18 already
    applied to whole-candidate dimension correction.
  - `voxel-hull.ts`'s `refineOccupancyFromEvidence`: majority-vote removal (safe — trims volume most
    evidence disputes, cannot add unsupported volume) but unanimity-required addition. A more
    lenient majority-agreement addition rule was implemented and measured first; it was reverted
    after empirically making cross-view IoU worse on every real fixture tested (including a fixture
    purpose-built to tempt an unsafe recovery), because strict-intersection carving is already the
    literature-correct tightest hull consistent with every calibrated view.
  - `three.import_scene` (`packages/mcp-protocol`, `MCP_TOOL_VERSION` `1.6.0`): reuses existing
    `asset.read`/`document.write`/`three.write` permissions, high-level input only (`assetId`,
    `expectedDocumentVersion`), full dry-run/idempotency/audit support matching every other write
    tool.
  - `AssetBytesResolver` (`apps/mcp-server/src/registry.ts`): an injectable adapter interface
    mirroring `BlenderToolAdapter` exactly. `registerInitialTools` now accepts an optional
    `assetBytes` adapter; without one, `three.import_scene` shows `enabled: false` and fails with
    `MCP_TOOL_DISABLED` — never fabricated.
  - Agent: `packages/agent-planner` gained a `reconstruct_and_import` deterministic operation
    (readiness inspection → document-version read → dry-run/commit generate → dry-run/commit import
    → verification → complete). Its plan has exactly one terminal `VERIFY` step, not one after
    `generate` and one after `import`, because the deterministic reasoning provider's
    `verifyCompletion` aggregates every `VERIFY` step's assertions across the whole plan against
    whatever observations exist so far — an intermediate `VERIFY` step would always fail on the
    later import assertion before the import steps had even run. If candidate generation produces
    no `assetId`, the import dry-run's own input validation fails naturally and honestly instead.
  - Canonical Design Document, Command Engine, and Blender Bridge are unmodified — no schema
    migration, no new command type beyond reusing `scene3d.import`, and no direct Blender
    invocation from this work.
- Test results:
  - Unit: rectangle IoU/area/centroid/bounds-of-points; per-part scoring (matching evidence, an
    oversized part, a mispositioned part, no matching evidence); part-overlap detection (flagged and
    unflagged); part-correction neighbor generation (bounded, size-scaled, box-only axis-scale, no
    reposition without landmarks); voxel dilate/erode morphology on a synthetic grid; occupancy
    refinement self-consistency (a no-op when fed the exact views it was carved from) and the
    never-add-disputed-volume property against the purpose-built noisy-view fixture.
  - Integration: multi-part correction passes never regress a sibling part or view; voxel
    refinement passes never regress a view even on the noisy-view fixture; whole-candidate scoring
    is a genuinely distinct blend from either individual part's own score (not a copy of one).
  - MCP: `three.import_scene` honestly disabled without a configured resolver; full dry-run → commit
    cycle with document-version increment, real `MESH_3D` nodes, and an audit record; idempotent
    replay without double-importing; stale-version rejection; cross-workspace asset isolation;
    nonexistent-asset and wrong-asset-type rejection.
  - Agent: `reconstruct_and_import` completes end-to-end through MCP with a real five-view box
    fixture — `system.get_capabilities` → `three.multiview_analyze` → `document.get` →
    `three.reconstruction_generate_candidate` (dry run) → (commit) → `three.import_scene` (dry run)
    → (commit) → passes its own state-assertion verification, and the canonical document ends with
    real `MESH_3D` nodes.
  - `pnpm test`: PASS, 46 test files and 309 tests (up from 45 files / 286 tests at Phase 18)
- Validation results:
  - `pnpm validate:docs`: PASS for 12 canonical files
  - `pnpm validate:deps`: PASS for 59 workspace packages
  - `pnpm format:check` / `pnpm lint`: PASS, no warnings
  - `pnpm typecheck`: PASS, 80 Turbo tasks
  - `pnpm build`: PASS, 59 Turbo package builds
- Remaining warnings:
  - The landmark-reposition correction move only fires when Phase 17 attaches landmarks to the
    part; a part with no linked landmarks is left to translation/axis-scale correction alone — a
    disclosed limitation, not a silent no-op.
  - `AssetBytesResolver` has no real (non-in-memory) implementation anywhere in this repository;
    building persistent asset-byte storage is out of scope for this addendum.
  - The correction loop still does not correct cylinder-primitive candidates' own dimensions beyond
    what Phase 18 already did; this addendum only adds part-level and voxel-level correction.
- Blockers:
  - None for the Phase 19A hardening and canonical-import addendum as scoped.
- Decisions:
  - Voxel-addition unanimity (not majority) is the load-bearing correctness decision of this
    addendum — see the `refineOccupancyFromEvidence` docstring in `voxel-hull.ts` for the full
    empirical rationale.
  - `AssetBytesResolver` follows the exact adapter-injection shape already established by
    `BlenderToolAdapter`, rather than inventing a second pattern for "capability absent, honestly
    disabled."
- Next action:
  - Proceed to Phase 19B (Rigging, Skeletons, Skinning, and Character Deformation Foundation) only
    after this addendum is committed and pushed, per the user's own gating instruction. A future
    phase should also consider building a real `AssetBytesResolver` implementation once persistent
    asset storage exists.

### Phase 19B Addendum - Rigging, Skeletons, Skinning, and Character Deformation

**Status: VALIDATED.**

- Date: 2026-08-12
- Previous status: IN_PROGRESS
- New status: VALIDATED
- Evidence:
  - CDD `1.5.0` rig, bone, model-rig, and mesh-skin references now have complete document-level
    validation and deterministic direct `1.4.0 -> 1.5.0` migration coverage.
  - Stable fingerprint-based Blender armature identity is independent of visible names.
  - Shared glTF skins produce one canonical rig; real JOINTS/WEIGHTS are validated per primitive.
  - Real local Blender creates an acyclic armature, binds normalized bounded automatic weights,
    exports a derivative GLB, reimports skin and inverse-bind data, and reconciles canonical
    geometry through an atomic Command Engine transaction.
  - `packages/rigging` evaluates immutable FK and bounded CCD IK poses, enforces joint constraints,
    computes joint matrices, performs deterministic CPU linear-blend skinning, reports deformation
    quality, supports bounded weight editing, and proposes explicit humanoid retarget mappings.
  - Scene Runtime evaluates pose and skin data before Renderer 3D produces deterministic
    `SKIN_BIND` operations; Animation Core validates supported bone-transform tracks.
  - Blender implements pose inspect/update/reset, IK, constraints, weight update/normalization, and
    deformation validation as finite semantic operations with bounded inputs and no arbitrary code.
  - MCP protocol `1.8.0` exposes strict rigging inspection and mutation tools while retaining auth,
    permission, workspace, version, lock, dry-run, audit, rollback, and idempotency boundaries.
  - Agent planning provides deterministic mechanical and humanoid rigging workflows, required
    capabilities, dry runs before writes, and terminal verification.
  - Blender failures return sanitized structured diagnostics without tracebacks or private paths.
  - Focused rigging suite: PASS, 28 tests, including pose, FK/IK, constraints, skinning,
    deformation, weights, retargeting, timeline evaluation, Scene Runtime, and Renderer 3D.
  - Focused MCP and Agent suite: PASS, 16 tests.
  - Full non-Blender suite: PASS, 49 files / 349 tests.
  - Real Blender 5.1 suite: PASS, 1 file / 24 tests, including rig create, bind, pose, IK,
    constraints, weight editing, deformation, derivative GLB reimport, failure isolation, timeout,
    cancellation, and CPU-to-Blender deformation agreement at four decimal places.
  - `pnpm validate`: PASS; docs 12/12, dependency boundaries 60 packages, formatting, lint,
    typecheck 82 tasks, build 60 packages, tests 349.
  - `pnpm validate:docker`: PASS (`docker compose config`).
  - `git diff --check`: PASS; tracked-source secret scan found only documented variable names and
    test placeholders, with no private values or generated artifacts.
  - Read-only production health: Railway API `/health`, MCP `/health`, `/ready`, `/version`, and
    Vercel production alias all returned HTTP 200. Supabase `Design-System-Aevum` is linked and
    `ACTIVE_HEALTHY`. Railway Blender remains intentionally offline.
- Decision: `BONE_3D.transform` remains immutable rest/bind state. Evaluated pose and deformation
  are regenerable Scene Runtime projections and never mutate canonical rest state.
- Remaining warnings:
  - `AUTOMATIC_HEURISTIC` proves the bounded fixture pipeline and is not professional character
    skinning quality.
  - Retargeting is an explicit, basic humanoid mapping foundation; automatic anatomical inference
    and advanced twist-chain handling remain deferred.
  - The current IK solver is bounded CCD and the current skinning backend is deterministic CPU
    linear-blend skinning; GPU skinning and advanced deformation solvers remain deferred.
  - Production MCP remains behind repository state and is intentionally not redeployed here.
  - Railway Blender remains intentionally offline; real validation uses local Blender 5.1.
- Blockers: none.
- Next action: Phase 19B is complete. Do not begin Phase 20 automatically; await its explicit scope.

### Deferred: Original Phase 18 Scope (Rigging and Character Animation)

**Status: DEFERRED.** Preserved verbatim per ADR-0002 — not started, not shortened, not
reinterpreted. Pick this up as its own phase once a numbered slot is assigned.

Goal: Create production-ready skeletons, skinning, deformation, retargeting, and character motion.

Scope:

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

Acceptance Gate:

- Rig hierarchy is valid
- Required controls work
- Weight normalization passes
- Major poses do not collapse
- Retargeted motion preserves contacts
- Exported skeleton and clips load correctly
- Character validation reports are generated

---

## 25. Phase 19 — Physics and Simulation

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

## 26. Phase 20 — Lighting and Environment System

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

## 27. Phase 21 — Camera and Cinematics

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

## 28. Phase 22 — 3D Visual Validation and Correction

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

## 29. Phase 23 — Exporter Framework

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

## 30. Phase 24 — Core Web Exporters

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

## 31. Phase 25 — Core 3D Exporters

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

## 32. Phase 26 — Canva Export

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

## 33. Phase 27 — Maximum Fidelity Orchestration

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

## 34. Phase 28 — Studio Inspection Interface

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

## 35. Phase 29 — Production Hardening

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

## 36. Phase 30 — Beta Release

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

## 37. Phase 31 — Version 1.0

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

### M4 — MCP and Agent Control

Phases 12–13 validated across completed capabilities.

### M5 — Professional 3D Foundation

Phases 14–16 validated.

### M6 — AI 3D and Cinematics

Phases 17–22 validated.

### M7 — Multi-Stack Export

Phases 23–26 validated.

### M8 — Maximum Fidelity

Phase 27 validated.

### M9 — Production Beta

Phases 28–30 validated.

### M10 — Version 1.0

Phase 31 validated.

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

**Note:** this section is a generic template pointer and had drifted out of date more than once
before (it previously still said "Begin Phase 16" after Phase 16 was already validated, and later
"Decide the numbered slot for multi-view 3D model generation" after that decision — reusing Phase
18 per ADR-0002 — had already been made). The authoritative, current next-action statement for any
given phase is always the "Next action" line inside that phase's own numbered section above (see
§22 for Phase 16, §23 for Phase 17, and §24 for Phase 18, whose Phase 19A addendum is now
VALIDATED); this section should be kept in sync with that same value but is not the source of truth
if the two ever disagree again.

The next repository action should be:

```text
Phase 19B is complete. Do not begin Phase 20 automatically; await its explicit scope.
```

Phase 18 (§24) delivered the first real local reconstruction execution — candidate geometry
generation, cross-view scoring, a bounded correction loop, and the handoff into the existing Phase
14 → 15 → 16 pipeline — reusing Phase 17's evidence contracts unchanged (see ADR-0002 for why this
phase now covers reconstruction execution rather than rigging). Its Phase 19A addendum (§24) then
closed both gaps Phase 18 left open: multi-part and voxel-hull candidates are now correction-loop
aware (not just single-part box/cylinder primitives), and `scene3d.import` is now exposed as a
bounded MCP write tool (`three.import_scene`) with a matching Agent operation
(`reconstruct_and_import`). Rigging's original scope remains preserved in Section 24. Phase 19B
now validates the complete canonical rigging and deformation foundation: immutable evaluated
poses, FK/IK and constraints, CPU skinning, weight editing, deformation quality gates, retargeting,
Animation Core and Scene Runtime integration, semantic Blender execution, MCP tools, and Agent
workflows.

---

## 58. Final Roadmap Statement

The AEVUM AI Reconstruction Engine shall be implemented through controlled, dependency-aware milestone gates that preserve quality, architectural consistency, validation, and production readiness.

The roadmap shall remain a living implementation record. No feature shall be marked complete based on appearance alone; every phase must satisfy its documented structural, functional, validation, security, performance, MCP, and export acceptance criteria.
