# AEVUM AI Reconstruction Engine — System Architecture

## 1. Purpose

This document defines the technical architecture of the AEVUM AI Reconstruction Engine.

It explains how the requirements in:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`

shall be implemented as a coherent, extensible, testable, and production-grade system.

This document is authoritative for:

- Repository structure
- Application boundaries
- Package ownership
- Runtime responsibilities
- Canonical Design Document lifecycle
- Command processing
- Rendering architecture
- 2D and 3D engine integration
- MCP integration
- Asset processing
- Reconstruction workflows
- Validation workflows
- Export workflows
- Storage
- Job execution
- Sandboxing
- Observability
- Security
- Scalability
- Reliability

This document does not redefine product scope. It translates approved product requirements into system boundaries and technical responsibilities.

---

## 2. Architectural Goals

The architecture shall satisfy the following goals:

1. Preserve one Canonical Design Document across all workflows.
2. Keep 2D and 3D systems first-class and interoperable.
3. Support AI control through MCP.
4. Avoid coupling the system to one model vendor.
5. Keep renderers and exporters replaceable.
6. Support deterministic rendering and validation.
7. Support reversible, command-driven state changes.
8. Preserve original and derived assets.
9. Support local and distributed execution.
10. Scale expensive work through dedicated workers.
11. Isolate unsafe or untrusted execution.
12. Support multiple export stacks without changing the Canonical Design Document.
13. Allow advanced external tools such as Blender to participate without becoming the source of truth.
14. Maintain inspectability, auditability, and testability.
15. Prioritize Maximum Fidelity while preserving performance profiles.

---

## 3. Core Architectural Principle

The system shall be organized around one versioned Canonical Design Document.

Every major subsystem shall either:

- Read from the Canonical Design Document
- Produce structured changes to it
- Render from it
- Validate against it
- Export from it

No subsystem shall maintain an independent hidden representation of the complete project as its source of truth.

Subsystem-specific caches and runtime projections are allowed, but they must be regenerable from the Canonical Design Document and associated assets.

The Canonical Design Document shall remain renderer-independent and exporter-independent.

---

## 4. High-Level System Model

```text
MCP Client / AI Agent
        ↓
MCP Server
        ↓
Command Engine
        ↓
Canonical Design Document
        ↓
┌──────────────────────────────────────────────────────┐
│ Reconstruction │ 2D Runtime │ 3D Runtime │ Animation │
│ Assets         │ Validation │ Exporters  │ Jobs      │
└──────────────────────────────────────────────────────┘
        ↓
Rendered Output / Code / Canva / 3D / Reports
```

The core flow shall be:

```text
Reference Input
→ Asset Ingestion
→ Analysis
→ Structured Reconstruction
→ Canonical Design Document
→ Render
→ Validate
→ Correct
→ Export
```

---

## 5. Recommended Monorepo Structure

```text
aevum-reconstruction-engine/
│
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── biome.json
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── docs/
│   ├── 00_PROJECT_CONTEXT.md
│   ├── 01_PRODUCT_REQUIREMENTS.md
│   ├── 02_SYSTEM_ARCHITECTURE.md
│   ├── 03_DESIGN_DOCUMENT_MODEL.md
│   ├── 04_RECONSTRUCTION_PIPELINE.md
│   ├── 05_TYPOGRAPHY_AND_ASSETS.md
│   ├── 06_ANIMATION_AND_RENDERING.md
│   ├── 07_3D_ENGINE_AND_CINEMATICS.md
│   ├── 08_MCP_SPECIFICATION.md
│   ├── 09_VISUAL_VALIDATION.md
│   ├── 10_EXPORT_SYSTEM.md
│   └── 11_ROADMAP_AND_STATUS.md
│
├── apps/
│   ├── studio/
│   ├── mcp-server/
│   ├── api/
│   ├── render-worker/
│   ├── reconstruction-worker/
│   ├── asset-worker/
│   ├── export-worker/
│   ├── blender-bridge/
│   └── preview-runtime/
│
├── packages/
│   ├── document-model/
│   ├── command-engine/
│   ├── project-store/
│   ├── scene-runtime/
│   ├── renderer-2d/
│   ├── renderer-3d/
│   ├── typography/
│   ├── vector-engine/
│   ├── assets/
│   ├── animation/
│   ├── reconstruction/
│   ├── validation/
│   ├── exporters/
│   ├── mcp-protocol/
│   ├── job-system/
│   ├── sandbox/
│   ├── telemetry/
│   ├── test-fixtures/
│   └── shared/
│
├── exporters/
│   ├── html-css/
│   ├── react/
│   ├── nextjs/
│   ├── tailwind/
│   ├── css-modules/
│   ├── styled-components/
│   ├── sass/
│   ├── gsap/
│   ├── framer-motion/
│   ├── threejs/
│   ├── react-three-fiber/
│   ├── lottie/
│   ├── rive/
│   ├── svg/
│   ├── gltf/
│   └── canva/
│
├── services/
│   ├── storage/
│   ├── queue/
│   ├── database/
│   └── observability/
│
├── scripts/
├── fixtures/
├── examples/
└── tests/
```

The exact physical layout may evolve, but package responsibilities and dependency direction must remain controlled.

---

## 6. Application Responsibilities

## 6.1 `apps/studio`

The Studio application shall provide:

- Project browsing
- Document inspection
- Layer inspection
- Scene hierarchy inspection
- Reference viewing
- 2D preview
- 3D preview
- Timeline preview
- Camera preview
- Validation overlays
- Difference heatmaps
- Export configuration
- Job status
- Error reporting
- Manual expert correction where required

The Studio is not the primary product identity.

It is an inspection and control interface around the AI-controlled engine.

The Studio shall not bypass the Command Engine when mutating project state.

---

## 6.2 `apps/mcp-server`

The MCP Server shall expose the engine to MCP-compatible agents.

Responsibilities include:

- Tool discovery
- Tool schemas
- Resource exposure
- Prompt resources where required
- Request validation
- Authentication
- Authorization
- Transaction boundaries
- Command translation
- Job submission
- Progress reporting
- Result retrieval
- Error normalization
- Audit logging

The MCP Server shall not directly mutate project state.

It shall invoke the Command Engine or submit jobs.

---

## 6.3 `apps/api`

The API application shall support:

- Project lifecycle
- Asset lifecycle
- Job lifecycle
- Export lifecycle
- Authentication
- Authorization
- Project metadata
- Version history
- Validation reports
- Render retrieval
- Preview access
- Studio communication
- External tool callbacks

The API shall not own rendering logic.

---

## 6.4 `apps/render-worker`

The Render Worker shall execute:

- Deterministic 2D renders
- Deterministic 3D renders
- Region renders
- Layer-only renders
- Breakpoint renders
- Animation frame renders
- Camera sequence renders
- Turntable renders
- Validation reference renders
- Export verification renders

The worker shall support isolated execution and reproducible render settings.

---

## 6.5 `apps/reconstruction-worker`

The Reconstruction Worker shall execute:

- Reference preprocessing
- Element detection
- Layer proposal
- Layout inference
- Typography inference
- Asset extraction
- Component detection
- Scene construction
- Motion analysis
- Multi-view 3D reconstruction coordination
- Reconstruction confidence scoring

It shall produce structured proposals and commands rather than uncontrolled mutations.

---

## 6.6 `apps/asset-worker`

The Asset Worker shall execute:

- Segmentation
- Background removal
- Object extraction
- Mask generation
- Relighting
- Upscaling
- Denoising
- Sharpening
- Responsive crop generation
- Texture-map generation
- Texture compression
- Model analysis
- Asset hashing
- Duplicate detection
- Asset derivative creation

Original assets shall remain immutable.

---

## 6.7 `apps/export-worker`

The Export Worker shall execute:

- Export plan generation
- Target-specific transformation
- Code generation
- Asset packaging
- Dependency generation
- Build verification
- Render verification
- Export report generation
- Canva packaging
- 3D optimization
- Archive generation

Exporters shall run in sandboxes.

---

## 6.8 `apps/blender-bridge`

The Blender Bridge shall coordinate professional offline 3D operations.

Responsibilities may include:

- Model import
- Mesh modification
- Retopology
- UV unwrapping
- Baking
- Rigging
- Weight correction
- Physics simulation
- High-quality rendering
- Camera creation
- Lighting creation
- Scene conversion
- GLB and GLTF export

Blender shall be treated as an execution backend, not the canonical project store.

All meaningful Blender operations shall be represented in the Canonical Design Document or associated command history.

---

## 6.9 `apps/preview-runtime`

The Preview Runtime shall provide an isolated renderer for:

- Interactive previews
- Export previews
- Validation captures
- Responsive testing
- Animation playback
- 3D interaction testing
- Browser compatibility checks

It shall support deterministic and interactive modes.

---

## 7. Package Responsibilities

## 7.1 `packages/document-model`

This package shall own:

- Canonical Design Document schemas
- Node schemas
- Asset references
- Timeline schemas
- Camera schemas
- Material schemas
- Rig schemas
- Responsive overrides
- Validation metadata
- Export metadata
- Schema validation
- Serialization
- Deserialization
- Version migrations
- Stable identifiers

No renderer-specific code shall exist in this package.

---

## 7.2 `packages/command-engine`

This package shall own:

- Command definitions
- Command validation
- Command execution
- Transactions
- Undo
- Redo
- Change sets
- History
- Conflict detection
- Idempotency support
- Command result metadata
- Audit records

Every state-changing operation shall pass through this layer.

---

## 7.3 `packages/project-store`

This package shall own:

- Project persistence
- Document versions
- Snapshots
- Command logs
- Asset references
- Recovery
- Autosave
- Branching support
- Migration orchestration
- Project locking
- Concurrency controls

---

## 7.4 `packages/scene-runtime`

This package shall build runtime scene projections from the Canonical Design Document.

Responsibilities include:

- Node graph traversal
- Transform resolution
- Constraint resolution
- Responsive override application
- Component instance resolution
- Timeline binding
- Asset resolution
- Scene invalidation
- Runtime caching

---

## 7.5 `packages/renderer-2d`

This package shall own:

- DOM rendering
- CSS rendering
- SVG rendering
- Canvas rendering
- WebGL composition
- Raster composition
- Layer isolation
- Region rendering
- Effect rendering
- Hybrid render selection
- Deterministic 2D capture

---

## 7.6 `packages/renderer-3d`

This package shall own:

- Three.js runtime
- React Three Fiber bindings
- Mesh loading
- Material loading
- Camera runtime
- Lighting runtime
- Environment runtime
- Animation mixer
- Post-processing
- Physics runtime integration
- Responsive quality profiles
- Deterministic 3D capture

---

## 7.7 `packages/typography`

This package shall own:

- Font ingestion
- Font metadata
- Glyph measurement
- Kerning
- Line breaking
- OpenType features
- Variable font axes
- Text shaping
- Font match classification
- Typography comparison
- Text-to-vector conversion
- Typography export metadata

---

## 7.8 `packages/vector-engine`

This package shall own:

- Bézier paths
- Node operations
- Boolean operations
- Compound paths
- Stroke geometry
- Path offsets
- Corner smoothing
- Vector tracing
- Perspective warp
- Mesh warp
- Envelope distortion
- SVG import
- SVG optimization
- Shape morphing

---

## 7.9 `packages/assets`

This package shall own:

- Asset metadata
- Asset hashing
- Source preservation
- Derivative relationships
- Masks
- Crops
- Image variants
- Texture maps
- Model variants
- Licensing metadata
- Provenance
- Optimization profiles
- Asset lookup

---

## 7.10 `packages/animation`

This package shall own:

- Timelines
- Tracks
- Keyframes
- Easing
- Springs
- Time remapping
- Nested timelines
- Trigger bindings
- Motion paths
- Shared 2D and 3D animation semantics
- Runtime adapters
- Export adapters

---

## 7.11 `packages/reconstruction`

This package shall own:

- Reference analysis contracts
- Detection results
- Reconstruction proposals
- Layer inference
- Layout inference
- Typography inference
- Asset inference
- 3D reconstruction coordination
- Motion reconstruction coordination
- Confidence scoring
- Correction proposal generation

---

## 7.12 `packages/validation`

This package shall own:

- Pixel comparison
- Perceptual comparison
- Structural comparison
- Edge comparison
- Typography comparison
- Layout comparison
- Color comparison
- Effect comparison
- 3D silhouette comparison
- Camera comparison
- Material comparison
- Multi-angle validation
- Difference maps
- Scoring
- Completion criteria
- Regression baselines

---

## 7.13 `packages/exporters`

This package shall own:

- Exporter interfaces
- Export plans
- Capability mapping
- Fallback reporting
- Shared code-generation utilities
- Asset packaging
- Export manifests
- Validation hooks
- Plugin registration

Target-specific implementations may live in the top-level `exporters/` directory.

---

## 7.14 `packages/mcp-protocol`

This package shall own:

- MCP tool schemas
- MCP resource schemas
- MCP result types
- MCP error types
- Permission models
- Transaction models
- Domain namespaces
- Version negotiation

---

## 7.15 `packages/job-system`

This package shall own:

- Job definitions
- Queue abstraction
- Retries
- Priorities
- Cancellation
- Progress
- Checkpointing
- Worker leases
- Timeouts
- Failure classification
- Result storage

---

## 7.16 `packages/sandbox`

This package shall own:

- Process isolation
- Filesystem restrictions
- Network restrictions
- Resource limits
- Export execution
- Build verification
- Untrusted code handling
- Temporary workspace lifecycle

---

## 7.17 `packages/telemetry`

This package shall own:

- Structured logs
- Traces
- Metrics
- Job timings
- Render timings
- Export timings
- Memory usage
- GPU metrics
- Error correlation
- Audit events

---

## 7.18 `packages/shared`

This package shall contain only genuinely shared primitives.

It shall not become a dumping ground for domain logic.

---

## 8. Dependency Rules

The architecture shall enforce directional dependencies.

Recommended dependency direction:

```text
shared
  ↑
document-model
  ↑
command-engine
  ↑
scene-runtime
  ↑
renderers / reconstruction / validation / exporters / MCP
```

Rules:

- `document-model` shall not depend on renderers.
- `command-engine` shall not depend on Studio.
- `renderer-2d` shall not depend on exporters.
- `renderer-3d` shall not depend on exporters.
- Exporters may depend on document and runtime packages.
- MCP shall depend on contracts and commands, not UI.
- Studio shall depend on public package APIs.
- Blender Bridge shall not own canonical state.
- Validation shall not mutate state directly.
- Reconstruction shall propose commands.
- Asset processing shall not overwrite originals.

Circular dependencies shall be prohibited.

---

## 9. Canonical Design Document Lifecycle

The document lifecycle shall be:

```text
Create
→ Validate schema
→ Persist
→ Apply commands
→ Produce version
→ Render runtime projection
→ Validate output
→ Apply correction commands
→ Export
→ Archive reports
```

Every saved version shall include:

- Document version
- Schema version
- Command sequence reference
- Asset manifest reference
- Renderer compatibility metadata
- Export compatibility metadata
- Validation summary
- Timestamp
- Actor identity
- Parent version

---

## 10. Command Architecture

All meaningful state changes shall use structured commands.

Example command envelope:

```json
{
  "commandId": "cmd_01",
  "projectId": "project_01",
  "documentVersion": 18,
  "type": "node.update",
  "targetId": "node_42",
  "payload": {
    "opacity": 0.8
  },
  "metadata": {
    "actor": "mcp-agent",
    "reason": "visual-correction",
    "transactionId": "tx_11"
  }
}
```

Command processing shall include:

1. Authentication
2. Authorization
3. Schema validation
4. Project-version validation
5. Precondition checks
6. Execution
7. Result validation
8. Persistence
9. Version creation
10. Audit recording
11. Event publication

Commands shall support:

- Atomic transactions
- Undo
- Redo
- Dry run
- Validation
- Idempotency where practical
- Optimistic concurrency
- Conflict reporting
- Batch execution

---

## 11. Event Architecture

The system should publish domain events after successful state changes.

Examples:

```text
project.created
document.version_created
node.created
node.updated
asset.imported
asset.derivative_created
reconstruction.completed
render.completed
validation.completed
correction.applied
export.completed
job.failed
```

Events shall support:

- Worker orchestration
- Cache invalidation
- UI updates
- Audit logs
- Progress tracking
- Future collaboration

Events shall not replace the command log as the source of mutation history.

---

## 12. Storage Architecture

The system shall separate:

- Structured project metadata
- Canonical Design Documents
- Command history
- Asset binaries
- Render outputs
- Validation reports
- Export artifacts
- Job checkpoints
- Temporary files

The primary hosted backend shall be Supabase. Supabase Postgres shall hold structured records, and Supabase Storage shall be the first hosted object-storage adapter. Application configuration shall distinguish the pooled runtime database URL from the direct administrative and migration URL.

Core asset and persistence contracts shall remain provider-neutral. Supabase, local filesystem, S3, Cloudflare R2, and MinIO implementations shall be adapters rather than canonical state owners.

Recommended storage categories:

### Relational database

Use for:

- Users
- Workspaces
- Projects
- Permissions
- Versions
- Jobs
- Export records
- Asset metadata
- Audit logs
- References

### Object storage

Use for:

- Original images
- Videos
- Fonts
- Models
- Textures
- HDRIs
- Render outputs
- Difference maps
- Export archives
- Generated derivatives

### Cache

Use for:

- Runtime projections
- Render caches
- Asset metadata
- Job state
- Frequently accessed document versions

Original assets shall be immutable.

Derived assets shall reference their source asset and transformation history.

---

## 13. Asset Identity and Provenance

Each asset shall have:

- Stable asset ID
- Content hash
- MIME type
- File size
- Dimensions
- Duration where applicable
- Source type
- Original filename
- Project ownership
- License metadata
- Provenance metadata
- Derivative links
- Processing history
- Validation status
- Optimization status

Duplicate detection shall use content hashing and perceptual similarity where appropriate.

---

## 14. Job System Architecture

Long-running operations shall execute as jobs.

Job categories include:

- Asset processing
- Reconstruction
- 2D rendering
- 3D rendering
- Animation rendering
- Validation
- Autonomous correction
- Export
- Build verification
- Blender execution
- Texture baking
- Simulation baking
- Model optimization

Each job shall support:

- Unique job ID
- Type
- Priority
- Project ID
- Document version
- Input manifest
- Progress
- Checkpoints
- Cancellation
- Retry policy
- Timeout
- Worker assignment
- Output manifest
- Failure details

Maximum Fidelity workflows shall support resumable multi-stage jobs.

---

## 15. Reconstruction Architecture

The Reconstruction Pipeline shall be decomposed into stages:

```text
Reference ingestion
→ Preprocessing
→ Detection
→ Semantic grouping
→ Typography analysis
→ Asset extraction
→ Layout inference
→ Scene proposal
→ Structured command generation
→ Initial render
→ Validation
→ Correction
```

Each stage shall produce inspectable intermediate outputs.

The pipeline shall not directly write arbitrary document state.

It shall generate validated reconstruction proposals or commands.

---

## 16. Hybrid 2D Rendering Architecture

The Hybrid 2D Renderer shall support multiple render backends.

A render planner shall decide how each node is represented.

Possible node assignments:

- DOM for semantic content
- CSS for layout and standard effects
- SVG for vectors and path text
- Canvas for pixel processing
- WebGL for shaders and complex effects
- Raster for unsupported or source-native imagery

The render planner shall consider:

- Fidelity
- Editability
- Accessibility
- Animation requirements
- Export target
- Performance
- Browser compatibility
- Validation determinism

The renderer shall support mixed compositions.

---

## 17. 3D Runtime Architecture

The browser 3D runtime shall primarily use:

- Three.js
- React Three Fiber bindings where required
- WebGL
- WebGPU adapters where practical in the future

The offline 3D toolchain may use Blender for:

- Modelling
- Sculpting
- Retopology
- UV work
- Baking
- Rigging
- Simulation
- High-quality rendering
- Complex scene conversion

The Canonical Design Document shall store:

- Model references
- Mesh metadata
- Material definitions
- Camera definitions
- Light definitions
- Rig definitions
- Animation bindings
- Scene hierarchy
- Export metadata

The system shall maintain high-resolution master assets and optimized delivery assets separately.

---

## 18. Blender Bridge Architecture

The Blender Bridge shall expose structured operations instead of arbitrary scripts where possible.

Example operation flow:

```text
MCP request
→ Command or job
→ Blender operation manifest
→ Isolated Blender execution
→ Output inspection
→ Validation
→ Asset registration
→ Canonical Design Document update
```

The bridge shall support:

- Deterministic scene setup
- Version-aware Blender execution
- Input and output manifests
- Script templates
- Resource limits
- Crash handling
- Result validation
- Clean temporary workspaces

Arbitrary code execution shall be restricted and sandboxed.

---

## 19. Animation Architecture

Animation data shall be stored independently of any one runtime library.

The animation model shall describe:

- Timelines
- Tracks
- Keyframes
- Values
- Interpolation
- Easing
- Triggers
- Targets
- Constraints
- Time remapping
- Nested timelines
- Camera sequences
- Lighting animation
- Material animation
- Rig animation

Runtime adapters shall translate canonical animation data into:

- Internal preview runtime
- CSS animations
- Web Animations API
- GSAP
- Framer Motion
- Three.js AnimationMixer
- React Three Fiber control
- Lottie
- Rive
- Video sequences

Unsupported semantics shall be reported rather than silently discarded.

---

## 20. Validation Architecture

Validation shall be a separate subsystem.

It shall not be embedded only inside reconstruction.

Validation services shall support:

- Reference registration
- Render generation
- Metric computation
- Region scoring
- Typography scoring
- Layout scoring
- Asset scoring
- 3D angle scoring
- Difference map generation
- Threshold evaluation
- Regression comparison
- Completion decision

Validation results shall reference:

- Project ID
- Document version
- Renderer version
- Reference version
- Viewport
- Camera
- Quality mode
- Random seed
- Metrics
- Thresholds
- Result status

---

## 21. Autonomous Correction Architecture

Autonomous correction shall use validation output to generate scoped command proposals.

Flow:

```text
Validation report
→ Error ranking
→ Responsible-node mapping
→ Correction proposal
→ Dry-run command transaction
→ Preview render
→ Revalidation
→ Accept or reject
```

The correction system shall not directly overwrite project state.

It shall preserve:

- Proposed changes
- Applied changes
- Rejected changes
- Score changes
- Rollback ability
- Actor identity
- Reasoning metadata safe for audit

---

## 22. Export Architecture

Export shall use pluggable adapters.

Every exporter shall implement a standard contract.

Example conceptual interface:

```ts
interface Exporter {
  id: string;
  target: string;
  analyze(document: CanonicalDocument): ExportCapabilityReport;
  plan(document: CanonicalDocument, options: ExportOptions): ExportPlan;
  generate(plan: ExportPlan): Promise<ExportArtifact>;
  validate(artifact: ExportArtifact): Promise<ExportValidationReport>;
}
```

Export stages shall include:

```text
Capability analysis
→ Export planning
→ Target transformation
→ Code and asset generation
→ Dependency generation
→ Build
→ Render
→ Compare
→ Package
→ Report
```

The system shall not assume every target supports every canonical feature.

Each exporter shall report:

- Native mappings
- Adapted mappings
- Flattened mappings
- Unsupported mappings
- Performance fallbacks
- Accessibility fallbacks
- Validation results

---

## 23. Exporter Plugin Architecture

Exporter plugins shall be discoverable through registration metadata.

Each plugin shall define:

- Exporter ID
- Version
- Target stack
- Supported canonical features
- Required dependencies
- Output structure
- Capability limits
- Validation strategy
- Fallback strategy
- Security permissions

Adding Vue, Svelte, Astro, Babylon.js, or future runtimes shall not require modifying the Canonical Design Document.

---

## 24. MCP Architecture

MCP domains shall map to system capabilities.

Canonical domains include:

```text
reference.*
document.*
reconstruct.*
design.*
typography.*
assets.*
animation.*
three.*
camera.*
lighting.*
materials.*
rigging.*
simulation.*
render.*
compare.*
export.*
```

MCP requests shall follow:

```text
Request
→ Schema validation
→ Permission check
→ Command or job translation
→ Execution
→ Result validation
→ Audit record
→ Response
```

MCP operations shall support:

- Project context
- Document version targeting
- Dry run
- Transactions
- Progress
- Cancellation
- Resource links
- Structured errors

---

## 25. External AI Provider Architecture

External AI capabilities shall use provider adapters.

Possible provider categories:

- Image generation
- Generative fill
- Segmentation
- Upscaling
- OCR
- Font matching
- Texture generation
- 3D generation
- Motion estimation
- Video analysis

Provider adapters shall define:

- Capability
- Input schema
- Output schema
- Cost metadata
- Quality metadata
- Privacy metadata
- Rate limits
- Fallback providers
- Result validation

No provider shall own project state.

Provider output shall be treated as an untrusted proposal until validated and registered.

---

## 26. Deterministic Rendering Architecture

Deterministic renders shall pin:

- Document version
- Asset versions
- Font versions
- Runtime version
- Renderer version
- Browser version
- Viewport
- Device scale factor
- Time
- Animation frame
- Random seed
- Physics state
- Quality profile
- Camera
- Lighting state

The render system shall wait for:

- Fonts
- Images
- Models
- Textures
- Shaders
- Layout stabilization
- Required asynchronous resources

Validation renders shall use controlled environments.

---

## 27. Caching Strategy

Caches may include:

- Parsed font metadata
- Glyph measurements
- Asset derivatives
- Runtime scene projections
- Layout calculations
- Shader compilation
- Model optimization results
- Render outputs
- Validation metrics
- Export dependency caches

Cache keys shall include all values that affect output.

Caches shall be invalidated by:

- Document version changes
- Asset changes
- Font changes
- Renderer changes
- Exporter changes
- Quality profile changes
- Viewport changes

---

## 28. Sandboxing

The system shall sandbox:

- Export builds
- Generated code
- Blender jobs
- External scripts
- Shader compilation where practical
- File conversions
- Untrusted archives
- Third-party plugins

Sandbox controls shall include:

- CPU limits
- Memory limits
- Time limits
- Disk limits
- Network policies
- Filesystem isolation
- Process restrictions
- Output validation

---

## 29. Security Architecture

Security boundaries shall include:

- Workspace isolation
- Project permissions
- MCP permissions
- Command authorization
- Asset access controls
- Signed resource access
- Secret isolation
- Plugin permissions
- Worker identity
- Audit logs
- Sandboxed execution

The system shall validate:

- File types
- File signatures
- Archive contents
- Paths
- URLs
- External commands
- Import limits
- Export contents

---

## 30. Reliability Architecture

Reliability requirements include:

- Autosave
- Versioned documents
- Command logs
- Transaction rollback
- Worker retries
- Checkpointed long jobs
- Idempotent operations where practical
- Crash recovery
- Dead-letter handling
- Partial failure reporting
- Asset integrity verification
- Export verification
- Corruption detection

Maximum Fidelity jobs shall be resumable after interruption.

---

## 31. Concurrency and Collaboration Readiness

The initial system may be single-user per project session, but the architecture shall prepare for future collaboration.

Requirements include:

- Stable node IDs
- Version numbers
- Optimistic concurrency
- Conflict reporting
- Transaction metadata
- Actor identity
- Command timestamps
- Branchable history
- Non-destructive versioning

Full real-time multiplayer is not required initially.

---

## 32. Observability

The system shall expose:

- Structured logs
- Distributed traces
- Metrics
- Job durations
- Queue wait times
- Render durations
- Validation durations
- Export durations
- Memory usage
- GPU usage
- Failure categories
- Retry counts
- Cache hit rates
- Similarity score progression

Every major job shall have a correlation ID.

---

## 33. Performance Architecture

The architecture shall support separate quality profiles.

### Authoring profile

- High editability
- Inspectable layers
- Full metadata
- Moderate optimization

### Maximum Fidelity profile

- Highest analysis quality
- Highest render quality
- Repeated validation
- High-resolution assets
- Full correction loops

### Web delivery profile

- Optimized geometry
- Compressed textures
- Lazy loading
- Progressive loading
- Mobile fallbacks
- Reduced draw calls

### Validation profile

- Deterministic environment
- Fixed viewport
- Fixed random seed
- Pinned dependencies
- Stable timing

Master assets shall never be overwritten by optimized derivatives.

---

## 34. Testing Architecture

Testing shall include:

- Schema tests
- Migration tests
- Command tests
- Transaction tests
- Undo and redo tests
- Renderer unit tests
- Golden-image tests
- Typography tests
- Layout tests
- Asset pipeline tests
- Exporter tests
- Build tests
- Browser tests
- 3D scene tests
- Model validation tests
- Camera tests
- Lighting tests
- MCP contract tests
- Permission tests
- Sandbox tests
- Job recovery tests
- Performance tests

Critical visual features shall use regression baselines.

---

## 35. Development Environment

The recommended development stack is:

- TypeScript
- Node.js
- React
- Next.js
- pnpm
- Turborepo
- Three.js
- React Three Fiber
- WebGL
- Blender
- Supabase Postgres, Auth, and Storage
- Provider-neutral object-storage adapters
- Redis-compatible cache and queue where appropriate
- Playwright
- Vitest
- Containerized workers

Specific versions shall be pinned in implementation files and updated through controlled dependency upgrades.

The architecture shall remain version-independent at the specification level.

---

## 36. Deployment Architecture

The system should support:

- Local development
- Single-machine deployment
- Containerized deployment
- Distributed workers
- GPU workers
- CPU workers
- Storage-backed jobs
- Horizontal scaling

Suggested deployment separation:

```text
Web / Studio
API
MCP Server
Queue
Database
Object Storage
Render Workers
Reconstruction Workers
Asset Workers
Export Workers
Blender Workers
Observability
```

GPU-dependent jobs shall be routable to capable workers.

---

## 37. Local-First and Remote Execution

The system should support a hybrid execution model.

Local execution may be preferred for:

- Sensitive assets
- Blender integration
- Local font access
- Fast previews
- MCP workflows
- Developer iteration

Remote workers may be preferred for:

- Large renders
- GPU reconstruction
- Batch exports
- High-resolution processing
- Maximum Fidelity validation loops

The project format shall remain portable across execution environments.

---

## 38. Failure Handling

Failures shall be classified as:

- Validation error
- Permission error
- Unsupported capability
- Missing dependency
- Corrupt asset
- Worker failure
- Timeout
- Resource limit
- External provider failure
- Build failure
- Render failure
- Export failure
- Version conflict

Errors shall include:

- Machine-readable code
- Human-readable message
- Recoverability
- Suggested action
- Related project ID
- Related job ID
- Related node or asset ID
- Diagnostic reference

---

## 39. Architectural Decision Records

Major decisions shall be recorded as ADRs.

Examples:

- Canonical Design Document format
- Command log strategy
- Database choice
- Object storage choice
- Queue choice
- Renderer selection
- Blender integration method
- Export plugin contract
- MCP permission model
- Deterministic rendering environment
- Collaboration strategy

Approved ADRs shall be referenced from `11_ROADMAP_AND_STATUS.md`.

---

## 40. Architectural Non-Negotiables

The following rules shall not be violated without updating the canonical documentation:

1. One Canonical Design Document is the source of truth.
2. State changes pass through the Command Engine.
3. Original assets remain immutable.
4. Reconstruction produces structured proposals or commands.
5. Validation is independent and measurable.
6. Correction is reversible.
7. Renderers do not own project state.
8. Exporters derive from the Canonical Design Document.
9. Blender is an execution backend, not the canonical store.
10. MCP does not mutate state directly.
11. External AI outputs are validated before acceptance.
12. Expensive workflows use jobs.
13. Untrusted execution is sandboxed.
14. Deterministic rendering is required for validation.
15. 2D and 3D remain first-class systems.
16. New exporter targets do not require redesigning the Canonical Design Document.

---

## 41. Architecture Acceptance Criteria

The architecture shall be considered ready for implementation when:

- Package boundaries are defined
- Dependency rules are enforced
- Canonical Design Document ownership is clear
- Command processing is defined
- Project persistence is defined
- Asset provenance is defined
- Job execution is defined
- 2D rendering responsibilities are defined
- 3D rendering responsibilities are defined
- Blender integration is defined
- Reconstruction stages are defined
- Validation stages are defined
- Autonomous correction is defined
- Export contracts are defined
- MCP boundaries are defined
- Security boundaries are defined
- Testing strategy is defined
- Deployment model is defined
- Failure handling is defined

---

## 42. Final Architecture Statement

The AEVUM AI Reconstruction Engine shall be implemented as a modular, command-driven, MCP-controlled production platform centered on one renderer-independent Canonical Design Document.

Its architecture shall allow professional 2D reconstruction, professional 3D production, animation, cinematography, visual validation, autonomous correction, and Multi-Stack Export to operate as parts of one consistent system rather than disconnected tools.
