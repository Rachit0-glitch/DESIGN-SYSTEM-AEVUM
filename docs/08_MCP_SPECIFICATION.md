# AEVUM AI Reconstruction Engine — MCP Specification

## 1. Purpose

This document defines the Model Context Protocol integration for the AEVUM AI Reconstruction Engine.

It is authoritative for:

- MCP server responsibilities
- MCP domains
- Tool naming
- Tool schemas
- Resource schemas
- Prompt resources
- Authentication
- Authorization
- Permissions
- Transactions
- Dry runs
- Jobs
- Progress
- Cancellation
- Structured errors
- Idempotency
- Version negotiation
- Project context
- 2D design control
- Typography control
- Asset control
- Animation control
- 3D control
- Camera control
- Lighting control
- Material control
- Rigging control
- Simulation control
- Rendering
- Validation
- Export
- Auditability
- Security
- Testing

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`
- `03_DESIGN_DOCUMENT_MODEL.md`
- `04_RECONSTRUCTION_PIPELINE.md`
- `05_TYPOGRAPHY_AND_ASSETS.md`
- `06_ANIMATION_AND_RENDERING.md`
- `07_3D_ENGINE_AND_CINEMATICS.md`

MCP shall be the primary AI control interface.

The MCP server shall not become an alternate source of project state.

All state-changing operations shall pass through the Command Engine or Job System.

### Phase 12 Implemented Foundation

Protocol version `1.0.0` is implemented by `packages/mcp-protocol`. The production service in `apps/mcp-server`
provides strict HTTP JSON envelopes, signed Supabase JWT verification, database-backed workspace membership and
permission resolution, twelve typed tools, dry runs, optimistic concurrency, persistent idempotency, atomic canonical
document/version/audit commits, structured errors, explicit CORS, bounded payloads, timeouts, health/readiness/version
routes, secret-safe structured logs, and graceful shutdown.

Phase 12 write tools are `document.rename`, `node.create`, `node.update`, and `node.delete`. Each compiles to one typed
Command Engine transaction; no generic command execution endpoint exists. Read tools are `system.get_capabilities`,
`project.get`, `document.get`, `document.get_version`, `document.list_versions`, `document.inspect_hierarchy`,
`asset.get`, and `timeline.get`.

Transaction, job-progress, and cancellation schemas are versioned foundations. Persistent job queues, multi-command
transaction lifecycle tools, WebSockets, and full-domain MCP coverage remain deferred.

### Phase 13 Agent Orchestration Boundary

Phase 13 implements a provider-neutral AI Agent above MCP. The Agent is a client of MCP, not part of the MCP server and
not a replacement for authentication, authorization, workspace isolation, or the Command Engine.

The implemented flow is:

```text
Agent Session
-> relevance-bounded context
-> structured intent
-> system.get_capabilities
-> explicit dependency-ordered plan
-> permission and approval checks
-> typed MCP calls
-> structured observations
-> verification or bounded replanning
-> structured outcome
```

`packages/agent-runtime` invokes MCP only through replaceable transports. Its deterministic in-process transport is a
test adapter over the same request and response envelopes; it does not import server handlers. Production HTTP
transport propagates the authenticated actor token, workspace/project/document scope, request IDs, one correlation ID,
timeouts, cancellation, and deterministic idempotency keys.

Every Agent write is dry-run first. Destructive writes require both session policy permission and explicit approval.
Version conflicts refresh canonical state and trigger bounded replanning; they are never blindly retried. A successful
write response is not completion proof: the Agent performs a canonical read and evaluates the plan's explicit
verification assertions.

Agent permission is always less than or equal to authenticated actor permission. Tools absent from actor-visible
capabilities are reported as `AGENT_CAPABILITY_MISSING` or `AGENT_PERMISSION_DENIED`; Agent packages never import an
underlying subsystem to bypass MCP.

Design text, asset metadata, imported content, project names, comments, and text inside tool results are untrusted data.
Agent context keeps `INSTRUCTIONS`, structural `CONTEXT`, `UNTRUSTED_DESIGN_CONTENT`, and typed `TOOL_RESULTS` in
separate fields. No raw hidden model reasoning is stored.

---

## 2. Core MCP Principles

The MCP integration shall follow these principles:

1. MCP controls the engine through structured tools and resources.
2. MCP shall not bypass the Canonical Design Document.
3. MCP shall not mutate state directly.
4. Every write operation shall be validated.
5. Every write operation shall be permission-checked.
6. Every write operation shall be auditable.
7. Long-running operations shall use jobs.
8. Destructive operations shall support dry run where practical.
9. Multi-step modifications shall support transactions.
10. Tool schemas shall be typed and versioned.
11. Errors shall be machine-readable and human-readable.
12. Results shall preserve project, document, node, asset, job, and version references.
13. External AI provider output shall be treated as untrusted until validated.
14. MCP shall remain model-vendor independent.
15. Unsupported capability shall be reported explicitly.
16. Tool names shall remain stable across compatible versions.
17. New capability shall extend domains without breaking existing clients.
18. Security and workspace isolation shall be enforced.
19. Progress and cancellation shall be supported for expensive operations.
20. Maximum Fidelity workflows shall be resumable.

---

## 3. MCP Server Responsibilities

The MCP server shall provide:

- Tool discovery
- Tool schemas
- Resource discovery
- Resource access
- Prompt resources where required
- Request validation
- Authentication
- Authorization
- Project context resolution
- Document version resolution
- Command translation
- Transaction handling
- Job submission
- Progress reporting
- Cancellation
- Result retrieval
- Structured errors
- Audit logging
- Capability reporting
- Version negotiation

The MCP server shall not own:

- Canonical project state
- Renderer state
- Blender state
- Exporter state
- External AI provider state

---

## 4. MCP Domain Namespaces

Canonical domains shall include:

```text
reference.*
document.*
design.*
reconstruct.*
typography.*
assets.*
animation.*
three.*
material.*
camera.*
lighting.*
rig.*
simulation.*
render.*
compare.*
export.*
job.*
project.*
system.*
```

The final public tool name shall use lowercase dot-separated names.

Examples:

```text
document.get
design.create_node
three.import_model
camera.create_path
render.render_frame
export.nextjs
```

---

## 5. Tool Naming Rules

Tool names shall:

- Use lowercase
- Use dot-separated domain names
- Use action-oriented verbs
- Avoid target runtime names unless the tool is exporter-specific
- Remain stable
- Avoid abbreviations unless standard
- Avoid overloaded meanings

Preferred verbs include:

```text
create
get
list
inspect
update
delete
import
generate
match
validate
compare
render
export
optimize
bind
bake
cancel
preview
apply
```

---

## 6. Common Request Envelope

Every tool request should support common context where relevant.

```ts
interface McpRequestContext {
  workspaceId: string;
  projectId?: string;
  documentId?: string;
  documentVersion?: number;
  transactionId?: string;
  actor?: ActorRef;
  dryRun?: boolean;
  idempotencyKey?: string;
  qualityMode?: QualityMode;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}
```

Not every field is required for every tool.

---

## 7. Common Response Envelope

```ts
interface McpResponse<T> {
  success: boolean;
  requestId: string;
  data?: T;
  warnings?: McpWarning[];
  errors?: McpError[];
  projectId?: string;
  documentId?: string;
  documentVersion?: number;
  transactionId?: string;
  jobId?: string;
  auditId?: string;
  capabilities?: CapabilityReport;
}
```

Responses shall never return ambiguous unstructured error strings as the only failure information.

---

## 8. Authentication

The MCP server shall support authenticated clients.

Authentication may use:

- Local trusted transport
- Session token
- Workspace token
- OAuth-backed token
- Signed client identity
- Future enterprise identity providers

Authentication shall resolve:

- Actor ID
- Actor type
- Workspace
- Roles
- Permissions
- Token expiry
- Client identity

---

## 9. Authorization

Authorization shall be checked per tool and per resource.

Permission scopes may include:

```text
project.read
project.write
document.read
document.write
asset.read
asset.write
render.execute
export.execute
three.write
camera.write
lighting.write
rig.write
simulation.execute
system.admin
```

Fine-grained scopes may be added.

---

## 10. Workspace Isolation

Every request shall be scoped to a workspace.

The system shall prevent:

- Cross-workspace project access
- Cross-workspace asset access
- Cross-workspace job access
- Cross-workspace export access
- Cross-workspace resource enumeration

---

## 11. Project Context

MCP tools shall support explicit project context.

When omitted, context may be resolved only when:

- One active project is unambiguous
- The client has an established session context
- The operation is read-only and safe

Write operations should require explicit project identification unless the client session guarantees an unambiguous project.

---

## 12. Document Version Targeting

Write operations shall target a known document version.

The server shall support:

- Exact version requirement
- Latest version resolution
- Optimistic concurrency
- Conflict reporting
- Transaction version pinning

Example conflict:

```json
{
  "code": "DOCUMENT_VERSION_CONFLICT",
  "message": "The document changed after the requested version.",
  "expectedVersion": 18,
  "currentVersion": 21,
  "recoverable": true
}
```

---

## 13. Dry Run

Applicable write tools shall support `dryRun`.

A dry run shall:

- Validate permissions
- Validate schemas
- Resolve references
- Simulate commands
- Report expected changes
- Report conflicts
- Report affected nodes and assets
- Report estimated job cost where practical
- Avoid persisted state changes

---

## 14. Transactions

The MCP server shall support transactions for multi-command operations.

Transaction tools shall include:

```text
document.begin_transaction
document.commit_transaction
document.rollback_transaction
document.inspect_transaction
```

A transaction shall include:

- Transaction ID
- Project ID
- Base document version
- Actor
- Commands
- Validation result
- Status
- Expiry
- Created time

---

## 15. Atomicity

Transaction commit shall be atomic.

If one command fails:

- The transaction shall fail
- No partial document version shall be persisted
- The response shall identify the failed command
- The transaction may remain inspectable
- The client may correct and retry

---

## 16. Idempotency

Write tools should support idempotency keys where practical.

Idempotency shall prevent duplicate creation caused by retries.

The system shall preserve:

- Request hash
- Result
- Expiry
- Actor
- Project
- Tool name

---

## 17. Jobs

Long-running operations shall return jobs.

Job domains include:

```text
job.get
job.list
job.cancel
job.retry
job.get_result
job.get_logs
job.get_progress
```

Examples of job-based operations:

- Reconstruction
- High-resolution render
- Multi-angle validation
- Texture generation
- Retopology
- UV unwrap
- Rigging
- Simulation
- Blender execution
- Export build
- Code-render validation

---

## 18. Job Status

```ts
type JobStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";
```

A job shall expose:

- Job ID
- Type
- Status
- Progress
- Stage
- Start time
- Update time
- Estimated work units
- Completed work units
- Checkpoint
- Warnings
- Errors
- Result references

---

## 19. Progress Reporting

Progress shall report meaningful stages.

Example:

```json
{
  "jobId": "job_01",
  "status": "RUNNING",
  "stage": "MULTI_VIEW_VALIDATION",
  "progress": 0.64,
  "message": "Comparing side and back reference views.",
  "completedUnits": 16,
  "totalUnits": 25
}
```

The server shall avoid false precision.

---

## 20. Cancellation

Cancelable jobs shall support:

```text
job.cancel
```

Cancellation shall:

- Stop new work
- Preserve completed checkpoints
- Preserve generated intermediate assets when configured
- Report cancellation status
- Avoid corrupting project state

---

## 21. Resource Model

MCP resources may expose:

- Project summaries
- Document versions
- Node trees
- Asset manifests
- Validation reports
- Export reports
- Job logs
- Render outputs
- Difference maps
- Scene statistics
- Capability reports
- Tool documentation

Resources shall be read-only unless changed through tools.

---

## 22. Resource URI Patterns

Recommended resource patterns:

```text
aevum://workspace/{workspaceId}
aevum://project/{projectId}
aevum://project/{projectId}/document/{documentId}
aevum://project/{projectId}/document/{documentId}/version/{version}
aevum://project/{projectId}/node/{nodeId}
aevum://project/{projectId}/asset/{assetId}
aevum://project/{projectId}/validation/{validationId}
aevum://project/{projectId}/export/{exportId}
aevum://job/{jobId}
```

---

## 23. Prompt Resources

Prompt resources may provide stable operational instructions for:

- Reconstruction
- Typography matching
- 3D refinement
- Camera creation
- Lighting matching
- Validation
- Export review

Prompt resources shall not contain hidden project state.

They shall be versioned and inspectable.

---

## 24. Capability Discovery

The system shall support:

```text
system.get_capabilities
system.get_versions
system.get_limits
system.get_exporters
system.get_renderers
system.get_providers
```

Capability reports shall include:

- Available domains
- Available tools
- Tool versions
- Supported formats
- Export targets
- Provider availability
- GPU availability
- Blender availability
- Maximum file sizes
- Quality modes
- Sandbox limits

---

## 25. Version Negotiation

The MCP server shall expose:

- MCP contract version
- Tool schema versions
- Canonical Design Document schema version
- Renderer versions
- Exporter versions
- Blender Bridge version

Incompatible clients shall receive explicit errors.

---

## 26. Project Tools

Project tools shall include:

```text
project.create
project.get
project.list
project.update
project.archive
project.get_status
project.get_summary
```

### `project.create`

Creates a project with:

- Title
- Description
- Quality mode
- Default viewport
- Supported viewports
- Color space
- Unit system

### `project.get_summary`

Returns:

- Current document version
- Node count
- Asset count
- Scene count
- Timeline count
- Validation status
- Export status
- Open jobs
- Known blockers

---

## 27. Document Tools

Document tools shall include:

```text
document.create
document.get
document.get_version
document.list_versions
document.diff_versions
document.validate_structure
document.begin_transaction
document.commit_transaction
document.rollback_transaction
document.apply_commands
document.undo
document.redo
```

---

## 28. `document.apply_commands`

This tool shall apply one or more structured commands.

Example request:

```json
{
  "context": {
    "workspaceId": "workspace_01",
    "projectId": "project_01",
    "documentId": "doc_01",
    "documentVersion": 12
  },
  "commands": [
    {
      "type": "node.update",
      "targetId": "node_hero",
      "payload": {
        "opacity": 0.9
      }
    }
  ]
}
```

The tool shall return:

- New document version
- Command results
- Warnings
- Validation summary
- Audit ID

---

## 29. Design Tools

Design tools shall include:

```text
design.create_node
design.update_node
design.delete_node
design.reparent_node
design.duplicate_node
design.group_nodes
design.ungroup_nodes
design.set_layout
design.set_constraints
design.set_responsive_override
design.create_component
design.create_instance
design.create_token
design.apply_token
design.inspect_hierarchy
```

---

## 30. Node Creation

`design.create_node` shall require:

- Parent ID or root placement
- Node type
- Name
- Initial properties
- Optional source links
- Optional export metadata

The server shall validate the payload against the requested node type.

---

## 31. Node Updates

`design.update_node` shall:

- Accept partial updates
- Validate property paths
- Reject unknown fields
- Preserve unspecified values
- Support dry run
- Support transactions
- Return affected dependencies

---

## 32. Layout Tools

Layout operations shall include:

```text
design.set_layout
design.infer_layout
design.set_constraints
design.infer_constraints
design.create_breakpoint
design.set_responsive_override
design.generate_mobile_variant
```

Inference tools shall return proposals or jobs.

---

## 33. Reference Tools

Reference tools shall include:

```text
reference.import
reference.get
reference.list
reference.annotate_region
reference.set_role
reference.set_priority
reference.group_views
reference.inspect
reference.remove
```

Reference removal shall not delete the underlying original asset without explicit asset deletion permission.

---

## 34. Reconstruction Tools

Reconstruction tools shall include:

```text
reconstruct.analyze
reconstruct.create_proposal
reconstruct.apply_proposal
reconstruct.reconstruct_2d
reconstruct.reconstruct_responsive
reconstruct.reconstruct_motion
reconstruct.reconstruct_3d
reconstruct.refine
reconstruct.get_report
reconstruct.cancel
```

Most reconstruction tools shall return jobs.

---

## 35. Reconstruction Proposal Tools

```text
reconstruct.get_proposal
reconstruct.inspect_proposal
reconstruct.apply_proposal
reconstruct.reject_proposal
reconstruct.modify_proposal
```

A proposal shall remain inspectable before application.

---

## 36. Typography Tools

Typography tools shall include:

```text
typography.import_font
typography.inspect_font
typography.list_fonts
typography.match_font
typography.measure_text
typography.set_style
typography.update_run
typography.set_variable_axes
typography.set_open_type_features
typography.convert_to_vector
typography.validate
```

---

## 37. `typography.match_font`

The tool shall accept:

- Text node or reference region
- Candidate font scope
- Exact-font requirement
- Quality mode
- Language
- Character sample
- Optional uploaded fonts

The result shall include:

- Ranked candidates
- Match status
- Confidence
- Metric differences
- Render comparison
- Recommended corrections

---

## 38. Asset Tools

Asset tools shall include:

```text
assets.import
assets.get
assets.list
assets.inspect
assets.create_derivative
assets.segment
assets.remove_background
assets.extract_object
assets.remove_object
assets.generate_fill
assets.generate_mask
assets.generate_depth
assets.generate_normal
assets.generate_height
assets.generate_pbr_maps
assets.vectorize
assets.optimize
assets.create_responsive_variants
assets.validate
assets.attach_license
```

---

## 39. Asset Import

`assets.import` shall support:

- File reference
- Source URL where permitted
- Asset type hint
- License metadata
- Provenance metadata
- Duplicate policy
- Processing profile

The result shall include:

- Asset ID
- Hash
- Metadata
- Duplicate status
- Validation status

---

## 40. Animation Tools

Animation tools shall include:

```text
animation.create_timeline
animation.update_timeline
animation.delete_timeline
animation.create_track
animation.update_track
animation.delete_track
animation.add_keyframe
animation.update_keyframe
animation.remove_keyframe
animation.set_easing
animation.set_trigger
animation.bind_timeline
animation.create_state_machine
animation.preview
animation.bake
animation.validate
```

---

## 41. Timeline Preview

`animation.preview` shall support:

- Timeline ID
- Start time
- End time
- Viewport
- Camera
- Quality mode
- Output type
- Reduced-motion state

The result may return a render job.

---

## 42. 3D Domain

The canonical 3D domain shall use `three.*`.

Tools shall include:

```text
three.import_model
three.inspect_scene
three.generate_model
three.create_scene
three.create_model
three.create_mesh
three.modify_mesh
three.separate_mesh
three.join_meshes
three.retopologize
three.remesh
three.decimate
three.unwrap_uv
three.generate_lods
three.optimize_model
three.validate_topology
three.validate_uvs
three.set_scale
three.set_pivot
three.set_orientation
three.export_working_asset
```

---

## 43. `three.import_model`

The tool shall accept:

- Model asset
- Import format
- Unit override
- Axis override
- Preserve hierarchy
- Import cameras
- Import lights
- Import animation
- Quality mode

The result shall include:

- Scene proposal
- Mesh statistics
- Material statistics
- Texture statistics
- Rig statistics
- Animation statistics
- Diagnostics
- Missing dependencies

---

## 44. `three.generate_model`

The tool shall accept:

- Text prompt
- Reference IDs
- View roles
- Target category
- Real-world scale
- Multi-mesh requirement
- Topology target
- Rigging target
- Quality mode
- Provider policy

The output shall remain a proposal until validated.

---

## 45. Mesh Modification

`three.modify_mesh` shall support structured operations such as:

- Transform vertices
- Extrude
- Inset
- Bevel
- Subdivide
- Solidify
- Boolean
- Smooth
- Correct normals
- Correct tangents
- Separate
- Join
- Set pivot

Arbitrary scripts shall not be the default interface.

---

## 46. Material Tools

Material tools shall use the canonical `material.*` domain.

```text
material.create
material.get
material.update
material.apply
material.duplicate
material.match_reference
material.generate_textures
material.assign_texture
material.create_shader
material.validate
```

---

## 47. Camera Tools

Camera tools shall include:

```text
camera.create
camera.get
camera.list
camera.set_properties
camera.match_reference
camera.create_path
camera.update_path
camera.add_keyframes
camera.track_object
camera.set_target
camera.auto_frame
camera.preview_shot
camera.create_sequence
camera.validate
```

---

## 48. `camera.create_path`

The tool shall accept:

- Camera ID
- Path type
- Control points
- Look-at targets
- Banking
- Speed profile
- Collision avoidance
- Framing policy
- Duration
- Easing

---

## 49. Lighting Tools

Lighting tools shall include:

```text
lighting.create
lighting.get
lighting.list
lighting.update
lighting.match_reference
lighting.create_rig
lighting.apply_preset
lighting.bake
lighting.validate
```

---

## 50. Rigging Tools

Rigging tools shall use `rig.*`.

```text
rig.create
rig.inspect
rig.bind
rig.auto_weight
rig.correct_weights
rig.create_ik
rig.create_fk
rig.set_constraints
rig.create_face_controls
rig.retarget_animation
rig.test_deformation
rig.validate
```

---

## 51. Simulation Tools

Simulation tools shall include:

```text
simulation.create
simulation.configure
simulation.add_collider
simulation.add_force
simulation.preview
simulation.bake
simulation.reset
simulation.validate
```

Simulation types may include:

- Rigid body
- Soft body
- Cloth
- Hair
- Rope
- Particle
- Fluid
- Smoke
- Fire
- Destruction

---

## 52. Rendering Tools

Rendering tools shall include:

```text
render.preview
render.render_frame
render.render_region
render.render_layer
render.render_sequence
render.render_turntable
render.render_camera_shot
render.render_validation_pass
render.inspect_performance
render.cancel
```

---

## 53. `render.render_frame`

The tool shall accept:

- Document version
- Viewport
- Camera
- Timeline
- Time or frame
- Render mode
- Quality mode
- Passes
- Output format
- Deterministic seed

The response shall return:

- Job ID or immediate render
- Output asset IDs
- Render metadata
- Warnings
- Performance data

---

## 54. Render Passes

Supported passes may include:

- Beauty
- Alpha
- Depth
- Normals
- Object ID
- Layer ID
- Material ID
- Motion vectors
- Shadow
- Reflection
- Typography
- Edge
- Mask

---

## 55. Comparison Tools

Comparison tools shall include:

```text
compare.compare_2d_render
compare.compare_typography
compare.compare_layout
compare.compare_assets
compare.compare_3d_render
compare.compare_reference_angles
compare.compare_turntable
compare.generate_heatmap
compare.get_report
```

---

## 56. `compare.compare_2d_render`

The tool shall accept:

- Reference ID
- Render asset ID or render configuration
- Region
- Metric set
- Thresholds
- Weighting
- Output heatmap preference

The result shall include:

- Overall score
- Layout score
- Typography score
- Color score
- Asset score
- Region scores
- Issues
- Difference assets

---

## 57. `compare.compare_reference_angles`

The tool shall accept:

- Model ID
- Reference view IDs
- Camera matching policy
- Lighting policy
- Metric weights
- Quality mode

The result shall include per-view and aggregate scores.

---

## 58. Export Tools

Export tools shall include:

```text
export.analyze
export.plan
export.generate
export.validate
export.get_report
export.html_css
export.react
export.nextjs
export.tailwind
export.threejs
export.react_three_fiber
export.glb
export.gltf
export.lottie
export.rive
export.canva
```

Exporter-specific tools may wrap the generic export pipeline.

---

## 59. Export Analysis

`export.analyze` shall return:

- Native mappings
- Adapted mappings
- Flattened mappings
- Unsupported mappings
- Dependency requirements
- Performance risks
- Accessibility risks
- Editability estimate
- Fallback plan

---

## 60. Export Generation

`export.generate` shall accept:

- Exporter ID
- Document version
- Target options
- Viewports
- Quality profile
- Asset policy
- Build verification
- Render verification
- Packaging format

The result shall return a job.

---

## 61. Canva Export Tool

`export.canva` shall support:

- Target page sizes
- Native text preference
- Native vector preference
- Separate shadow layers
- Separate glow layers
- 3D render strategy
- Multiple camera pages
- Flattening policy
- Editability reporting

---

## 62. Export Validation

`export.validate` shall support:

- Build
- Launch
- Render
- Compare
- Accessibility checks
- Performance checks
- Asset checks
- Runtime error checks

Compilation alone shall not count as successful validation.

---

## 63. System Tools

System tools shall include:

```text
system.get_capabilities
system.get_versions
system.get_limits
system.get_health
system.get_exporters
system.get_renderers
system.get_providers
system.get_quality_modes
```

---

## 64. Structured Errors

```ts
interface McpError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  retryable?: boolean;
  suggestedAction?: string;
  projectId?: string;
  documentId?: string;
  documentVersion?: number;
  nodeId?: string;
  assetId?: string;
  jobId?: string;
}
```

---

## 65. Error Categories

Canonical error categories shall include:

```text
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
WORKSPACE_ACCESS_DENIED
PROJECT_NOT_FOUND
DOCUMENT_NOT_FOUND
DOCUMENT_VERSION_CONFLICT
SCHEMA_VALIDATION_ERROR
COMMAND_VALIDATION_ERROR
TRANSACTION_FAILED
ASSET_NOT_FOUND
ASSET_CORRUPT
FORMAT_UNSUPPORTED
CAPABILITY_UNSUPPORTED
PROVIDER_UNAVAILABLE
JOB_FAILED
JOB_CANCELLED
RENDER_FAILED
VALIDATION_FAILED
EXPORT_FAILED
RESOURCE_LIMIT_EXCEEDED
SANDBOX_VIOLATION
BLENDER_BRIDGE_ERROR
INTERNAL_ERROR
```

---

## 66. Warnings

Warnings shall be structured.

Examples:

- Font substitution used
- Effect flattened
- Mobile fallback generated
- Model decimated
- Simulation baked
- Camera estimate low confidence
- Lighting estimate low confidence
- Canva editability reduced
- Export adapter approximation used

---

## 67. Audit Logging

Every write operation shall create an audit record.

The record shall include:

- Audit ID
- Actor
- Tool name
- Request ID
- Project ID
- Document ID
- Base version
- Resulting version
- Transaction ID
- Job ID
- Command IDs
- Timestamp
- Status
- Warnings
- Failure code

---

## 68. Security

The MCP server shall enforce:

- Authentication
- Authorization
- Workspace isolation
- Project permissions
- Tool permissions
- File validation
- URL validation
- Sandbox boundaries
- Secret isolation
- Rate limits
- Resource limits
- Audit logging

---

## 69. External Tool Safety

External execution such as Blender shall require:

- Approved operation manifest
- Sandbox
- Time limits
- Memory limits
- File limits
- Network restrictions
- Output validation
- Version pinning
- Audit logging

Arbitrary unrestricted code execution shall not be exposed as a normal MCP tool.

---

## 70. Rate Limits

Rate limits may apply by:

- Workspace
- Actor
- Tool
- Job class
- Provider
- GPU usage
- Storage usage

Rate-limit errors shall include reset or recovery information where available.

---

## 71. Resource Limits

Limits may include:

- Max asset size
- Max archive size
- Max texture size
- Max scene complexity
- Max job duration
- Max concurrent jobs
- Max render resolution
- Max frame count
- Max simulation duration
- Max export size

Limits shall be discoverable through `system.get_limits`.

---

## 72. Privacy and Provider Use

When external providers are used, results shall report:

- Provider name
- Capability
- Data category sent
- Region where known
- Retention policy where known
- Cost metadata where available
- Output asset IDs
- Validation status

Provider use shall be configurable.

---

## 73. Tool Result Resources

Large results shall be returned as resources rather than oversized inline payloads.

Examples:

- Validation reports
- Render sequences
- Difference maps
- Export archives
- Scene diagnostics
- Job logs
- Reconstruction proposals

---

## 74. Pagination

List tools shall support:

- Page size
- Cursor
- Sort
- Filter

Examples:

```text
project.list
assets.list
job.list
camera.list
lighting.list
document.list_versions
```

---

## 75. Filtering

Filters may support:

- Type
- Status
- Tag
- Created time
- Modified time
- Actor
- Validation status
- Export status
- Asset type
- Node type

---

## 76. Tool Schema Requirements

Every tool schema shall define:

- Required fields
- Optional fields
- Allowed values
- Units
- Ranges
- Defaults
- Nullability
- References
- Error cases
- Example request
- Example response

Runtime validation shall enforce the schemas.

---

## 77. Units

Tools shall never accept ambiguous units.

Examples:

- Pixels
- Degrees
- Radians
- Seconds
- Frames
- Meters
- Centimeters
- Percent
- Normalized 0–1 values

The unit shall be explicit in schema or field name.

---

## 78. Coordinate Systems

3D tool schemas shall specify:

- Local
- Parent
- World
- Camera
- Screen
- Viewport

Coordinate ambiguity shall be rejected.

---

## 79. Color Values

Color values shall include:

- Value
- Color space
- Alpha

Example:

```json
{
  "r": 0.4,
  "g": 0.1,
  "b": 0.8,
  "a": 1,
  "colorSpace": "SRGB"
}
```

---

## 80. File and Asset References

Tools shall use asset IDs for registered content.

Direct file paths shall only be accepted through controlled import operations.

The Canonical Design Document shall not store arbitrary local paths.

---

## 81. Provider Adapters

Provider-dependent tools shall expose policy rather than hard-coding one provider.

Example:

```json
{
  "providerPolicy": {
    "preferred": ["provider_a"],
    "fallbackAllowed": true,
    "maxCost": 10,
    "privacyMode": "RESTRICTED"
  }
}
```

---

## 82. Confidence Reporting

Inference tools shall return confidence values between 0 and 1.

Confidence shall not be confused with validation score.

Examples:

- Font identity confidence
- Camera estimate confidence
- Layout inference confidence
- Material estimate confidence
- Rig estimate confidence

---

## 83. Completion Reporting

Tools shall report:

- Structural completion
- Validation completion
- Export readiness
- Remaining issues
- Applied fallbacks
- Unsupported capabilities

A successful API call shall not imply the reconstruction itself is complete.

---

## 84. MCP Client Workflow

Recommended workflow:

```text
system.get_capabilities
-> project.get
-> inspect only relevant canonical resources
-> create an explicit permission-aware plan
-> dry-run writes
-> commit with expected version and idempotency
-> inspect structured observations
-> read canonical result
-> verify completion criteria
-> replan within bounded budgets or complete
```

---

## 85. Reconstruction Workflow Example

```text
reference.import
→ reference.group_views
→ reconstruct.analyze
→ reconstruct.create_proposal
→ reconstruct.inspect_proposal
→ reconstruct.apply_proposal
→ render.render_validation_pass
→ compare.compare_reference_angles
→ reconstruct.refine
→ export.react_three_fiber
```

---

## 86. 2D Workflow Example

```text
reference.import
→ reconstruct.reconstruct_2d
→ typography.match_font
→ design.infer_layout
→ design.generate_mobile_variant
→ render.render_frame
→ compare.compare_2d_render
→ reconstruct.refine
→ export.nextjs
→ export.validate
```

---

## 87. Cinematic Workflow Example

```text
three.import_model
→ material.match_reference
→ lighting.match_reference
→ camera.match_reference
→ camera.create_path
→ camera.create_sequence
→ animation.bind_timeline
→ render.render_sequence
→ compare.compare_3d_render
→ export.react_three_fiber
```

---

## 88. Testing Requirements

MCP testing shall include:

- Tool discovery tests
- Schema validation tests
- Authentication tests
- Permission tests
- Workspace isolation tests
- Version conflict tests
- Transaction tests
- Dry-run tests
- Idempotency tests
- Job tests
- Progress tests
- Cancellation tests
- Structured error tests
- Resource tests
- Export tests
- 2D workflow tests
- 3D workflow tests
- Blender Bridge tests
- Provider adapter tests
- Security tests
- Backward compatibility tests

---

## 89. Compatibility Policy

A tool change is breaking when it:

- Removes a field
- Changes field meaning
- Changes unit
- Changes default behaviour materially
- Changes response shape
- Changes error semantics
- Removes a tool
- Changes permission scope incompatibly

Breaking changes shall require a versioned tool or protocol update.

---

## 90. Deprecation Policy

Deprecated tools shall:

- Remain available for a defined period
- Return deprecation warnings
- Identify replacement tools
- Preserve documentation
- Avoid silent removal

---

## 91. MCP Acceptance Criteria

The MCP system shall be implementation-ready when it can:

- Authenticate clients
- Enforce permissions
- Isolate workspaces
- Discover capabilities
- Read projects and documents
- Apply structured commands
- Run transactions
- Submit long jobs
- Report progress
- Cancel jobs
- Control 2D design
- Control typography
- Control assets
- Control animation
- Control 3D scenes
- Control cameras
- Control lighting
- Control materials
- Control rigs
- Control simulations
- Render
- Compare
- Export
- Return structured errors
- Create audit records
- Preserve version compatibility

---

## 92. Final MCP Statement

MCP is the primary AI control layer of the AEVUM AI Reconstruction Engine.

It shall expose the full 2D, 3D, animation, rendering, validation, and export capabilities of the system through typed, permissioned, auditable, transactional, versioned, and model-vendor-independent tools while preserving the Canonical Design Document and Command Engine as the only authoritative state path.

---

## 93. Phase 14 3D MCP Capability Surface

MCP tool version `1.1.0` adds three bounded capabilities:

- `three.inspect_asset` reads one registered GLB/GLTF and lists canonical imported scene, node, primitive, material,
  camera, and light identities by source provenance.
- `three.inspect_scene` regenerates a responsive Scene Runtime 3D projection and deterministic Render Plan metadata,
  including bounds, active camera, entities, diagnostics, and fingerprints.
- `three.update_node_transform` validates a full canonical local transform in meters and compiles it to the existing
  versioned `node.update` Command Engine path. It supports dry-run and idempotent commit.

The tools use `three.read` and `three.write` permissions together with asset/document permissions. Existing JWT
authentication, workspace/project isolation, payload bounds, rate limits, audit, optimistic version checks, locked-node
handling, idempotency, and atomic persistence remain mandatory. MCP never receives arbitrary filesystem paths, owns
raw 3D state, writes renderer objects, or calls Blender.
