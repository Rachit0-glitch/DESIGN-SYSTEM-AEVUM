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

- **Studio (`apps/studio`)**: Phase 23 now provides the canonical editor shell, rendered editable
  layers, inspector, timeline, responsive controls, fidelity workspace, and 3D viewport. Production
  upload registration and external vision/OCR remain intentionally deferred.
- **2D reference understanding**: `packages/reconstruction`'s analysis stage is a deterministic,
  manifest-driven adapter (Phase 6 MVP), not a production computer-vision or multimodal model. "Any
  screenshot reconstructs pixel-perfectly" is not yet a real capability.
- **Agent reasoning**: `packages/agent-planner` ships only a deterministic, non-LLM planning
  provider (Phase 13). No external LLM (Anthropic, OpenAI, or otherwise) is wired into the Agent.
- **Exporters**: every target-stack exporter (`exporters/react`, `exporters/nextjs`, `exporters/
  threejs`, etc.) and `packages/exporters` itself remain Phase 25+ `PLANNED` placeholder shells; no
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
VALIDATED
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
VALIDATED
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

### Validation Record - 2026-08-12

- Previous status: `PLANNED`
- New status: `VALIDATED`
- Implementation evidence:
  - CDD `1.6.0` adds canonical environments, lighting rigs, delivery profiles, reflection probes,
    lighting bakes, cross-reference validation, and the lossless `1.5.0 -> 1.6.0` migration.
  - `@aevum/lighting` implements bounded deterministic reference-sample analysis, professional rig
    presets, realtime/offline/mobile resolution, and lighting-specific quality reports with material
    attribution kept separate.
  - Command Engine adds atomic `lighting.apply_rig` and `lighting.register_bake` writes with version
    conflicts, locked-scene enforcement, rollback, audit metadata, and immutable derivative lineage.
  - Scene Runtime resolves target profiles before Renderer 3D emits light, profile, environment, and
    reflection-probe operations.
  - The Blender 5.1.2 adapter executes finite semantic lighting operations and renders a bounded real
    PNG bake; no arbitrary Python, shell, path, or remote asset loading is exposed.
  - MCP tool surface `1.9.0` adds six strict permissioned lighting tools. Writes are dry-run capable,
    idempotent, audited, workspace-scoped, expected-version checked, and reconciled through Command
    Engine only.
  - Agent planning supports reference analysis, inspection, rig creation/matching, profile resolution,
    validation, and baking with dry-run before writes and exactly one terminal `VERIFY`.
- Test results:
  - 358/358 repository unit and integration tests passed.
  - 26/26 real Blender tests passed, preserving all 24 Phase 19 regression tests and adding real rig
    application/inspection/validation plus real PNG bake/reconciliation coverage.
  - 84/84 typecheck tasks and 61/61 build tasks passed.
  - 12/12 canonical documentation files and 61/61 dependency packages validated.
  - `pnpm validate`, `pnpm validate:docker`, formatting, lint, and `git diff --check` passed.
- Security and resources: reference analysis is limited to 65,536 samples; rigs to 64 active lights,
  16 shadow lights, eight profiles, and 16 probes; MCP bake input is limited to 512 px and 64 samples;
  backend output remains constrained by existing Blender job byte/time/object budgets. Diagnostics are
  sanitized and temporary paths are controlled.
- Production health: Railway API and MCP health/readiness/version endpoints returned HTTP 200; Vercel
  production returned HTTP 200 and `READY`; linked Supabase project reported `ACTIVE_HEALTHY`.
- Deployment state: Railway Blender Bridge and Agent Worker remain intentionally inactive. Phase 20
  did not require deployment. Production MCP remains at generation `c4e3d51`, so repository MCP
  `1.9.0` capabilities are not falsely claimed as deployed.
- Remaining warnings: hemisphere, emissive, volumetric, and environment light types are canonical and
  renderer-ready but are not directly executed by the current Blender adapter. HDRI environment
  records are canonical, but remote loading/upload and GPU reflection/lightmap backends remain
  deferred. Reference matching uses deterministic bounded pixel statistics, not an external vision
  provider.
- Blockers: none for the defined Phase 20 scope.
- Decision: keep canonical lighting backend-neutral; Blender remains an execution backend, and baked
  outputs remain immutable derivative assets.
- Next action: begin Phase 21 - Camera and Cinematics only when explicitly requested.

---

## 27. Phase 21 — Camera and Cinematics

### Goal

Implement complete camera control, camera paths, shot timelines, and AI cinematography.

### Status

```text
VALIDATED
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

### Validation Record - 2026-08-12

- Previous status: `PLANNED`
- New status: `VALIDATED`
- Implementation evidence:
  - CDD `1.7.0` adds professional physical camera fields plus versioned camera-path, shot, and cinematic-sequence
    registries. The deterministic `1.6.0 -> 1.7.0` migration preserves identity and normalizes legacy lens metadata.
  - `@aevum/camera-cinematics` implements physical lens math, target/orbit/dolly evaluation, exact cuts, composition
    measurements, Phase 17 camera-estimate proposals, attributed diagnostics, and bounded correction proposals.
  - Command Engine adds atomic `camera.create` and `cinematic.apply_sequence`; all writes retain stale-version,
    locked-scene, rollback, audit, and immutable transaction guarantees.
  - Scene Runtime composes responsive/global Animation Core values with shot-local timeline, path, target, lens,
    focus, and transition state at one explicit viewport time. Renderer 3D emits resolved semantic camera operations.
  - Blender 5.1.2 executes finite `camera.apply` and `cinematic.apply_sequence` manifests, preserves stable AEVUM
    camera identity, writes lens/sensor/shift/clipping/DOF, creates real camera keyframes, exports GLB derivatives,
    and reconciles canonical state through Command Engine.
  - MCP tool surface `1.10.0` adds seven strict camera/cinematic tools with camera permissions. Writes are
    workspace-scoped, expected-version checked, dry-run capable, idempotent, audited, lineage checked, Blender
    verified, and atomically reconciled. Agent camera/cinematic plans use dry-run before writes and one terminal
    `VERIFY`.
- Test results:
  - 366/366 repository unit and integration tests passed across 51 files.
  - 28/28 real Blender tests passed, preserving all 26 Phase 20 regression tests and adding physical camera/DOF
    round-trip plus animated cinematic-sequence/keyframe/reconciliation coverage.
  - 86/86 typecheck tasks and 62/62 build tasks passed.
  - 12/12 canonical documentation files and 62/62 dependency packages validated.
  - `pnpm validate`, `pnpm validate:docker`, formatting, lint, and focused camera/MCP/Agent tests passed.
- Security and resources: camera/sequence schemas reject non-finite values and contradictory lens/clipping data;
  cinematic payloads are capped at 256 shots, paths, timelines, and samples and 86,400 seconds; Blender remains
  bounded by existing byte, object, topology, and timeout budgets. No arbitrary Python, shell, path, environment,
  renderer code, or cross-asset camera mutation is exposed.
- Production health: Railway API and MCP health/readiness/version endpoints returned HTTP 200; Vercel production
  returned HTTP 200; the linked Supabase project reported `ACTIVE_HEALTHY`.
- Deployment state: Railway API and MCP are running. Blender Bridge and Agent Worker remain intentionally inactive.
  Production MCP remains at deployment `c4e3d51`; repository MCP `1.10.0` and Blender-backed Phase 21 tools are not
  falsely claimed as deployed.
- Remaining warnings: Bezier/Catmull-Rom path controls, collision avoidance, multi-target blending, generated rack
  focus, cursor/scroll bindings, rendered dissolve/fade compositing, motion blur, video output, and broad autonomous
  camera correction remain deferred. Renderer 3D produces semantic operations, not pixels.
- Blockers: none for the defined Phase 21 scope.
- Decision: cameras, paths, shots, and sequences remain backend-neutral canonical truth; Animation Core owns
  interpolation, Blender is an execution backend, and validation suggestions never mutate state.
- Next action: begin Phase 22 - Maximum Fidelity Integration only when explicitly requested. Phase 22 was not started.

---

## 28. Phase 22 — Maximum Fidelity Integration

### Goal

Integrate the validated reconstruction, camera, lighting, rendering, validation, correction, and export foundations
into bounded Maximum Fidelity workflows without weakening domain-specific quality gates.

### Status

```text
VALIDATED
```

### Scope

- Cross-domain fidelity profiles
- Deterministic render-compare-diagnose-correct orchestration
- 2D, responsive, motion, 3D, camera, lighting, and export evidence coordination
- Responsible-entity attribution across domains
- Regression and plateau detection
- Checkpoints, resumability, resource policies, and human review gates
- Honest unsupported-feature and fallback reporting
- Final measurable Maximum Fidelity reports

### Acceptance Gate

- Domain-specific scores remain separate and traceable
- Validation drives only reversible Command Engine corrections
- No domain or protected region regresses
- Workflows are bounded, resumable, and resource controlled
- Unsupported and deferred capabilities remain visible
- Completion claims are backed by reproducible evidence

### Validation Record (2026-08-13)

- Previous status: `IN_PROGRESS`; new status: `VALIDATED`.
- Implementation: `@aevum/fidelity` provides four immutable profiles, separate domain score/coverage/confidence,
  normalized reference contracts, real Playwright Chromium Canvas RGBA8 rasterization, custom FontFace loading,
  browser-native mixed-run shaping observations, pixel metrics and heatmaps, structural attribution, cache and
  invalidation, bounded multi-view convergence, failure isolation, oscillation/non-regression/protection gates, and a
  concrete Phase 8 Correction bridge.
- MCP/Agent: repository MCP tool version is `1.11.0` with three READ fidelity tools and one WRITE tool. The write is
  permissioned, versioned, lock-aware, expected-before aware, dry-run capable, idempotent, audited, and routed through
  Command Engine `node.update`. Fidelity Agent intents produce bounded plans with exactly one terminal `VERIFY`.
- Tests: 377/377 repository tests passed across 53 files, including real raster, typography fallback, structural crop
  and line-break attribution, cross-domain evidence, cache/invalidation, convergence, failure isolation, MCP safety,
  and Agent planning. The full real Blender regression preserved 28/28 tests.
- Gates: 12/12 canonical docs and 63/63 dependency packages passed; 88/88 typecheck tasks and 63/63 build tasks
  passed; formatting, lint, `pnpm validate`, `pnpm validate:docker`, and `git diff --check` passed.
- Production health: Railway API and MCP `/health`, MCP `/ready`, MCP `/version`, and Vercel returned HTTP 200. The
  linked `Design-System-Aevum` Supabase project reported `ACTIVE_HEALTHY`.
- Deployment state: Railway API and MCP remain online; Blender Bridge and Agent Worker remain intentionally inactive.
  Production MCP remains generation `c4e3d51`; repository MCP `1.11.0` and Phase 22 fidelity tools are intentionally
  not claimed as deployed.
- CDD decision: no schema migration; fidelity artifacts are derived immutable evidence and accepted edits use
  existing canonical commands.
- Remaining warnings: Chromium/OS font rasterization can vary by runtime; some OpenType/variable-axis controls remain
  browser dependent; inset shadows, backdrop blur, arbitrary alpha-mask contours, complex vector booleans, full ICC
  conversion, local-window SSIM/LPIPS, external vision/OCR, rendered video, and rendered multi-view 3D comparison are
  explicit deferred capabilities. Coverage and unsupported features prevent false perfect scores.
- Blockers: none for the defined Phase 22 scope.
- Decision: Phase 23 is **AEVUM Studio: Professional Visual Editor & AI Workspace**. Phase 24 is **Production
  Hardening and Release Readiness**, preserving the former hardening scope. Neither phase has started.
- Next action: begin Phase 23 only when explicitly requested, starting with the Studio application architecture that
  consumes reference/current rasters, overlays, heatmaps, scores, attributed issues, correction proposals, pass
  history, and AI action state without owning canonical state.

---

## 29. Phase 23 — AEVUM Studio: Professional Visual Editor & AI Workspace

### Goal

Expose the validated Phase 0-22 engines through a professional visual editor and AI workspace with Canva-like
usability, Figma-like precision, AEVUM AI control, and a real-time 2D, 3D, and animation workspace.

### Status

```text
VALIDATED
```

### Scope

- Project browser, layers, canonical scene hierarchy, properties, history, and timeline interfaces
- Reference/current raster comparison, overlays, heatmaps, scores, region issues, and node attribution
- Professional 2D, 3D, camera, lighting, material, rigging, animation, and responsive inspection/editing
- AI action state, bounded correction proposals, job control, human approval, and export configuration
- Every persistent mutation remains MCP and Command Engine controlled

### Acceptance Gate

- Studio is a client of canonical APIs and never owns project truth
- 2D, 3D, animation, responsive, and fidelity evidence remain inspectable and editable
- AI actions expose plans, permissions, progress, verification, and failure state
- Visual comparison and historical-version workflows are production usable

### Validation Record (2026-08-14)

- Previous status: `IN_PROGRESS`; new status: `VALIDATED`.
- Application: the Phase 0 shell is now a React/Vite editor with top bar, tool rail, canonical layer tree, actual
  Scene Runtime/Hybrid Renderer viewport, contextual properties, assets, responsive devices, timeline, Three.js 3D,
  fidelity comparison, and structured AI activity surfaces.
- State boundary: `StudioSession` routes persistent edits through Project Store and Command Engine; selection, panel,
  viewport, drag, and playhead UI remain transient. Browser storage proves a real serialized persistence/reload path.
- Agent boundary: Studio's deterministic acceptance provider uses the typed Agent Runtime MCP client and a
  workspace/project/document-scoped in-process MCP transport, performs dry-run before apply, and commits the accepted
  edit through the same Project Store and Command Engine path with an `MCP_AGENT` audit actor.
- Canonical proof: the acceptance project includes 2D hierarchy, exact registered OFL font, responsive override,
  timeline/keyframes, registered GLB, 3D mesh/topology, PBR material, camera, light, and cinematic shot/sequence.
- Browser evidence: 4/4 Playwright flows cover load, canvas/layer selection, move, numeric and text/font editing,
  persistence, undo/redo, responsive switching, animation scrubbing, fidelity attribution, nonblank 3D rendering,
  canonical 3D transform editing, structured AI status, human-plus-AI version history, and compact-shell behavior.
- Security: no service-role value is bundled; no arbitrary HTML, SVG, iframe, filesystem path, provider output, or
  unbounded upload path was added. Asset registration/upload remains unavailable until its authenticated safe API is
  configured.
- Versions: CDD remains `1.7.0`; MCP remains `1.11.0`. Studio UI state required no migration or protocol bump.
- Tests and gates: 381/381 repository tests passed across 54 files; 4/4 Studio browser tests and 28/28 real Blender
  tests passed. Documentation 12/12, dependencies 63/63, typecheck 88/88, build 63/63, formatting, lint,
  `pnpm validate`, `pnpm validate:docker`, and `git diff --check` passed.
- Deployment: existing Vercel project `design-system-aevum` deployed READY as `dpl_CNbYnStyBA1qTPyozRkoLQSme3Ty` and
  alias `https://design-system-aevum-peach.vercel.app` returned 200. Production Chromium found the Studio canvas and
  ten runtime nodes and a Three.js canvas with no console errors; `/health.json` returned 200. Railway API, MCP
  health/readiness/version,
  and linked Supabase `Design-System-Aevum` remained healthy. Railway Blender Bridge and Agent Worker remain inactive.
- Production MCP drift: production remains generation `c4e3d51`; repository MCP remains `1.11.0`. Studio does not
  claim Phase 22/23 repository-only MCP tools are deployed.
- Remaining bounded limitations: point-level vector editing, full crop handles, real-time server push, production
  upload registration, external vision/OCR, and browser Blender parity remain deferred or unavailable. The local
  deterministic Agent acceptance path does not claim a paid or external model. The production bundle is functional
  had exceeded Vite's 500 kB advisory threshold. Phase 24 isolates Three.js behind a lazy viewport boundary; the
  initial Studio entry is now 42.78 kB minified (13.39 kB gzip), while the optional Three.js viewport is 523.85 kB
  minified (131.00 kB gzip).
- Blockers: none for the defined Phase 23 scope.
- Next action: begin Phase 24 - Production Hardening and Release Readiness only when explicitly requested. Phase 24
  is recorded in Section 30.

---

## 30. Phase 24 — Production Hardening and Release Readiness

### Goal

Prepare the complete AEVUM product for secure, recoverable, observable, performant real-world release.

### Status

```text
VALIDATED
```

### Scope

Phase 24 establishes the deployable release surface without replacing validated canonical systems:

- Studio authenticates with Supabase and reads/writes canonical project state through the API/MCP/Command Engine path.
- API and MCP use Supabase-backed Project Store access with schema version `202608140001`, readiness probes, strict
  origins, payload/time/rate limits, security headers, and sanitized failures.
- The MCP server supports the existing AEVUM envelope plus stateless Streamable HTTP JSON-RPC at `POST /mcp` for
  external clients. Every write remains dry-run-first, expected-version checked, idempotent, permissioned, and audited.
- Supabase bootstrap is atomic and per-actor serialized; original production assets remain private and immutable.
- Studio keeps Three.js optional, preserves a bounded 2D fallback, and never promotes browser storage to canonical
  state.

### Validation Evidence (2026-08-14)

- Starting revision: `38af348d8cc8c040d5a8811788451d213bace111` on `main`.
- Supabase project `Design-System-Aevum` is healthy and migration `20260814000100_phase24_release_hardening.sql`
  is applied. Its atomic project bootstrap RPC, RLS-backed storage, audit records, and idempotency records are live.
- Studio: `https://design-system-aevum-peach.vercel.app` is served by Vercel deployment
  `dpl_CZXvX8c4PVpsppLYsmyGWkRLt85C` with CSP and HSTS.
- API: `https://aevumapi-production-5fd5.up.railway.app` reports `200` for `/health`, `/ready`, and `/version`;
  readiness confirms Supabase, database, authentication, and schema `202608140001`.
- MCP: `https://mcp-server-production-209e.up.railway.app` reports `200` for `/health`, `/ready`, and `/version`;
  deployment `9a9157b6-be4c-4098-b4d1-560b4b06fe67` reports MCP protocol `1.0.0` and deployment version
  `phase24-20260814`.
- Authenticated production MCP smoke passed using an ephemeral Auth user: bootstrap, authenticated read, dry-run,
  write, persisted readback, idempotent replay, audit/idempotency verification, and cleanup. The same smoke passed
  after Railway MCP restart, proving persistence and authentication recovery.
- Production Studio E2E passed: sign-in, atomic bootstrap, canonical edit, auditable undo/redo, reload persistence,
  MCP credential UI, API readback, and temporary user/workspace cleanup.
- Repository checks passed: 385 tests in 54 files; Chromium E2E 4 passed and 1 production-only test skipped locally
  because it passed in its dedicated live run; Blender 5.1 integration 28 passed; typecheck 88 tasks; dependency
  validation 63 packages; documentation validation 12 canonical files; `pnpm audit --prod` found no known
  vulnerabilities; `pnpm validate:docker` passed `docker compose config`.

### Operational Documents

- `docs/PRODUCTION_READINESS.md` is the release gate, rollback, isolated recovery, and deliberate-boundary contract.
- `docs/EXTERNAL_MCP_CONNECTION.md` is the user-facing Codex and Antigravity setup, permission, scope, and
  troubleshooting handoff.

### Remaining Boundaries

- Studio upload and signed asset download flows remain deliberately unavailable until byte ingestion, MIME/size
  validation, quarantine, provenance, and atomic asset registration are connected.
- Blender Bridge remains private/local and inactive in Railway; production reports Blender capability unavailability
  rather than simulating execution.
- External AI/vision providers, point-level vector editing, server push, SSE streaming, and full load/restore drills
  remain deferred. Supabase restore is documented for an isolated project/branch and must never be rehearsed against
  production data.

### Acceptance Gate

- Security, authentication, authorization, isolation, concurrency, audit, idempotency, and dependency audits pass.
- Vercel, API, and MCP are deployed and healthy; MCP restart recovery and persisted state were verified.
- Browser, production Studio, MCP, API, Blender, Docker configuration, and full regression checks pass.
- Rollback and isolated Supabase recovery procedures are documented; unimplemented upload, streaming, and Blender
  production capabilities are explicitly unavailable rather than claimed as complete.

### Status Change

- Date: 2026-08-14
- Previous status: `PLANNED`
- New status: `VALIDATED`
- Decision: Phase 24 is complete. Do not begin Phase 25 without an explicit request.

---

## 31. Phase 25 — Exporter Framework

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

## 32. Phase 26 — Core Web Exporters

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

## 33. Phase 27 — Core 3D Exporters

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

## 34. Phase 28 — Canva Export

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

## 35. Phase 29 — Advanced Maximum Fidelity Orchestration

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

## 35A. Historical Studio Scope — Merged Into Phase 23

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

## 35B. Historical Production Hardening Scope — Moved Intact To Phase 24

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
Phase 24 is validated. Do not begin Phase 25 automatically; await its explicit scope.
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

Phase 22 validates real 2D raster evidence, custom-font and mixed-run typography observations, pixel and structural
comparison, domain-separated cross-domain evidence, bounded Phase 8 correction orchestration, MCP tools, and Agent
workflows. Phase 23 validates AEVUM Studio. Phase 24 validates the production release surface, recovery contract,
external MCP handoff, and deployed Studio/API/MCP integration.

---

## 58. Studio ↔ MCP ↔ Agent Integration Stabilization Block (2026-08-15)

This is an integration/stabilization block, not a new numbered phase — it hardens and connects
existing Phase 19B–24 work rather than adding new roadmap scope, per explicit instruction not to
give it a phase number. Full detail, including every known limitation, lives in
`STABILIZATION_KNOWN_LIMITATIONS.md`; this entry is the roadmap-level summary.

- **Status: partially complete. Not marked VALIDATED** — its own acceptance test (a real-world
  reference poster) only partially passed, and that is reported honestly rather than rounded up.
- Fixed: Studio's MCP command gateway was a hardcoded `node.update`/`node.delete`-only allowlist;
  it now checks the actor's real, server-computed capability set (`system.get_capabilities`)
  before forwarding any of 4 verified command-type mappings.
- Fixed: the Studio AI panel was fully fake (hardcoded staged delays, `prompt.includes("center")`
  string matching with no real effect path); it now drives the real `@aevum/agent-runtime`
  `createAgentEngine()` (the same engine `packages/agent-planner`/`packages/agent-context` already
  implemented) through honest keyword-to-structured-parameter mapping — no natural-language
  understanding exists anywhere in this codebase, and prompts it can't map are reported as such.
- Fixed: two confirmed canonical-state-sync bugs — a background Supabase token refresh was
  rebuilding Studio's entire session (the real cause of the reported multi-second tab-return
  delay), and agent-driven/reconstruction-driven writes were not reflected in the locally rendered
  document.
- Added: `@aevum/reconstruction-vision`, a new package implementing real, local, free computer
  vision (color-cluster region segmentation, connected components, non-max suppression, two-pass
  tesseract.js OCR) — explicitly **no paid external vision/OCR API**, per instruction. MCP tool
  version bumped `1.11.0` → `1.12.0` for two new tools, `asset.register` and
  `reconstruction.import_reference` (Section 99 of `08_MCP_SPECIFICATION.md`), which together let
  Studio turn an uploaded reference image into real, individually-editable canonical nodes through
  `packages/reconstruction`'s existing, unmodified analyze → proposal → command-plan pipeline.
- Real, honest limitations carried forward (see `STABILIZATION_KNOWN_LIMITATIONS.md` for detail):
  heavily stylized display typography (e.g. large poster headlines) is not detected as text by the
  local OCR pipeline; IMAGE-category reconstructed nodes reference a crop of the original source
  asset rather than an independently extracted image; the new Supabase asset-storage adapter is
  untested against a real bucket (only an in-memory test double); no fidelity report is ever
  computed anywhere in this codebase, so the Fidelity workspace will honestly read "Not evaluated"
  for any real document until a validation pipeline is built; the AI panel's approval adapter fails
  closed with no real approval UI if a future capability ever requires one.
- Tests and gates: 399/399 repository tests passed across 58 files; full workspace typecheck
  (90/90), build (64/64), lint, and format all passed. MCP tool count 73 (was 72).
- No Google-Antigravity-specific backend exists anywhere — the new tools are on the same canonical
  MCP surface every other client uses (verified: no antigravity-specific code in any touched file).
- Next action: none required automatically. Closing the sushi-poster acceptance gap (stylized
  headline typography detection) would need a dedicated text-region-detection front end, which is
  new engineering beyond this block's scope, not a tuning fix.

---

## 59. Google Cloud Vision Provider Block (2026-08-15, Block B of AEVUM System Fix Plan)

This is a continuation of the Studio ↔ MCP ↔ Agent stabilization work (Section 58), not a new
numbered phase. It implements the "AEVUM System Fix + Google Cloud Vision Implementation Plan"
Block B: a real, provider-neutral vision abstraction with Google Cloud Vision as the selected
provider, replacing the local-only OCR/segmentation pipeline as the *default* analysis path while
keeping that local pipeline available as a free, offline fallback.

- **Status: implemented and tested against mocked/injected providers. NOT production-verified —
  no real Google Cloud Vision credentials have been exercised in this environment.** Per explicit
  instruction, credential unavailability does not block implementation; the adapter and its full
  test architecture are complete and ready for real credentials.
- Added `@aevum/vision`, a new package defining a provider-neutral `VisionProvider` contract
  (`analyzeImage(bytes, options) -> VisionAnalysis`) with two real implementations:
  - `createGoogleVisionProvider()` — wraps the official `@google-cloud/vision` SDK
    (`ImageAnnotatorClient`), normalizing DOCUMENT_TEXT_DETECTION (full PAGE→BLOCK→PARAGRAPH→
    WORD→SYMBOL hierarchy with real detected-break-aware text concatenation), LABEL_DETECTION,
    OBJECT_LOCALIZATION (normalized 0–1 vertices converted to absolute source pixels), and
    IMAGE_PROPERTIES (0–1 float color channels converted to 0–255 ints) into the shared
    `VisionAnalysis` shape. No Google-specific type ever leaves this adapter.
  - `createLocalVisionProvider()` — the same real, free, offline segmentation+OCR pipeline from
    Section 58 (`@aevum/reconstruction-vision`), now wrapped behind the identical interface so it
    remains available with zero credentials for local dev, CI, and as an explicit fallback.
  - `visionAnalysisToManifest()` converts either provider's output into the same
    `ReconstructionManifest` shape `packages/reconstruction`'s unmodified pipeline already
    consumes — provider swap requires no change to reconstruction, Studio, or MCP tool code.
  - Real cost/quota guardrails: `requestFingerprint()` (SHA-256 of provider+source hash+options)
    keys an in-memory analysis cache (`withVisionAnalysisCache`) so unchanged bytes are never
    re-analyzed, and an in-memory per-workspace daily call counter
    (`withVisionQuota`/`VISION_MAX_CALLS_PER_WORKSPACE_PER_DAY`) fails safely with a
    `VISION_PROVIDER_QUOTA_EXCEEDED` error rather than making unbounded paid calls. Both are
    disclosed as in-memory (not durable/cross-replica) — a real limitation for multi-instance
    deployments, not hidden behind a "PASSED" claim.
- Wired into `apps/mcp-server`: `asset.register`'s `analyzeForReconstruction` path now resolves a
  per-workspace `VisionProvider` from `environment.vision.provider` (`GOOGLE_CLOUD` or `LOCAL`,
  default `LOCAL`) and falls back to the original direct `buildManifestFromImage()` call when no
  vision adapter is configured at all (test fixtures that don't inject one), so no existing
  behavior regressed. Google credentials, when present, are read only from discrete server-side
  env vars (`GOOGLE_CLOUD_CLIENT_EMAIL`/`GOOGLE_CLOUD_PRIVATE_KEY`/`GOOGLE_CLOUD_PROJECT_ID`,
  documented with placeholders in `.env.example`) — never hardcoded, never exposed to
  Studio/browser code.
- Verified end to end at the MCP boundary (not just the package level): an integration test
  injects a `GoogleVisionClient` mock shaped exactly like the real SDK's `annotateImage()`
  response into `createMcpTestFixture()`, calls the real `asset.register` tool with
  `analyzeForReconstruction: true`, and confirms the persisted document's manifest and
  `packages/reconstruction`'s unmodified `analyzeReference()` recover the exact injected text
  content — proving the new `adapters.vision` wiring in `apps/mcp-server/src/tools.ts` actually
  consumes Google-shaped analysis, not just that the package compiles.
- Tests and gates: `@aevum/vision` package tests (9/9) plus the new MCP-boundary integration test
  pass; full `pnpm validate` (docs, dependency rules, format, lint, typecheck, full test suite,
  build across all 65 packages) passed clean after these changes.
- Honest gap: the real Google Cloud Vision network path (actual API calls, actual auth failure
  modes, actual latency/cost) has never been exercised — only the SDK's documented response shape
  (verified directly against the installed `@google-cloud/vision@6.0.0` package's own
  `protos.d.ts`/`helpers.d.ts`, not guessed) via a mocked client. This must be validated against a
  real GCP project and real credentials before any claim of production readiness for this
  provider.
- Next action: Block C (reconstruction quality — typography inference, rounded/vector geometry,
  gradients/strokes, independent image extraction with lineage) per the implementation plan's
  explicit block order.

---

## 60. Block C (partial): Independent Image Extraction and Derived Asset Lineage (2026-08-15)

Continuation of Block B, addressing Block C's C5/C6 items specifically. **Status: implemented and
tested. Block C overall remains IN PROGRESS** — typography inference with confidence (C2),
rounded/vector shape geometry (C3), and gradients/strokes (C4) are not yet done; this entry covers
only image extraction and lineage.

- Fixed the real gap named in Section 58: every reconstructed IMAGE node previously referenced a
  crop of the whole source reference asset, never an independently extracted image. `asset.register`
  now crops a real, individually-stored derived asset out of each eligible IMAGE-category manifest
  region (`apps/mcp-server/src/tools.ts`'s new `extractIndependentImageAssets()`), using
  `@aevum/assets`'s existing `createDerivative()`/`AssetStorageAdapter.storeDerivative()` — full
  DERIVED lineage (`source.kind: "DERIVED"`, `source.originalAssetId`, `provenance.processingChain`)
  was already supported by the asset schema and storage contracts; nothing in this block populated
  it until now.
- Eligibility is deliberately narrow and honestly bounded: a region must be IMAGE-category (not
  ICON, not SHAPE — flat-color regions are correctly left as SHAPE nodes, verified by test), at
  least 8×8 source pixels, and cover no more than 98% of the source frame — a region covering
  nearly the whole reference is left as a source crop rather than falsely reported as "extracted"
  when its content is effectively identical to the whole reference.
- Content-hash deduplication is real, not assumed: identical crops (or a crop that happens to match
  an already-registered asset) resolve to the existing asset instead of writing a duplicate.
- Real cost-guardrail fix found while restructuring this code path: `asset.register`'s duplicate-
  content check previously ran **after** Vision analysis, meaning a duplicate upload still paid for
  a full Vision API call whose result was discarded a moment later. The duplicate check now runs
  first, before any Vision or extraction work — consistent with the plan's explicit "never call
  Vision unnecessarily" cost guardrail from Block B.
- `reconstruction.import_reference`'s downstream pipeline required no changes: `packages/reconstruction`'s
  `AssetExtractionAdapter`/`analyzeReference()`/proposal-to-command-plan logic already honored a
  manifest region's `image.assetId`/`image.extracted` fields correctly — the only real gap was that
  nothing upstream ever populated them with a genuine extraction.
- `packages/mcp-protocol`'s `asset.register` output schema gained `reconstructionAnalysis.extractedImageCount`
  (MCP tool version bumped `1.12.0` → `1.12.1`, an additive, backward-compatible output field on an
  existing tool, not a new tool).
- Verified end to end via two new integration tests
  (`tests/integration/mcp-image-extraction.test.ts`): a real high-variance photographic region gets
  extracted into a real, separately stored, hash-distinct DERIVED asset that
  `packages/reconstruction`'s unmodified pipeline correctly builds a `NATIVE`-fallback IMAGE node
  around; a flat-color SHAPE region is confirmed to never trigger extraction. Full `pnpm validate`
  (docs, dependency rules, format, lint, typecheck, 411/411 tests, build across all 65 packages)
  passed clean.
- Next action: continue Block C — C2 (typography inference with confidence and provenance, never
  fabricating exact font names), C3 (rounded-corner and vector/polygon shape geometry), C4
  (gradient and stroke inference) — per the implementation plan's explicit block order.

---

## 61. Block C: Minimal Paint Model — Real Color Tokens End to End (2026-08-15)

Closes the Paint-model gap Section 60 (and the STABILIZATION_KNOWN_LIMITATIONS.md addendum it
pointed to) identified: reconstruction sampled real fill/ink colors but nothing in the schema,
reconstruction, renderer, or Studio actually applied them as a real Paint. **Status: implemented
and verified end to end, including live in the running Studio app — not just typechecked.** This
is solid-color-only; gradients, patterns, and stroke color sampling remain out of scope (see the
corrected STABILIZATION_KNOWN_LIMITATIONS.md addendum for the precise remaining gaps).

- **Schema (CDD 1.8.0):** `TextStyle` gained an optional `fillTokenId`, referencing a COLOR Token —
  the same Paint-by-token model `ShapeNodeSchema` already used, extended to text. Fixed a real
  migration-chain bug found while making this change: the prior migration targeted the
  `CURRENT_SCHEMA_VERSION` constant directly rather than a literal, so bumping the constant would
  have silently jumped straight to 1.8.0 and left documents already persisted at 1.7.0 with no
  migration path forward.
- **Command Engine:** added `token.register` (command + schema + event) — there was previously no
  way to register a Token on a document at all, only to embed one in `document.create`'s initial
  (always-empty) payload.
- **Reconstruction:** `packages/reconstruction/src/proposal.ts` samples real ink color (TEXT,
  via a two-cluster luminance split — a text bounding box is mostly background with glyph strokes
  as the minority, so a plain mean color would just blend the two) and fill color (SHAPE),
  deduplicates identical colors into shared tokens, and sets `fillTokenId` on the resulting nodes —
  registering the token in the *same transaction* as the nodes that reference it, before those
  nodes, since document-model has no `fillTokenId` referential-integrity check today.
- **Renderer:** `packages/renderer-2d`'s `resolveStyle()` now resolves a TEXT node's
  `runs[0].style.fillTokenId` the same way it already resolved SHAPE's. This alone was not
  sufficient — `packages/scene-runtime`'s reference resolver only ever collected token ids from
  `SHAPE.fillTokenId`/`strokeTokenId`, so a TEXT run's `fillTokenId` was never added to
  `resolvedReferences.tokens` and the renderer's lookup would have silently found nothing. Fixed.
- **Studio:** `apps/studio/src/main.tsx`'s canvas node component already painted SHAPE fills from
  the real render graph before this change (an earlier documentation claim that it painted
  nothing was inaccurate and has been corrected). The real gaps were narrower: TEXT's resolved
  paint was never read at all (`color` only fell back to legacy `customData`), `cornerRadius` was
  never read from real `geometry.cornerRadius`, and no stroke/border CSS was ever applied even
  though a stroke paint was already being resolved. All three fixed.
- **Verification:** a real document (built through the actual reconstruction pipeline logic, not
  hand-waved) with a token-backed SHAPE fill, a token-backed stroke, `geometry.cornerRadius: 20`,
  and a token-backed TEXT color was loaded into the real, running Studio dev server; computed CSS
  (`background`, `border`, `border-radius`, `color`) was read directly from the live DOM and
  confirmed correct, alongside confirming every node still on the legacy `customData` path was
  visually unchanged. `pnpm validate` (docs, dependency rules, format, lint, typecheck, 413/413
  tests, build across all 65 packages) passed clean before and after this Studio change.
- Next action: Block C's remaining items are C3 (rounded-corner/vector shape *detection* — the
  geometry field and rendering now exist, but no analyzer infers a radius from pixels) and C4
  (gradients, patterns, and stroke color sampling — the rendering plumbing for a resolved stroke
  paint now exists, but nothing samples one). Per the implementation plan's block order, Block C
  work continues before moving to Block D.

---

## 62. Block C2: Real Font Weight Inference (2026-08-15)

Closes the last fabricated value in C2 (typography inference): `fontWeight` was hardcoded to `400`
for every detected TEXT region regardless of the source pixels. **Status: implemented and tested.**

- Reuses the minority-cluster ink-area fraction already computed for text ink-color sampling (no
  new pixel pass): bold glyph strokes measurably cover more of their bounding box than
  regular-weight strokes of the same text at the same size.
- Thresholds are calibrated against real measured output of this environment's font rendering
  stack, not guessed — and the first calibration attempt was wrong and caught by testing: it
  measured ink fraction over a generously padded canvas, but real OCR-detected boxes are tight,
  and tight-box fractions are substantially higher, so both a regular and a bold sample landed in
  the same bucket. Recalibrated against tight crops matching real OCR output.
- Honestly bucketed, not precise: this rendering stack resolves to only ~3 distinguishable weight
  clusters (~0.33/~0.43/~0.47 ink fraction), reflecting real font-substitution behavior rather than
  a universal 9-step OpenType scale. Documented as a best-effort estimate at both call sites.
- Verified with a real end-to-end test: the same word rendered bold vs. regular through the real
  local OCR pipeline yields a strictly higher estimated weight for the bold rendering.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 414/414 tests, build across
  all 65 packages) passed clean.
- Next action: Block C3 (rounded-corner/vector shape detection from pixels) and C4 (gradients,
  patterns, stroke color sampling) remain — no further C2 typography gaps are known at this time.

---

## 63. Block C3: Real Rounded-Corner and Ellipse Shape Detection (2026-08-15)

Every detected SHAPE region was always emitted as `shapeType: "RECTANGLE"` with no `cornerRadius`,
regardless of the source pixels. **Status: implemented and tested**, scoped honestly — full
arbitrary polygon/vector tracing is a separate, much larger project and was not attempted.

- Real geometric classification from measured fill ratio (filled pixels / bounding-box area): a
  corner radius `r` cuts a `(1 - pi/4) * r^2` area from each of a rectangle's 4 corners, so the
  missing area is invertible into a real corner-radius estimate. When the estimated radius would
  exceed what any valid rectangle corner radius for that box could produce, the shape is classified
  ELLIPSE instead — the same underlying geometric fact (a square rounded to `r = side/2` *is* a
  circle), not an approximation error.
- Calibrated and verified against real rendered shapes (sharp rect, `rx=10/25`, a maximal "stadium"
  `rx=50`, an ellipse, a circle) via measurement before writing any threshold, not guessed.
- `packages/reconstruction-vision` already computed `blob.fillRatio` during segmentation and now
  uses it directly. `packages/vision` (Google Vision path) has no segmentation mask, only a
  bounding box, so a real per-pixel fill-ratio measurement was added, reusing the same
  majority/minority luminance-cluster split already used for text ink color (majority cluster this
  time, since a solid shape is mostly its own fill with background only at rounded corners — the
  opposite of a text region).
- Real bug found and fixed along the way: a rounded rectangle's corners expose background color,
  which inflated the pre-existing whole-bbox color-variance "is this a photo" check enough to
  misclassify a plain rounded rectangle as an IMAGE region before the new geometry code could ever
  run. Consolidated color/variance/fill-ratio sampling into one pass restricted to the majority
  luminance cluster, so variance reflects real within-fill diversity (true for photos, false for
  flat shapes) rather than cross-cluster corner noise. The existing real-photo classification test
  still passes unchanged.
- Verified end to end: a real rendered rounded-rectangle and ellipse, run through both the LOCAL
  segmentation pipeline and the Google Vision manifest converter, classify correctly with a real,
  in-range corner-radius estimate for the rounded case.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 417/417 tests, build across
  all 65 packages) passed clean.
- Next action: Block C4 (gradients, patterns, and stroke color sampling) is the only remaining
  Block C item. Per the implementation plan's block order, Block C work continues before Block D.

---

## 64. Block C4a/C4b: GRADIENT Token Type and Real Gradient Detection (2026-08-15)

Two Block C4 sub-tasks, both scoped as the larger "stroke + gradient" option per explicit user
choice. **Status: implemented and tested.**

- **C4a (schema, CDD 1.9.0):** `GradientSchema`/`GradientStopSchema` added to
  `packages/document-model/src/schema.ts`, mirroring `renderer-2d`'s existing `RenderPaint`
  gradient shape (`LINEAR_GRADIENT`/`RADIAL_GRADIENT`, `stops`, `angle?`, `center?`, `radius?`)
  exactly, so no shape translation is needed at the renderer boundary in C4d. `TokenValueSchema`
  and `TokenSchema.type` extended for `GRADIENT`. Migration chain advanced 1.8.0 → 1.9.0 following
  the established literal-target-version discipline. A pre-existing, unrelated schema looseness
  (`TokenValueSchema`'s permissive `JsonObjectSchema` fallback lets a malformed value of *any*
  token type slip through) was found while testing this, documented in the test, and flagged
  separately rather than silently fixed or ignored.
- **C4b (real detection from pixels):** a least-squares planar fit (`value = a*x + b*y + c` per RGB
  channel, R² as the "is this really a linear trend" signal) run over a coarse sampled grid.
  Calibrated against real rendered shapes before choosing a threshold: horizontal gradient R²≈1.0,
  diagonal gradient R²≈0.96, flat fill R²≈0.0, photo-like noise R²≈0.008 — threshold set at 0.85.
  When detected, the two stop colors are evaluated from the *fitted* plane at the two bounding-box
  corners the gradient axis actually spans (found by projecting all 4 corners onto the fit's
  gradient vector), not raw noisy endpoint pixels. Wired into both `packages/vision` (Google Vision
  path) and `packages/reconstruction-vision` (LOCAL path).
- **Real structural bug found and fixed:** the LOCAL segmentation pipeline's histogram-based color
  quantization fragments a smooth gradient into several adjacent thin blobs of similar quantized
  color (confirmed via direct debugging: a real 150px-wide test gradient produced a single ~19px
  detected blob, whose "gradient" was really just the narrow reddish slice it was given — the
  detection math itself was correct, the input span was not). Fixed with a bounded
  connected-component merge pass: spatially adjacent shape-candidate blobs are grouped by rect
  adjacency, each group's UNION bounding box is re-tested for a real gradient fit against
  full-resolution pixels, and only a group that clears the same 0.85 R² threshold is emitted as one
  merged gradient region — otherwise every blob falls through to the existing per-blob emission,
  completely unchanged. The Google Vision path never had this problem, since Vision's
  object-detection bounding boxes represent whole semantic objects, not color-clustered fragments.
- **Known, documented limitation:** which of the two detected stops is "first" is not recoverable
  from pixels alone — a rendered red-to-blue gradient is pixel-identical to blue-to-red read in
  reverse (colors and a 180° angle flip move together), so stop *order* reflects measurement, not
  necessarily the original authoring direction. Tests assert both a red-ish and a blue-ish stop
  exist, not a fixed index. A merged multi-blob gradient region is also always reported as a sharp
  rectangle — corner-radius/ellipse classification is not attempted across a merged group, since no
  single fill-ratio measurement spans it cleanly; a rounded-corner gradient shape is a real,
  out-of-scope limitation, not a silent approximation.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 420/420 tests, build across all
  65 packages) passed clean.
- Next action: Block C4c (real stroke color sampling), then C4d (reconstruction + renderer wiring
  for gradient/stroke tokens), per the implementation plan's block order.

---

## 65. Block C4c: Real Stroke Color Sampling (2026-08-15)

`shape.stroke` was a schema field with no producer anywhere in the codebase — always `undefined`.
**Status: implemented and tested**, for both vision paths, using two different real techniques
suited to what each path's pipeline actually gives it.

- **LOCAL path** (`packages/reconstruction-vision`): a real `node -e` probe first confirmed how a
  stroked shape actually segments — a stroked rectangle produces *two* separate blobs by color
  quantization, a fill blob and a distinct thin "frame" blob whose bounding box encloses the fill's
  by a margin exactly equal to the true stroke width on every side (measured: 6px margin on all 4
  sides for a real `stroke-width="6"` rect). `findStrokeFrames()` finds each fill blob's enclosing
  frame blob via containment + margin-consistency + area-ratio + color-distance checks (real,
  measured signals — not guessed), attaches the frame's own color and the measured margin as the
  fill's `stroke`, and suppresses the frame blob from being emitted as its own spurious extra shape
  region (a real, if minor, latent bug this work surfaced: before this fix, a stroked shape would
  have produced two shape regions — the real fill and a bogus black "ellipse" from the
  misclassified frame blob).
- **Google Vision path** (`packages/vision`): Vision provides only a bounding box, no fill mask, so
  stroke detection instead scans concentric pixel rings inward from the box edge (depth 0, 1, 2...)
  and compares each ring's mean color to the shape's own interior color. A real probe against the
  same rendered stroke confirmed a clean, exact signal: ring depths 0-5 measured pure stroke color,
  depth 6 onward measured pure fill color — an exact match to the real 6px stroke width, not an
  approximation.
- Both techniques return `undefined` (no `stroke` field at all) for a genuinely flat shape, verified
  by a dedicated non-regression test in both suites.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 424/424 tests, build across all
  65 packages) passed clean.
- Next action: Block C4d (reconstruction + renderer wiring for gradient/stroke tokens — the final
  Block C4 item), per the implementation plan's block order.

---

## 66. Block C4d: Reconstruction + Renderer Wiring for Gradient/Stroke Tokens (2026-08-15)

The final Block C4 item. `ShapeNodeSchema` already had `fillTokenId`/`strokeTokenId`, and
`renderer-2d`/Studio already had full gradient- and stroke-rendering support built proactively —
the real remaining gap was narrower than expected. **Status: implemented, tested, and verified live
in the running Studio app**, not just in unit tests.

- `packages/reconstruction/src/proposal.ts`: new `GradientTokenResolver` (mirrors
  `ColorTokenResolver`) creates a real, deduplicated GRADIENT Token from a detected
  `shape.gradient` and sets it as `fillTokenId` (a detected gradient takes the fill slot instead of
  a solid color — the two are mutually exclusive in the detected data). `shape.stroke.color` now
  resolves through the existing `ColorTokenResolver` into a real `strokeTokenId`. `cornerRadius`
  and stroke *width* still have no typed canonical field, so they remain geometry-only passthrough
  (Studio reads them directly), honestly noted in the unsupported-feature message.
- Real bug found and fixed: `packages/reconstruction/src/analyzer.ts`'s `shapes.infer()` — the
  actual source-of-truth builder for `shapeCandidates` from manifest regions — copied `fill`,
  `stroke`, and `cornerRadius` through but never `gradient`, silently dropping every detected
  gradient before it ever reached the token resolver. Caught by a real end-to-end test, not
  inspection.
- `packages/renderer-2d/src/styles.ts`: `tokenPaint()` previously only resolved COLOR-typed token
  values; extended with `canonicalGradient()` to also resolve GRADIENT-typed values into the
  existing `RenderPaint` gradient shape.
- `apps/studio/src/main.tsx`: stroke width now reads from `node.geometry.stroke.width` (real
  sampled data) when present, the same pattern already used for `cornerRadius`, instead of a
  hardcoded `1px`.
- Real second bug found and fixed, via the same end-to-end test: `packages/vision/src/manifest.ts`
  computed `isLikelyImage` from raw pixel variance *before* attempting gradient detection — a real
  gradient's smooth color sweep has legitimately high raw variance (exactly what that heuristic was
  designed to flag as "photo"), so every Vision-path gradient region was being misclassified as
  IMAGE and gradient detection never ran. Fixed by running `detectLinearGradient` first and letting
  a strong planar fit (R² >= 0.85, the already-calibrated threshold) override the coarse variance
  heuristic — a smooth gradient's real geometric signature is strictly better evidence than raw
  pixel variance for distinguishing "designed gradient" from "photographic noise."
- Verified end to end in the running Studio dev server (not just asserted in tests): a real
  GRADIENT-token shape renders `background: linear-gradient(90deg, rgb(255,0,0) 0%, rgb(0,0,255)
  100%)`, and a real stroked shape independently renders `border: 6px solid rgb(0,0,0)` with a
  correctly separate fill color — confirmed via computed-style inspection against a hand-built
  document injected into the live app.
- New tests: `tests/unit/renderer-2d.test.ts` (a SHAPE node's `fillTokenId`/`strokeTokenId`
  resolving into a real gradient paint and real stroke color with no `UNRESOLVED_STYLE`
  diagnostic), `tests/integration/mcp-color-tokens.test.ts` (a full `asset.register` →
  `reconstruction.import_reference` run against a real gradient+stroke image produces a document
  whose GRADIENT and stroke COLOR tokens are real and resolvable, not dangling references).
- Known, out-of-scope limitation found and flagged separately (not fixed here): a gradient or
  thickly-stroked shape's fillRatio-based corner-radius/ellipse classification (`classifyShapeGeometry`,
  Block C3) gets fooled into reporting ELLIPSE for real rectangles, since gradient/stroke pixels
  distort the fillRatio measurement that classification relies on. This is a shape-geometry bug, not
  a paint-token bug, so it's flagged as a separate background task rather than folded into this one.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 426/426 tests, build across all
  65 packages) passed clean.
- **Block C4 (gradients, patterns, and stroke color sampling) is now complete.** Per the
  implementation plan's block order, Block C (Reconstruction quality) is complete; Block D
  (Studio/MCP completeness) is next.

---

## 67. Block D1: Studio MCP Capability Registry (2026-08-15)

Preceded by a five-way parallel repository audit of the whole Studio↔MCP integration surface
(command gateway, MCP server tool registry, Agent Planner/approval policy, reconstruction/asset
wiring, Fidelity/References + test inventory), ground-truthed against real code rather than prior
documentation. **Status: implemented and tested.**

- Replaced `apps/studio/src/core/production.ts`'s hardcoded `STUDIO_MCP_COMMAND_TYPES: ReadonlySet<Command["type"]>`
  (4 command types, no metadata beyond "allowed or not") with a real, typed capability registry —
  `apps/studio/src/core/capabilities.ts`'s `STUDIO_CAPABILITIES`. Each entry records its MCP tool,
  Command Engine type (when it has one), dry-run support, a destructive/safe/read-only
  classification, and a real Studio use case — not invented ones.
- The registry stays honest about what's genuinely possible vs. genuinely needed: it lists
  `node.create`/`node.update`/`node.delete`/`document.rename` (unchanged, gateway-routable — their
  Command Engine payload shape is verified identical to their MCP tool's input) alongside
  `asset.register`/`reconstruction.import_reference`/`document.get`, which are real, already-working
  capabilities Studio's References panel uses today but whose payload shapes don't match the
  generic Command-shaped gateway, so they remain invoked directly by their existing call sites —
  now formally documented rather than silently bypassing the gateway with no record of why.
  `token.register` is listed as `NOT_YET_AVAILABLE` with a real reason (no MCP tool exists for it
  yet) rather than omitted or faked. Speculative entries (camera/lighting/cinematic commands that
  have real MCP tools but no Studio UI exercising them) were deliberately left out — the audit's own
  instruction was not to invent capability nobody uses.
- `production.ts`'s `execute()` now invokes `capability.mcpTool` (the registry's declared mapping)
  instead of implicitly reusing `command.type` as the tool name — the same value today, but now
  correct by construction instead of coincidentally correct because the two strings happen to
  match.
- All existing security, authorization, dry-run-then-commit, revision-conflict, and MCP error
  handling in `production.ts` is unchanged — only the permission-check source changed, from a bare
  `Set.has()` to a registry lookup with a more honest error message when a command is documented as
  not-yet-available versus genuinely unmapped.
- New tests in `tests/unit/studio-production.test.ts`: registry-shape tests (every gateway-routable
  entry's declared `mcpTool` really matches its own `commandType`; `asset.register`/
  `reconstruction.import_reference` are real and documented but correctly not gateway-routable;
  `token.register` is honestly `NOT_YET_AVAILABLE`; an undocumented command type returns
  `undefined`) plus two new gateway-integration tests (a `token.register` command now gets its real
  unavailability reason instead of the generic "no mapping" message; `asset.register` sent as a
  *Command* through the generic gateway is still correctly rejected, preserving today's exact
  behavior). All 4 pre-existing gateway tests pass unchanged.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 433/433 tests, build across all
  65 packages) passed clean.
- Explicitly not done in this block, per instruction: D5 (approval UI) and all other Block D
  sub-blocks. The audit found the deterministic approval adapter currently auto-rejects every
  approval-gated action in production with no UI — that remains untouched until D5.
- Next action: D5 (approval UX) is the recommended next sub-block per the audit's priority
  ordering, pending confirmation.

---

## 68. Block D2: Document Mutation Surface — node.move, node.duplicate, token.register (2026-08-15)

Real MCP tools added for the three genuinely-missing Command Engine operations with confirmed
Studio need: `node.move` and `node.duplicate` were already fully implemented in
`packages/command-engine` and had real Studio session functions (`moveNode`/`duplicateNode`) that
threw "not exposed by the current MCP contract" specifically because no MCP tool existed; `token.register`
was explicitly requested. No speculative tools were added — `node.reparent`, `page.*`, `timeline.*`,
`material.update`, `light.update`, and others remain undocumented in the capability registry because
no genuine Studio UI need was found for them (no `reparentNode` function exists, no page/timeline/
material editing UI exists today). **Status: implemented and tested.**

- `packages/mcp-protocol/src/tools.ts`: added `"node.move"`, `"node.duplicate"`, `"token.register"`
  to `McpToolNameSchema`, with input schemas (`NodeMoveInputSchema`, `NodeDuplicateInputSchema`,
  `TokenRegisterInputSchema`) verified to match their Command Engine payload shapes exactly (the
  same constraint the D1 registry already documents for the original 4 gateway-routable commands).
- `apps/mcp-server/src/tools.ts`: registered all three as real `WRITE` tools using the existing
  `executeWrite` helper — same dry-run-then-commit, version-conflict, and atomicity guarantees as
  every other write tool, no new mechanism introduced.
- `apps/studio/src/core/capabilities.ts`: all three added as `AVAILABLE` and gateway-routable
  (their `mcpTool` equals their `commandType`); `token.register`'s prior `NOT_YET_AVAILABLE` entry
  removed now that it's real.
- `apps/studio/src/core/session.ts`: `moveNode`/`duplicateNode` no longer throw when a remote
  gateway is present — they route through `executeRemote`, the same mechanism `updateNode`/
  `deleteNode` already used. `duplicateNode` still returns the new node's id synchronously (the id
  is deterministic and computed client-side before the remote call — an existing keyboard shortcut,
  `Cmd/Ctrl+D`, depends on this to select the new node immediately), with the remote write's
  rejection deliberately caught rather than left as a duplicate unhandled-console-warning for an
  error already surfaced through `saveState`/`lastError`, matching this file's existing convention.
- New tests: `tests/integration/mcp-server.test.ts` (move/duplicate/register through real
  dry-run-then-commit, confirming a dry run leaves `childIds` unchanged, plus a stale-version
  rejection); `tests/unit/studio-production.test.ts` (all three now gateway-routable; the prior
  NOT_YET_AVAILABLE-specific tests replaced with a general structural invariant test now that the
  registry has no such entry; `node.reparent` takes over as the "genuinely undocumented" example);
  `tests/unit/studio.test.ts` (remote `duplicateNode`/`moveNode` now succeed instead of throwing).
  Two pre-existing hardcoded tool-count assertions (`enabledTools` length, `registry.listTools()`
  length) updated from 31→34 and 73→76 to reflect the 3 new tools, not weakened.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 435/435 tests, build across all
  65 packages) passed clean.
- Next action: Block D3 (reliability + Studio testing).

---

## 69. Block D3: Reliability + Real Studio Component Test Infrastructure (2026-08-15)

Two real gaps closed. **Status: implemented and tested.**

- **Reliability**: the audit found no test for a genuinely unreachable MCP server (a rejected
  `fetch` promise — a network-level `TypeError`, distinct from every other test's resolved-but-
  unsuccessful HTTP response). Added two tests to `tests/unit/studio-production.test.ts`: one
  confirming `loadProductionStudioProject` rejects cleanly (not hangs) when the server is
  unreachable during initial load, one confirming `commandGateway.execute` rejects cleanly when the
  server becomes unreachable mid-write. Both already worked correctly (the underlying MCP client's
  retry/throw logic was already sound) — this closes a real test-coverage gap, not a bug.
- **Studio component test infrastructure**: `apps/studio` had zero test tooling (no test script, no
  jsdom, no testing-library — confirmed by the D-audit). Added `jsdom`, `@testing-library/react`,
  `@testing-library/dom`, `@testing-library/jest-dom` as root devDependencies; per-file
  `// @vitest-environment jsdom` directive scopes the DOM environment to component test files only,
  leaving the rest of the suite on the faster, dependency-free Node environment.
- **Real architectural blocker found and fixed**: `apps/studio/src/main.tsx` unconditionally called
  `createRoot(...).render(...)` at module load time, mixing component definitions with the app's
  bootstrap side effect — importing it for a test would have tried to boot the whole app. Split the
  mount call into a new `apps/studio/src/entry.tsx`; `index.html`'s script tag now points there.
  `main.tsx` is now a pure, side-effect-free component module. Verified via `vite build` and a live
  dev-server smoke check that the app still boots identically.
- `ReferencesPanel` and two module-scope test-only setters (`__setStudioSessionForTesting`,
  `__setStudioAgentContextForTesting`, needed because `session`/`agentContext` are module-level
  bindings set once during real bootstrap) exported — purely additive, zero behavior change.
- New `tests/unit/studio-components.test.tsx`: renders the real `ReferencesPanel` component in a
  real DOM, fires a real file-selection event, and verifies two real outcomes — a successful
  `asset.register` → `reconstruction.import_reference` → `document.get` MCP sequence produces the
  real success message, and a failed `asset.register` response produces the real, visible error
  text. Only `createImageBitmap` (a real browser Canvas API jsdom doesn't implement) is stubbed —
  nothing about the component or its MCP call sequence is faked.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 439/439 tests, build across all
  65 packages) passed clean.
- Next action: Block D4 (real planner reasoning).

---

## 71. Block D4: Real Planner Reasoning From a Raw Prompt (2026-08-15)

Removed the only client-side natural-language layer in the codebase and relocated it into the real
Agent Planner, at plan-execution time. **Status: implemented and tested.**

- `apps/studio/src/main.tsx`'s `deriveChangesFromPrompt()` — keyword/regex matching run in the
  browser *before* any real document read, blind to the node's actual current state — is deleted.
  `AiPanel` now hands the raw prompt text straight to a real `AgentGoal`
  (`parameters: { prompt, viewportWidth }`); an unrecognized prompt is no longer a pre-flight UI
  guess, it's a real plan-execution failure with a real diagnostic.
- The interpretation itself moved to `packages/agent-runtime/src/engine.ts`'s existing `analyzeStep`
  mechanism — a real, already-established extension point (`NODE_OFFSET_Y`/`THREE_OFFSET_X` already
  lived there) that runs *after* the plan's READ step, so the new `INTERPRET_NODE_EDIT_PROMPT`
  operation sees the node's real current position/dimensions/name, not a client-side guess made
  before any read happened. Same rule set as before (center, bigger/smaller, move by direction+px,
  rename) — a relocation, not an invented rewrite — still fully deterministic, still zero network
  calls, still no LLM of any kind.
- `packages/agent-planner/src/deterministic.ts`'s `nodeUpdatePlan()` selects this operation whenever
  `intent.parameters.prompt` is a non-empty string, falling back to the pre-existing `NODE_CHANGES`/
  `NODE_OFFSET_Y` operations otherwise — the direct-`changes` capability programmatic callers
  already relied on is untouched.
- Since Studio no longer knows the interpreted changes client-side (the real planner computes them
  server-side now), the post-run UI summary is computed honestly, after the fact, by diffing the
  node's state before and after a real `document.get` resync (`summarizeNodeChange`) — describing
  what actually happened, not re-stating a pre-flight guess.
- New tests in `tests/unit/studio.test.ts`: five real end-to-end runs through the actual engine —
  "center it", "move right 40px", "make it bigger", "rename to Launch Title" each produce the
  correct final node state computed from the node's real starting values (not hardcoded
  expectations); a genuinely unrecognized prompt fails with a real diagnostic and leaves the
  document completely untouched.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, tests, build across all 65
  packages) passed clean — see the combined D4+D5 validation run recorded in §72 below (both
  landed together in one gate run since a session interruption prevented committing D4 before D5
  began; the code changes themselves are cleanly separable by file, see the commit history).
- Next action: Block D5 (approval system).

---

## 72. Block D5: Real Human-in-the-Loop Approval System (2026-08-15)

Replaced the auto-reject approval wiring with a genuine, working human-in-the-loop flow.
**Status: implemented and tested.**

- **Root cause fixed**: production wiring called `createDeterministicApprovalAdapter()` with no
  arguments — a *fixture* adapter whose `approvedStepIds`/`approvedTools` sets were always empty,
  so every approval-gated step was auto-rejected in the live app, silently, with no UI ever shown.
- New `apps/studio/src/core/approval.ts`: `createInteractiveApprovalAdapter()` — `decide()`
  genuinely suspends (returns a Promise that does not resolve until `approve()`/`reject()` is
  called from outside), exposes `getPending()`/`subscribe()` for a UI to render the real pending
  request reactively. Not a fixture — a real adapter a real user drives.
- **`AGENT_APPROVAL_POLICY` wired into production** (previously parsed server-side but never read
  by any live entrypoint — confirmed dead configuration by the D-block audit): a new
  `VITE_AGENT_APPROVAL_POLICY` browser env var (documented in `.env.example`), threaded through
  `StudioBrowserConfiguration` → `StudioAgentContext.approvalPolicy` → the reasoning provider's
  `approvalPolicy` option, for both the production (`loadProductionStudioProject`) and dev-fixture
  (`createDeterministicStudioAgentContext`) paths. Defaults to `AUTO_SAFE_WRITE`, matching the
  server-side schema's own default — safe writes still proceed automatically with no prompt unless
  a deployment explicitly configures a stricter policy.
- `AiPanel` (`apps/studio/src/main.tsx`) now renders a real approval UI (`.ai-approval` block) when
  a request is genuinely pending: shows the real MCP tool name, the target node, and whether the
  action is destructive, with real Approve/Reject buttons wired to the controller.
- New `tests/unit/studio-approval.test.ts` (6 tests): the adapter genuinely suspends `decide()` and
  only resolves on `approve()`/`reject()`, with correct `source`/`reason`; subscriber notifications
  fire exactly on pending-start and pending-resolved. End-to-end through the real engine: a normal
  safe-write edit under `REQUIRE_ALL_WRITE_APPROVAL` genuinely pauses execution (polled via real
  microtask ticks, not a fixed timeout) with the document provably untouched until `approve()`,
  commits correctly once approved; rejecting leaves the document untouched and produces a real
  `AGENT_APPROVAL_REJECTED` diagnostic; a safe write under the default `AUTO_SAFE_WRITE` policy
  proceeds automatically with `decide()` never even called — confirming safe actions still work
  without unnecessary approval.
- `pnpm validate` (docs, dependency rules, format, lint, typecheck, 450/450 tests, build across all
  65 packages) passed clean — see combined D4+D5 validation run.
- **Block D (Studio/MCP completeness) is now complete: D1 through D5 all implemented, tested, and
  pushed.**

---

## 74. Block D Cleanup: Rich Approval Context, Delete Support, node.reparent Audit (2026-08-15)

Three discovered gaps fixed before starting D6+, per explicit instruction to land this cleanup as
its own commit, separate from the remaining roadmap blocks. **Status: implemented and tested.**

### Issue 1 — Rich approval context

`AgentApprovalRequest` previously carried only `tool`/`classification`/`policy`/`inputFingerprint` —
enough to gate a write, not enough for a UI to show *what* will change.

- `AgentApprovalRequestSchema` (`packages/agent-core/src/schemas.ts`) gained optional `nodeId`,
  `operation`, `before`, `after`, `summary` fields — all optional, so existing callers and the
  schema's prior shape remain valid.
- `packages/agent-runtime/src/engine.ts`: new `findPrecedingNodeSnapshot()` walks a write step's
  real dependency graph to find the target node's state as read by an earlier `READ` step in the
  *same* plan run (BFS over `step.dependencies`, transitively) — returns `undefined`, never a
  fabricated guess, when no such read genuinely exists. New `describeApprovalChange()` derives a
  real one-line summary (rename/move/resize/delete-specific phrasing, honest generic fallback
  otherwise) by diffing real `before`/`after` node state. `after` is `before` shallow-merged with the
  write's real computed `changes` — a genuine preview, not invented.
- `AiPanel`'s approval UI (`apps/studio/src/main.tsx`) now renders the real `summary`, `operation`
  (the step's plan label), and a `<dl className="approval-diff">` listing only the fields that
  actually differ between `before`/`after`.
- **Real bug found and fixed while testing this**: `findPrecedingNodeSnapshot` initially read
  `observation.data.nodes` directly, but a tool-call observation's `data` is the *full*
  `McpResponseEnvelope` (`{success, data, ...}`), not the tool's payload — the real path is
  `observation.data.data.nodes`. Fixed; covered by a new test asserting real `nodeId`/`operation`/
  `before`/`after`/`summary` values from an actual engine run.

### Issue 2 — Delete support

The D4 prompt interpreter (`interpretNodeEditPrompt`) had no delete operation, and Studio's AI panel
had no way to route a delete-shaped prompt to one — even though the deterministic planner already
had a complete, tested `deletePlan()` (READ → dry-run `node.delete` → destructive-approval-gated
write → COMPLETE) sitting unused behind `operation === "delete"`.

- `apps/studio/src/main.tsx`: new `isDeletePrompt()` classifies a raw prompt (`/\b(delete|remove)\b/i`,
  with the same rename-takes-precedence rule `interpretNodeEditPrompt` already uses, so "rename it to
  Delete Me" is never misread as a delete). When true, `AiPanel.run()` builds
  `parameters: { operation: "delete" }` instead of `{ prompt, viewportWidth }`, routing into the
  existing `deletePlan()` rather than the update interpreter. A successful delete clears selection
  and reports "Deleted "X"" from the real observed `node.delete` tool call, not inferred from
  `afterNode` being undefined (which could also mean a resync race).
- `packages/agent-planner/src/intent.ts`: `initialCapabilities()`'s EDIT branch now declares
  `["document.get", "node.delete"]` (not `node.update`) when `parameters.operation === "delete"` —
  an honesty fix so the intent's declared capabilities match what it actually does; not required for
  correctness (the deterministic planner's own `findDescriptor` already resolves against the actor's
  real discovered tool set regardless of this declared list).
- `apps/studio/src/core/agent.ts`: the dev-fixture in-process MCP transport
  (`createDeterministicStudioAgentContext`) only implemented `node.update` — a delete-shaped prompt
  would fail with `AGENT_TOOL_UNAVAILABLE` in local/dev mode. Added a real `node.delete` tool
  descriptor and dispatch (`NodeDeleteInputSchema.parse` → `session.deleteNode(...)`), mirroring the
  existing `node.update` handling exactly.
- **Real bug found and fixed while testing this**: deleting a node that a timeline track targets
  left a dangling `Track.targetId` (a required field) pointing at a node that no longer exists,
  failing `CanonicalDesignDocumentSchema` validation *after* the delete had already been applied —
  `removeNodeSubtree` (`packages/command-engine/src/immutable.ts`) cleaned up `childIds`,
  `rootNodeIds`, and `pages` on node removal but never touched `timelines`. Fixed: removed nodes now
  also remove any timeline track that targeted them, and prune that track's id from any clip's
  `trackIds` — the same cascade semantics already applied to child nodes. Covered by a new
  `command-engine.test.ts` test (track removed, its id pruned from the clip, resulting document still
  valid) in addition to the end-to-end Studio delete tests.
- New `tests/unit/studio-approval.test.ts` coverage (Delete support describe block, 5 tests): a) a
  delete-shaped goal builds a plan whose write step targets `node.delete` (never `node.update`); b) a
  destructive delete genuinely suspends for real UI approval before touching the document; c)
  rejecting leaves the document completely untouched; d) approving actually removes the node from the
  canonical document; plus a fifth test confirming a destructive delete is auto-denied, without ever
  prompting, when the session forbids destructive operations — the pre-existing `DESTRUCTIVE_WRITE`
  auto-deny path, exercised here for delete specifically.

### Issue 3 — node.reparent audit

Confirmed (re-verified, not just carried over from a prior-era audit): `node.reparent` has real
Command Engine apply logic (`packages/command-engine/src/commands/node.ts`) but no MCP tool
anywhere in `mcp-protocol`/`mcp-server`, no `reparentNode` method on `StudioSession`, and no
cross-parent-move UI in Studio (the layers panel only reorders within a parent via `node.move`;
canvas drag only changes a node's position, never its `parentId`). No real Studio requirement exists
for it today.

- Per explicit instruction ("do NOT expose it speculatively; document why it remains unavailable"),
  added a `NOT_YET_AVAILABLE` entry for `node.reparent` to `STUDIO_CAPABILITIES`
  (`apps/studio/src/core/capabilities.ts`) — the registry's single source of truth now carries the
  real reason directly, instead of that reasoning living only in test comments.
- This changes real, observable behavior: `apps/studio/src/core/production.ts`'s command gateway
  already had logic to surface a capability's `unavailableReason` when one is documented, falling
  back to a generic "no MCP tool mapping" message only for completely undocumented command types.
  `node.reparent` now hits the specific-reason branch. `tests/unit/studio-production.test.ts` updated:
  the "returns undefined for a command type with no documented capability at all" test now uses
  `page.delete` (still genuinely undocumented) as its example instead of `node.reparent`; a new test
  confirms `node.reparent` is found as a deliberate `NOT_YET_AVAILABLE` exclusion with a real,
  non-empty reason and no `mcpTool`; the gateway-rejection test's expected message updated to match.
- No MCP tool, capability, or command-engine change made — this remains genuinely unavailable, now
  documented rather than silently absent.

### Validation

- Targeted: `tests/unit/studio-approval.test.ts` (12 tests), `tests/unit/command-engine.test.ts`
  (12 tests), `tests/unit/studio-production.test.ts` (15 tests) all passing.
- Full `pnpm validate` (docs, dependency rules, format, lint, typecheck, **458/458 tests**, build
  across all 65 packages) passed clean.
- **Out of scope, intentionally**: no changes to D6–D13. The `node.reparent` MCP tool remains
  unbuilt (correctly — no real Studio requirement exists yet). No further cross-reference cleanup
  (e.g. rig bone/IK-chain/camera-shot references) was added to `removeNodeSubtree` beyond timeline
  tracks — `node.delete` already refuses to touch rig/bone/skinned-mesh state entirely
  (`CONFLICT_ERROR`), so those reference kinds cannot dangle via this path; timeline tracks were the
  one real, exercised gap.

---

## 75. Block D6: Real Sushi-Poster Acceptance Test (2026-08-15)

Turned STEP 11's one-off manual "sushi poster acceptance" run into a real, runnable, checked-in
regression test. **Status: implemented and tested — result remains a documented partial pass, not
a claim of full reconstruction.**

- New `tests/integration/sushi-poster-acceptance.test.ts`: loads the real
  `fixtures/sushi poster.jpg` (736×920 JPEG), registers it via `asset.register` with
  `analyzeForReconstruction: true` and no `visionAdapter` override — exercising the real local/free
  tesseract + color-histogram pipeline (`@aevum/reconstruction-vision`), never a paid vision API —
  then imports it via `reconstruction.import_reference` against the real, unmodified MCP tool
  pipeline (no mocks, no synthetic substitute image).
- Asserts what STEP 11 already documented as genuinely, reliably working: a real PAGE/FRAME/
  multiple-node decomposition (not one embedded reference image), the two text lines OCR reads
  essentially correctly ("PEGA PELO DELIVERY", "...DESIGNER PREMIUM...") via substring match against
  the real reconstructed content, at least two independently editable IMAGE regions, and every node
  unlocked with a real name.
- Adds a **rendering** verification D6 explicitly asked for and STEP 11 never checked: the
  reconstructed document is projected through the real, unmodified Scene Runtime and Renderer 2D
  pipeline (`projectScene` → `buildRenderGraph`/`render`) and asserted to produce real, non-empty
  paint and text render operations without throwing — proving the reconstructed nodes aren't just
  valid canonical data but actually render.
- Deliberately does **not** assert the parts STEP 5/STEP 11 already documented as unreliable (the
  stylized "SUSHI" headline is never detected as text at all — a text-region-detection gap flagged
  as new engineering, not a tunable threshold; the price/phone OCR is sometimes garbled) — asserting
  those as passing would either fail honestly or require weakening the test to hide a disclosed
  limitation.
- **No new genuine defect was found or needed fixing.** A full node-by-node dump of the
  reconstructed document (positions, dimensions, content) was inspected while building this test:
  every node's transform and dimensions are sane (inside the 736×920 frame bounds, no NaN or
  zero-size), and the render step completes cleanly. STEP 11's prior manual finding holds up under
  a real, repeatable automated run.
- `docs/STABILIZATION_KNOWN_LIMITATIONS.md`'s STEP 11 section updated with a note pointing to this
  test, without altering its existing, honest "partial pass" limitations record.
- Targeted: the new test passes in ~8s (tesseract's OCR trained-data cache was already warm from
  STEP 11's earlier manual run in this environment; a cold cache pays a one-time download).
  Full `pnpm validate` (docs, dependency rules, format, lint, typecheck, tests, build across all 65
  packages) passed clean.
- **Out of scope, intentionally**: no changes to the vision/OCR pipeline itself. Detecting stylized
  display typography (the "SUSHI" headline) would require a dedicated text-region-detection front
  end (EAST/CRAFT-style) — genuinely new engineering per STEP 5's own assessment, not a fix
  reachable from this test.

---

## 76. Block D7: Asset Completeness Audit (2026-08-15)

Audited asset registration, derived-asset provenance/lineage, deduplication, and the supported
asset-type surface. **Status: audited and hardened — no genuine defect found in existing behavior;
one real, previously-untested guardrail interaction is now covered by a regression test.**

- **Registration/identity/dedup** (`packages/assets/src/{registry,identity}.ts`): content-addressed
  IDs are a pure function of the SHA-256 hash (`assetIdFromHash`); `registerAsset` correctly
  short-circuits to `DUPLICATE` on identical content before any storage write, and to `QUARANTINED`
  before registration when security status says so. Confirmed correct — no changes needed.
- **Derived-asset provenance/lineage** (`packages/assets/src/derivatives.ts`): `createDerivative`
  builds a real `processingChain` entry (operation/actor/tool/toolVersion/parameters/seed) and
  `parentAssetIds`, and never mutates the original asset. Confirmed correct — no changes needed.
- **Independent image extraction** (`apps/mcp-server/src/tools.ts`, `extractIndependentImageAssets`):
  crops real derived IMAGE assets out of IMAGE-category regions, deduplicates *within the same
  extraction batch* via `findAssetByHash` against a working registry (so re-extracting an
  already-extracted region returns the existing derived asset instead of minting a duplicate), and
  orders the source-asset command before any derived-asset commands (required by document-model
  reference validation). Confirmed correct — no changes needed.
- **Real gap found and closed with a test (not a code fix — the behavior was already correct, just
  unverified)**: `asset.register`'s duplicate-detection short-circuit runs *before* vision analysis
  (a deliberate cost guardrail — never pay for a Vision API call whose result would be discarded).
  This means registering already-known content with `analyzeForReconstruction: true` silently skips
  analysis and leaves the asset with no reconstruction manifest. This was previously
  correct-but-unverified: `packages/reconstruction`'s `analyzeReference()` already has a real
  fallback (`manifestFor()` returns `undefined` → `fallbackManifest()` synthesizes a generic
  whole-reference `PAGE`/`IMAGE` region pair tagged `full-reference-raster-fallback`), so this never
  crashes — it degrades to a lower-fidelity single-embedded-image result. New test in
  `tests/integration/mcp-asset-register.test.ts` locks this in end to end: register once, register
  the same bytes again with `analyzeForReconstruction: true` (confirms `DUPLICATE` outcome, no
  `reconstructionAnalysis`, no manifest on the asset), then runs the real `analyzeReference()`
  against that asset and confirms it succeeds via the real fallback path rather than failing.
- **Supported asset-type surface**: `AssetSchema.type` (document-model) already supports a wide,
  pre-existing set (IMAGE, VIDEO, FONT, AUDIO, SVG, HDRI, GLB/GLTF/FBX/OBJ/STL/USD/USDZ, BINARY) for
  asset records generally; the `asset.register` *MCP tool* deliberately only accepts `kind: "IMAGE"`
  (STEP 6's documented scope decision, not an oversight — other kinds are registered through other,
  purpose-specific pathways, e.g. GLB from 3D reconstruction). Per explicit instruction not to add
  speculative asset types, this was left exactly as is — no real Studio/MCP use case exists for
  expanding `asset.register`'s accepted kinds today.
- Targeted: `tests/integration/mcp-asset-register.test.ts` (5/5), `tests/unit/assets.test.ts`,
  `tests/integration/mcp-reconstruction-import.test.ts` all passing. Full `pnpm validate` (docs,
  dependency rules, format, lint, typecheck, **460/460 tests**, build across all 65 packages) passed
  clean.
- **Out of scope, intentionally**: `createSupabaseAssetStorage` remains unverified against a real
  Supabase Storage bucket (needs live credentials this environment doesn't have — already disclosed
  in STEP 6); no real content-safety/malware scanner exists (`inspector: "NONE"` remains an honest
  label, not a fabricated pass) — building one is a real feature, not an audit finding to harden.

---

## 77. Block D8: Real Fidelity Integration (2026-08-15)

Connected `packages/fidelity` (real, already-tested, but previously completely unwired to
`apps/`) to MCP and Studio. **Status: implemented and tested — real ValidationRecords are now
computed from actual pixel comparison and persisted.**

- **New Command Engine command `validation.record`** (`packages/command-engine/src/commands/validation.ts`,
  schema in `schemas.ts`, registered in `builtins.ts`): validates that `record.referenceIds` resolve
  into `document.references` and `record.heatmapAssetIds`/`reportAssetId` resolve into
  `document.assets` before applying, then adds the record to `document.validations`. Mirrors
  `asset.register`'s exact shape (caller supplies a complete, pre-validated record; the command only
  checks references and applies it).
- **New MCP tool `fidelity.measure`** (`packages/mcp-protocol/src/tools.ts` schemas,
  `apps/mcp-server/src/tools.ts` handler): given an already-registered reference IMAGE asset,
  real decodes the reference bytes (`sharp`), projects the *current* canonical document through the
  same, unmodified Scene Runtime + Renderer 2D pipeline Studio's own canvas and D6's sushi-poster
  test use, rasterizes it with the real `createPlaywrightRasterBackend` (headless Chromium — already
  built and tested in `packages/fidelity`, just never invoked from `apps/` before this), and runs
  `createFidelityEngine(...).run(...)` — a genuine single-pass render→compare, no correction adapter
  (auto-correction is out of scope here). The resulting `FidelityReport`'s domain scores/status are
  mapped into a real `ValidationRecord` (status: PASS→PASSED, FAIL→FAILED, WARNING→WARNING,
  BLOCKED→PENDING) and committed via `validation.record`, dry-run-first like every other write tool.
  Honestly disabled (`MCP_TOOL_DISABLED`) when no asset-byte adapter is configured, matching
  `three.import_scene`'s existing pattern.
- **Deliberately scoped down from the full ValidationRecord shape**: `referenceIds` stays empty (no
  `document.references` entry is required or fabricated for this to work) and `heatmapAssetIds`/
  `reportAssetId` stay empty/absent (no heatmap-PNG generation or full-report-as-asset persistence
  was built) — both fields are genuinely optional/empty-array-safe in the schema, and building
  heatmap generation or report-asset persistence would be new, separate feature work, not part of
  wiring the existing measurement pipeline through. The record's `metadata` still carries the real
  report id/fingerprint/task id/stopReason for traceability.
- **Studio wiring**: `apps/studio/src/core/capabilities.ts` documents `fidelity.measure` as a real,
  available (but not gateway-routable — its input doesn't match a single Command payload) capability.
  `FidelityWorkspace` (`apps/studio/src/main.tsx`) gained a real "Run fidelity measurement" button
  (visible only when the document has a registered reference, mirroring `ReferencesPanel`'s existing
  invoke → `document.get` → `session.resyncDocument()` pattern) that calls the new tool directly.
  `FidelityWorkspace`'s score/status display itself required no changes — it already read
  `document.validations` honestly and showed a real "Not evaluated" empty state; it was simply
  starved of data because nothing had ever written a record before this block.
- **Fabricated-value removal deferred to D10 by design**: the "94.8\nFIDELITY" demo text
  (`apps/studio/src/core/fixture.ts`) and the hardcoded `fontMatchStatus: "EXACT"` (both in
  `fixture.ts`'s `style()` factory and `main.tsx`'s font-picker handler) are explicitly named in the
  user's own D10 description ("Remove remaining hardcoded/fabricated status values such as
  fontMatchStatus: EXACT") — left untouched here to avoid doing D10's work prematurely under a
  different block's banner.
- New `tests/unit/command-engine.test.ts` coverage: `validation.record` commits a real record and
  rejects one referencing a non-existent asset/reference. New
  `tests/integration/mcp-fidelity-measure.test.ts`: a genuine end-to-end run — renders a real
  document via the exact same Playwright backend as a reference image, registers it, dry-runs then
  commits `fidelity.measure`, and asserts a real high score (the reference IS a render of the same
  document, so a high score is the honest expected outcome, not a rigged one) that matches what's
  actually persisted in `document.validations`; plus the disabled-adapter honesty check.
- `apps/mcp-server/package.json` gained `@aevum/renderer-2d` as a real dependency (previously used
  only indirectly).
- Targeted: `command-engine.test.ts`, `mcp-protocol.test.ts`, `mcp-server.test.ts`,
  `fidelity.test.ts`, `fidelity-workflow.test.ts`, `mcp-fidelity-measure.test.ts`,
  `studio-production.test.ts`, `studio.test.ts` all passing (66 tests). Full `pnpm validate` (docs,
  dependency rules, format, lint, typecheck, **464/464 tests**, build across all 65 packages) passed
  clean.
- **Out of scope, intentionally**: heatmap PNG generation, persisting the full `FidelityReport` JSON
  as a `reportAssetId` asset, region-level per-node domain expectations (LAYOUT/COLOR/etc. domains
  stay at real 0-coverage — honestly "not independently measured" — rather than a fabricated
  breakdown), and bounded auto-correction (`FidelityCorrectionAdapter`) — the engine already supports
  passing one in, but building a real correction-proposal adapter is separate feature work. The
  fabricated `fontMatchStatus`/demo-score cleanup itself, per D10.

---

## 78. Block D9: Multi-MCP Connection Abstraction (2026-08-15)

Replaced the single hardcoded MCP connection model with a real, testable provider/connection
abstraction. **Status: implemented and tested — current single-MCP production behavior is
unchanged.**

- **The gap**: `apps/studio/src/core/production.ts`'s `scopedClient()` built an `AgentMcpClient`
  directly from one string, `configuration.mcpUrl` (itself from one env var,
  `VITE_AEVUM_MCP_URL`), baked into every call site (the initial document read, every command-gateway
  write, and the Agent Planner's `createMcpClient` factory). There was no concept of "which
  connection" at all — just one endpoint threaded everywhere.
- **New `apps/studio/src/core/mcp-connections.ts`**: `McpConnectionDescriptor` (`{id, endpoint,
  label}`) and `McpConnectionProvider` (`{connections, resolve(connectionId?)}`).
  `createMcpConnectionProvider(connections, defaultConnectionId?)` builds a real provider —
  constructing one with zero connections, duplicate ids, or a default id that isn't among the
  configured connections all throw immediately and descriptively (real, fail-fast construction-time
  validation, not a silent fallback). `resolve()` returns the requested (or default) connection, or
  throws a clear "MCP connection \"X\" is not configured" error naming the available ids — real,
  testable connection *selection* and *failure*, not just a single string dereferenced everywhere.
  `createSingleMcpConnectionProvider(endpoint)` wraps today's one configured endpoint in this same
  shape.
- **`production.ts` wired through the provider, not the raw string**: `loadProductionStudioProject`
  now builds one `connectionProvider` (`createSingleMcpConnectionProvider(configuration.mcpUrl)`) and
  passes it into every `scopedClient()` call instead of `configuration` directly; `scopedClient()`
  itself now resolves its connection via `connectionProvider.resolve(connectionId?)` before building
  the transport. `BrowserConfigurationSchema`/`readStudioBrowserConfiguration()` are untouched — still
  exactly one `mcpUrl` from one env var — because the instruction was to preserve current single-MCP
  behavior, not to add a second real deployment endpoint that doesn't exist yet.
  All 15 pre-existing `studio-production.test.ts` tests (HTTP-mocked document reads, writes,
  capability gating, version conflicts, etc.) pass unchanged, confirming production behavior is
  byte-for-byte the same as before this refactor.
- New `tests/unit/mcp-connections.test.ts` (7 tests): default-connection resolution, real
  multi-connection selection by id, real failure on an unconfigured id, and the three construction-time
  validation failures (empty connection list, duplicate ids, unresolvable default id), plus a check
  that `createSingleMcpConnectionProvider` preserves today's exact single-endpoint shape.
- Targeted: `mcp-connections.test.ts` (7/7), `studio-production.test.ts` (15/15) both passing. Full
  `pnpm validate` (docs, dependency rules, format, lint, typecheck, **471/471 tests**, build across
  all 65 packages) passed clean.
- **Out of scope, intentionally**: no second real MCP deployment/endpoint exists to route to, no new
  env var or UI for choosing a connection was added, and the dev-fixture path
  (`createDeterministicStudioAgentContext`'s in-process transport, used when there is no real MCP
  server) was left untouched — it has no "connection" concept to abstract in the first place. This
  block builds the real extension point (a second `McpConnectionDescriptor` can be registered and
  selected later without touching any call site again), not a second live connection.

---

## 79. Block D10: Honesty/Quality Cleanup (2026-08-15)

Removed the remaining fabricated status/metric values named across earlier blocks' own findings.
**Status: implemented and tested.**

- **`fontMatchStatus: "EXACT"` hardcodes removed** in both places it existed:
  `apps/studio/src/core/fixture.ts`'s `style()` factory (used by every demo text node) and
  `apps/studio/src/main.tsx`'s font-picker `onChange` handler (stamped on every font pick,
  regardless of which font — including the dropdown's own deliberately-"missing" `Inter` option).
  Both now write `"UNKNOWN"` — the schema's real "not measured" value — since no actual
  `rankFontCandidates()` glyph-advance comparison (`packages/fidelity/src/reference.ts`) has run at
  either point. `"EXACT"`/`"LIKELY_MATCH"`/`"CLOSE_SUBSTITUTE"` remain real, reachable values once a
  genuine measurement (e.g. via D8's `fidelity.measure`) produces them — nothing in the schema
  changed, only these two call sites stopped asserting a status nothing had verified.
- **A second, worse fabrication found in the same audit**: `main.tsx`'s Typography panel's
  `.font-status` label was not reading the hardcode into a wrong field — it was **fully static JSX
  text**, `"Basic Regular · exact"`, that never changed no matter which font was actually selected
  (picking "Inter · missing" or "Arial · system" still showed "Basic Regular · exact"). Replaced with
  a real, dynamic read: `{style.fontFamily} · {style.fontMatchStatus.toLowerCase()}` — verified live
  in a browser to show "Basic · unknown" and to track the actual selected `TextStyle`, not a fixed
  string.
- **"94.8\nFIDELITY" demo artifact removed**: the fixture's "Fidelity card" frame (a rotated stat-card
  design element on the demo landing page) had literal text content claiming a specific fidelity
  score that was never computed by anything. Renamed the frame "Stat card" and changed its content to
  "PRECISION\nDESIGN" — demo marketing copy with no numeric claim, consistent with the rest of the
  landing-page mockup's copy ("Build the impossible.", "Form follows intelligence."), instead of a
  number that could be mistaken for a real measured result.
- **A stale, already-broken end-to-end assertion found and fixed while auditing this**:
  `tests/e2e/studio.spec.ts` asserted `.score-ring` contained `"94.8"` — but `document.validations`
  in this fixture has always been `{}` (empty), so this could never have passed against the current
  `FidelityWorkspace` (which shows real "Not evaluated" text when there's no record, per STEP 8) —
  this was leftover debt from before STEP 8 made the workspace honest, never updated to match. Fixed
  to assert the real empty state instead, and removed an adjacent `.getByRole("button", { name:
  /Heading width/ })` click that referenced a control that doesn't exist anywhere in the current UI
  (also stale, unrelated dead test code found in the same spot). A second stale assertion in the same
  file (`.font-status` containing `"exact"`) was updated to `"unknown"` to match the real default.
- **Full audit swept for other fabricated displayed metrics/statuses** (`grep` across
  `apps/studio/src/main.tsx` and `fixture.ts` for hardcoded status/score literals): the only other
  matches were legitimate local UI async-operation-stage enums (`"IDLE" | "UPLOADING" | "FAILED"`,
  etc., for import/measurement progress indicators) — real component state, not claims about
  measured content. No further fabricated values found.
- Updated `tests/unit/studio.test.ts` (`"Fidelity card copy"` → `"Stat card copy"` after the rename)
  and confirmed via a live browser check that the Typography panel now shows a real, tracking
  `.font-status` value with no console errors.
- Targeted: `studio.test.ts`, `studio-components.test.tsx`, `studio-approval.test.ts`,
  `studio-production.test.ts` all passing (40 tests). Full `pnpm validate` (docs, dependency rules,
  format, lint, typecheck, **471/471 tests**, build across all 65 packages) passed clean.
- **Out of scope, intentionally**: no changes to `packages/fidelity` itself (already real, per D8);
  no attempt to derive a real font-match status client-side at pick time — that requires an actual
  rendered comparison, which is exactly what `fidelity.measure` is for, not something Studio's
  properties panel can honestly compute in an `onChange` handler.

---

## 80. Block D11: Full End-to-End Capstone (2026-08-15)

The final Block D acceptance gate: the real reference-image workflow, end to end, against the
actual sushi poster, exercising every real system Block D built in one continuous run. **Status:
implemented and passing — a real, bounded, honest result, not a claim of exact reconstruction.**

- New `tests/integration/sushi-poster-capstone.test.ts` runs, in a single test, against one shared
  document/registry/repository state:
  1. **Real asset registration + local/free vision analysis** (STEP 5/6) — the actual
     `fixtures/sushi poster.jpg` registered via `asset.register` with `analyzeForReconstruction: true`.
  2. **Real editable reconstruction** (STEP 7 / D6) — `reconstruction.import_reference`, then diffs
     `document.nodes` before/after to identify the genuinely reconstructed nodes (not the pre-existing
     fixture demo content).
  3. **Real rendering** (D6) — the reconstructed document projected and rendered through the
     unmodified Scene Runtime + Renderer 2D pipeline, asserted to produce real, non-empty operations.
  4. **A real, approval-gated AI edit against the reconstructed content itself** (D5 / D cleanup) —
     new here, and the reason this is a capstone rather than a repeat of D6: a
     `REQUIRE_ALL_WRITE_APPROVAL` edit through the real `createAgentEngine`, bridged to the same
     in-process MCP executor the reconstruction steps used (a small `AgentMcpTransport` adapter
     wrapping `fixture.executor.execute`), targeting one of the just-reconstructed TEXT nodes.
     Genuinely suspends for real approval (polled with real timers, not just microtasks, since this
     path — unlike the dev-fixture's synchronous in-process transport — goes through the real MCP
     executor and a real `AgentMcpClient` timeout controller), then commits once approved, and the
     edited reconstructed node's new name is verified in the persisted document. This is the first
     test anywhere in this codebase to edit genuinely reconstructed (not fixture-authored) content
     through the real approval-gated agent path.
  5. **A real measured fidelity score against the actual reference** (D8) — `fidelity.measure` run
     with the real sushi poster as the reference asset, producing a real `ValidationRecord` persisted
     into `document.validations`. Deliberately asserts only that the score is a real, bounded number
     (`0 <= score <= 1`) and a valid status — never a specific high threshold, since D6/STEP 11 already
     documented this pipeline's real, disclosed limitations (the stylized headline is never detected
     as text; some OCR is garbled) and this capstone must not fabricate a pass that hides them.
- Confirms, with real measured evidence, exactly what D6 already found and no more: the pipeline
  produces genuinely editable, renderable, approval-respecting reconstructed content from a real,
  hard, non-synthetic image — not a claim that the reconstruction is visually exact.
- Targeted: the capstone test passes in ~16s. Full `pnpm validate` (docs, dependency rules, format,
  lint, typecheck, **472/472 tests**, build across all 65 packages) passed clean.
- **Out of scope, intentionally**: no changes to any of the systems this test exercises — D11 is
  verification, not new capability. No auto-correction loop was exercised (the fidelity measurement
  uses no `FidelityCorrectionAdapter`, matching D8's scope). Block D13 (performance investigation)
  remains a separate, not-yet-started item — it is not part of this acceptance gate.

---

## 81. Block D13: Performance Investigation — Studio Tab-Return/Freeze (2026-08-15)

Real, executed reproduction and measurement of the tab-return delay mechanism — not a re-read of
STEP 10's earlier static-code diagnosis. **Status: verified via real, measured reproduction; no new
defect found, no code fix needed (STEP 10's fix already correctly addresses the mechanism); two
alternative hypotheses ruled out with real evidence.**

- **Live-browser attempt, and its real, honest limit**: opened the dev-fixture Studio app in a real
  Chromium instance and attempted to reproduce tab-backgrounding effects via the Page Visibility API
  (creating a second tab to background Studio, waiting, then reselecting it; also dispatching
  synthetic `visibilitychange`/`focus` events). Found, empirically: this environment's sandboxed
  Chromium instance reports `document.visibilityState` as permanently `"hidden"` regardless of tab
  focus or selection — confirmed after closing all other tabs and reloading fresh. This makes
  Page-Visibility-based reproduction unusable in this specific environment; it is a real, measured
  environment constraint, not a guess or an excuse.
- **A real, useful negative finding from the same investigation**: a full search of Studio's client
  code (`apps/studio/src`) found zero `visibilitychange` listeners anywhere, and the only
  `requestAnimationFrame` loop in the app (`ThreeViewport.tsx`'s 3D scene rotation) advances by a
  fixed per-callback increment (`mesh.rotation.y += 0.0025`), not a wall-clock time delta — so it
  cannot produce a "catch-up" burst of work after RAF is paused/throttled by backgrounding, even in
  principle. This rules out two plausible alternative tab-return-freeze mechanisms with real evidence
  (an app-level visibility handler doing expensive work, and a delta-time animation bug), leaving
  STEP 10's diagnosed Supabase-session-identity mechanism as the correct, sole real cause on record.
- **Real, executed reproduction of the actual mechanism**: new
  `tests/unit/studio-bootstrap.test.tsx` mounts the real `ProductionBootstrap` component (newly
  exported from `main.tsx` for this purpose, matching Block D3's existing test-export precedent) with
  a controllable fake Supabase auth client (mocked at `production.js`'s own
  `createStudioAuthClient` — a far more reliable `vi.mock` target than the third-party
  `@supabase/supabase-js` package directly, which this investigation found does not mock reliably via
  `vi.doMock` in this module graph) and a mocked `/v1/bootstrap` fetch with a real call counter. Fires
  the exact event shape a real Supabase background token refresh produces — a genuinely new `Session`
  object, same signed-in user — and **measures**, via that real call count, that the expensive full
  project reload does not fire a second time. A second test fires a genuine identity change (a
  different user) and confirms the reload *does* correctly fire — proving the guard is selective, not
  just permanently suppressed (which would itself be a real, different bug: a user who actually signs
  out and back in as someone else must still get a fresh project).
- This directly answers D13's brief: reproduce (a controlled, realistic trigger through the real
  component, since a live Supabase-backed browser reproduction is not possible in this environment),
  measure (a real call count, not a read of the source), identify the bottleneck (confirmed: none
  remains — the one that existed was STEP 10's now-verified fix), and regression-test (this file, so
  a future regression in the guard condition fails a real test, not just a code review).
- `docs/STABILIZATION_KNOWN_LIMITATIONS.md`'s STEP 10 section updated to record all of the above,
  replacing the prior "verified by code-level analysis... production confirmation is still open" note
  with the real reproduction and its findings — production confirmation against a live Supabase
  deployment remains honestly open (this environment still has no live backend to time it against
  end-to-end), but the causal mechanism is no longer merely inferred from reading the code.
- Targeted: `studio-bootstrap.test.tsx` (2/2), `studio-production.test.ts`, `studio-components.test.tsx`,
  `studio.test.ts` all passing (30 tests). Full `pnpm validate` (docs, dependency rules, format, lint,
  typecheck, **474/474 tests**, build across all 65 packages) passed clean.
- **Out of scope, intentionally**: no code fix was made — none was needed, since STEP 10's existing
  fix is now verified correct rather than merely plausible. No attempt was made to acquire real
  Supabase credentials for a live production timing run; that remains a genuinely open item requiring
  infrastructure this environment doesn't have, not something further local investigation can close.

---

## 82. Block D Completeness Pass (2026-08-16)

A full re-audit of `docs/STABILIZATION_KNOWN_LIMITATIONS.md` against current code, prompted by a
direct request to identify and close remaining Block D (Studio/MCP completeness) gaps. **Status:
implemented and tested — stale documentation corrected, three genuinely closeable gaps closed, four
genuinely blocked/large items left open with concrete, stated reasons.**

- **Stale-documentation audit**: several limitation bullets recorded gaps that earlier Block D work
  (D2–D13, already committed in prior sessions) had already closed without the document being
  updated — verified against current code before correcting, not assumed. Corrected in place: STEP
  3's "only 4 command types mapped" (`apps/studio/src/core/capabilities.ts`'s `STUDIO_CAPABILITIES`
  registry documents 12 today), STEP 4's approval-adapter-is-a-stub claim (replaced by D5's
  `createInteractiveApprovalAdapter`) and stale `deriveChangesFromPrompt()` reference (renamed/moved
  server-side to `interpretNodeEditPrompt()` in D4), STEP 5/7's "IMAGE regions are never
  independently extracted" claim (`extractIndependentImageAssets()` already does this for qualifying
  regions), and STEP 7/8's "no automatic fidelity evaluation" / "nothing ever writes a
  ValidationRecord" claims (D8 built real, on-demand measurement and persistence — reframed as
  intentional on-demand design, not a gap).
- **"Replace reference" wired**: new `reference.update` Command Engine command
  (`packages/command-engine/src/commands/reference.ts`) + MCP tool
  (`apps/mcp-server/src/tools.ts`) replaces an existing reference's underlying `assetId` while
  preserving its `id`, so `ValidationRecord`s that cite it by `referenceId` stay linked. Studio's
  References panel button now uploads a replacement image and calls it, mirroring the existing
  "Import reference" upload UX. Tested at the Command Engine, MCP integration, and capability-
  registry layers (`tests/unit/command-engine.test.ts`, `tests/integration/mcp-reference-update.test.ts`).
- **Capability re-fetch mechanism**: `ProductionStudioProject.refreshCapabilities()`
  (`apps/studio/src/core/production.ts`) re-calls `client.discoverCapabilities()` and swaps the
  module's capability state (enabled tools + derived actor permissions, now held in a mutable
  binding behind a getter so the existing `StudioAgentContext` interface shape didn't need to
  change) in place. `ProductionBootstrap` (`apps/studio/src/main.tsx`) calls it automatically on
  `document.visibilitychange` whenever the tab becomes visible again. Closes STEP 3's "no
  client-side capability re-fetch" gap: a mid-session role change is now reflected without a full
  project reload. Tested in `tests/unit/studio-production.test.ts` via a fetch mock that changes
  `enabledTools` between calls, asserting a command is rejected before the refresh and accepted
  after it.
- **Reconstruction page-merge**: `reconstruction.import_reference` accepts an optional
  `targetPageId`; when set and it resolves to a real PAGE already in the target document,
  `createReconstructionProposal()` (`packages/reconstruction/src/proposal.ts`) parents the new
  FRAME under that page and skips proposing a `page.create` at all, relying on the Command Engine's
  existing `addNode()` parent-`childIds`-append behavior rather than needing a new update command.
  Opt-in: when unset (Studio's current default), behavior is unchanged — a new page is always
  created. Verified end to end by a new test in
  `tests/integration/mcp-reconstruction-import.test.ts` (imports twice, second import's
  `targetPageId` set to the first import's page, asserts exactly one PAGE node and two FRAME
  children under it), plus the full existing reconstruction/sushi-poster/fidelity suite re-run
  clean to confirm no regression to the unset-`targetPageId` default path.
- **Out of scope, intentionally, each for a concrete stated reason** (not a design preference):
  live Supabase Storage confirmation (needs real bucket credentials this environment doesn't have),
  malware/content-safety scanning on asset upload (needs a real third-party scanning service, no
  honest local substitute exists), stylized/display typography detection for the sushi poster's
  "SUSHI" headline (needs a dedicated text-region-detection front end — new ML engineering, not a
  fix to what exists), on-canvas reference-image overlay (a real, sizeable new Studio UI feature —
  canvas layering, opacity control, toggle state — not a small wiring gap). All four are recorded
  with their specific blocking reason in `docs/STABILIZATION_KNOWN_LIMITATIONS.md`'s new "Block D
  completeness pass" section.
- Full `pnpm validate` (docs, dependency rules, format, lint, typecheck, tests, build across all
  packages) run clean for this combined change set — see validation counts in the commit this
  section accompanies.

---

## 83. Block E: Real Agent / AI Integration (2026-08-16)

Turns the Agent system from a dispatcher over ~15 fixed single-target plan templates into a
genuinely useful design-operation planner: a compound multi-operation prompt becomes a real,
document-aware, dependency-ordered plan that executes through the existing MCP/Command Engine
pipeline, and Maximum Fidelity measurement is connected to a real (if narrowly scoped) correction
loop for the first time. **Status: implemented and tested — E1 through E4 complete; E5 complete for
the one issue type (SHAPE fill color) the current architecture can honestly derive a correction for,
with the remaining boundary (structural/layout correction) documented rather than faked.**

### E1–E4: compound multi-operation edit planner

- **`packages/agent-planner/src/compound-edit.ts`** (new): deterministic, pure-text clause parsing —
  splits a prompt like "make the headline larger, move the product slightly right, change the
  background to orange and add a thin black border" into independently classified clauses
  (RESIZE/MOVE/RECOLOR_FILL/ADD_BORDER/RENAME), each with a target keyword or, when a clause names
  none of its own, real anaphora (inherits the previous clause's real resolved target — "border" is
  deliberately excluded from the target-noun vocabulary since it names a property, not an entity, so
  "add a ... border" correctly continues from whatever the prior clause targeted).
- **`packages/agent-planner/src/deterministic.ts`**: new `compoundEditPlan()` builds one shared
  `document.get` (full projection) READ + one shared `RESOLVE_COMPOUND_EDIT` ANALYZE step, then a
  real dry-run/write pair per clause (a `token.register` dry-run/write pair first for any clause
  needing a new color, the node's write depending on it — the real "create/update token → update
  paint" dependency chain the spec asked for, not two independent, uncoordinated writes).
  `expectedDocumentVersion` for each write is bound from the PRECEDING write's own real result
  (`data.resultVersion`), never back to the original read — sequential writes in the same run no
  longer collide on a stale version the moment an earlier clause's write actually commits (a real
  bug found and fixed via live testing before this was committed).
- **`packages/agent-runtime/src/engine.ts`**: new `RESOLVE_COMPOUND_EDIT` analyze-step handler is
  where document-awareness (E2) actually lives — it resolves each clause's target keyword against
  the REAL current document (name substring match first, then real type/size-based fallbacks:
  largest-font TEXT for "headline"/"title", smallest-font TEXT for "text"/"body"/"copy", largest-area
  IMAGE for "product"/"photo"/etc., largest-area SHAPE/FRAME for "background"/"backdrop") and
  computes real changes from that node's actual current state (real resize factors, real move
  deltas, real sampled/named colors registered as fresh COLOR tokens). Throws honestly — before any
  write in the run — when a clause's real target can't support the requested operation (e.g.
  recoloring a FRAME, which has no fill), so a partially-valid compound edit makes zero writes, not
  some. Also fixes a second real bug found via live testing: the existing rich-approval-context
  helper (`findPrecedingNodeSnapshot`, from Block D cleanup) only understood a node-subtree read's
  array shape, not the full-document projection's record shape compound edits use — it crashed every
  approval-gated compound edit until fixed.
- **Studio**: `AiPanel` now routes to the compound planner when no layer is selected (previously this
  silently fell back to editing the first root node, despite the UI already saying "Document
  context"). The dev-fixture in-process MCP transport and `StudioSession` gained
  `document.get`(full)/`registerToken` support so this works end to end in local Studio too, not only
  against a real MCP server.
- **Verified live in Studio** (dev server, not just tests): a multi-clause resize resolving two
  different real nodes; a recolor producing a real token → real rendered color (`rgb(234, 88, 12)`,
  confirmed via computed style, matching the named "orange" exactly); an honest failure recoloring a
  FRAME with no partial writes; a version-conflict regression test proving the sequential-write fix.
- Tests: `tests/unit/compound-edit.test.ts` (9, pure parser), `tests/unit/agent-planner.test.ts`
  (+3: plan shape/dependency ordering, ambiguity blocking, honest capability gap),
  `tests/unit/studio-compound-edit.test.ts` (4, real engine end to end: document-aware resolution +
  token dependency chain, sequential version threading, no-partial-writes on failure, real approval
  gating).

### E5: fidelity feedback loop

- **Real per-node regions**: `fidelity.measure` now builds real, node-attributed COLOR regions from
  the render graph's own SHAPE paint operations — a pixel mismatch is attributed to the exact node
  responsible, not folded into one opaque whole-document score as before.
- **A real, previously-missing derivation primitive**: `packages/fidelity/src/pixels.ts`'s new
  `averageColor()` — nothing in this package had ever extracted a concrete color value from pixels;
  comparisons only ever produced distance metrics or content hashes, neither usable as a correction
  target. A COLOR-domain region issue's `expected`/`actual` now carries a real sampled RGB swatch
  instead of a hash.
- **The report now actually flows forward**: `fidelity.measure`'s output gained the full, real
  `FidelityReport` (previously computed, then discarded after being boiled into the ValidationRecord
  summary) — closing the specific gap that made `fidelity.propose_corrections` require a report from
  somewhere else entirely.
- **A real, narrow `autoCorrect` flag** (default off, never attempted under a dry run): when set, a
  real `FidelityCorrectionAdapter` proposes the top real color-mismatch issue, registers a real COLOR
  token sampled from the reference image's own pixels at that node's exact region, and applies it via
  `node.update` — inside the existing, already-built `createFidelityEngine` orchestration
  (propose → dryRun → apply → re-render → re-measure → regression-check), not a new engine. The
  correction's real commands and the ValidationRecord commit together in one atomic transaction.
- **Deliberately not built: structural (layout/crop) auto-correction.** Investigated concretely
  before deciding: `packages/correction`'s engine (`generateCorrectionCandidates`/
  `compileCorrectionTransaction`) has no inference logic of its own anywhere — it only ever copies an
  externally-supplied `expectedValue` onto real node fields. `fidelity.measure` has no independent
  source for an "expected" layout distinct from the document's own current state (no stored
  checkpoint of "what the layout should be" exists anywhere), so routing structural issues through
  that engine today would silently produce empty, no-op proposals for every issue this tool actually
  generates — a fake connection, not a real one. Left honestly unbuilt rather than wired to produce
  nothing.
- New `tests/integration/mcp-fidelity-autocorrect.test.ts`: a real SHAPE filled the wrong color (red)
  measured against a real reference image genuinely showing blue in that exact region — asserts the
  plain measurement reports a real node-attributed sampled expected color (not a hash), `autoCorrect`
  actually changes the node's `fillTokenId` to a new token whose real value is blue (not the
  original), a re-measurement shows genuine score improvement (not fabricated), and a dry run applies
  no correction and leaves the document completely untouched.

### Validation

- Targeted: 9 + 3 + 4 (E1-E4) plus 2 (E5) new tests, all passing; full existing fidelity/agent/studio
  suites re-run clean (no regressions).
- Full `pnpm validate` (docs, dependency rules, format, lint, typecheck, **496/496 tests** after
  E1-E4 and **498/498 tests** after E5, build across all 65 packages) passed clean for both commits.
- **Out of scope, intentionally**: structural/layout auto-correction (see above — no honest data
  source exists yet); multi-pass convergence beyond one correction attempt per `fidelity.measure`
  call (the existing orchestrator supports it, this pass only exercises a single real correction);
  extending the compound-edit target vocabulary beyond the current design-noun set (real node names
  outside that vocabulary — e.g. "Signal" — are not matched unless they also happen to be a
  vocabulary word); no LLM, no external AI API of any kind used anywhere in Block E, matching the
  project's existing deterministic-provider constraint throughout.

---

## 84. Final Roadmap Statement

The AEVUM AI Reconstruction Engine shall be implemented through controlled, dependency-aware milestone gates that preserve quality, architectural consistency, validation, and production readiness.

The roadmap shall remain a living implementation record. No feature shall be marked complete based on appearance alone; every phase must satisfy its documented structural, functional, validation, security, performance, MCP, and export acceptance criteria.
