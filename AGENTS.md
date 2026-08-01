# AEVUM AI Reconstruction Engine - Repository Constitution

## Official Product Identity

The official product name is **AEVUM AI Reconstruction Engine**.

AEVUM AI Reconstruction Engine is an AI-controlled visual reconstruction and production engine. It is not primarily a manual design editor, screenshot-to-code generator, ordinary website builder, image generator, or basic 3D tool.

The engine must convert references into editable 2D layers, responsive production code, reusable components and tokens, complex timelines, professional 3D models and scenes, controlled cameras, cinematic sequences, Canva-compatible outputs, and measurable validation reports.

## Mandatory Codex Reading Order

Before every task, read:

1. `AGENTS.md`
2. `docs/00_PROJECT_CONTEXT.md`
3. `docs/01_PRODUCT_REQUIREMENTS.md`
4. `docs/11_ROADMAP_AND_STATUS.md`
5. Only the technical documents relevant to the current task

Do not load every large specification unnecessarily on routine tasks. Read focused technical specs after the required files.

## Documentation Hierarchy

The canonical documentation set is:

- `docs/00_PROJECT_CONTEXT.md`
- `docs/01_PRODUCT_REQUIREMENTS.md`
- `docs/02_SYSTEM_ARCHITECTURE.md`
- `docs/03_DESIGN_DOCUMENT_MODEL.md`
- `docs/04_RECONSTRUCTION_PIPELINE.md`
- `docs/05_TYPOGRAPHY_AND_ASSETS.md`
- `docs/06_ANIMATION_AND_RENDERING.md`
- `docs/07_3D_ENGINE_AND_CINEMATICS.md`
- `docs/08_MCP_SPECIFICATION.md`
- `docs/09_VISUAL_VALIDATION.md`
- `docs/10_EXPORT_SYSTEM.md`
- `docs/11_ROADMAP_AND_STATUS.md`

Architecture Decision Records belong under `docs/adr/` and should be created only when a genuine architectural decision is made.

Do not replace the canonical docs with many fragmented files. Additional docs may explain implementation details, but they must not contradict the canonical set.

## Canonical Terminology

Use these terms consistently:

- AEVUM AI Reconstruction Engine
- Maximum Fidelity
- Canonical Design Document
- MCP
- Hybrid 2D Renderer
- 3D Engine
- Reconstruction Pipeline
- Visual Validation
- Autonomous Correction Loop
- Multi-Stack Export
- Canva Export
- Command Engine

Do not introduce alternate product names or abbreviations that weaken these meanings.

## Source-of-Truth Rules

- The Canonical Design Document is the source of truth for 2D, 3D, typography, assets, components, responsive overrides, timelines, interactions, cameras, lighting, materials, rigging, physics metadata, validation metadata, and export metadata.
- Do not create separate unrelated project representations for React, Three.js, Canva, validation, or internal rendering.
- Renderers, exporters, validation systems, Studio, MCP, and workers may create runtime projections or caches only when they are regenerable from the Canonical Design Document and registered assets.
- Original assets are immutable. Processing creates traceable derivatives.
- External AI provider output is an untrusted proposal until validated and registered.

## Architectural Non-Negotiables

- All meaningful state changes must pass through the Command Engine.
- MCP must translate requests into commands or jobs; it must not mutate canonical state directly.
- Reconstruction must produce proposals and commands, not uncontrolled document mutations.
- Validation must measure and report; it must not mutate state.
- Correction must be reversible, scoped, auditable, and command-driven.
- Renderers do not own project state.
- Exporters derive from the Canonical Design Document and must report unsupported, adapted, or flattened output.
- Blender Bridge is an execution backend, not a canonical store.
- 2D and 3D are both first-class systems.
- Maximum Fidelity is the primary production philosophy.
- No false exact-match claims are allowed. Font matching must use `EXACT`, `LIKELY_MATCH`, `CLOSE_SUBSTITUTE`, `UNKNOWN`, or `OUTLINED_FROM_REFERENCE`.
- Crude primitives, proxy geometry, or low-quality topology must never be marked as finished professional 3D output.

## Dependency Direction Rules

The intended direction is:

```text
shared
  ^
document-model
  ^
command-engine
  ^
scene-runtime
  ^
renderers / reconstruction / validation / exporters / MCP
```

Rules:

- `document-model` must not depend on renderers, exporters, Studio, MCP, project-store, scene-runtime, or command-engine.
- `command-engine` must not depend on Studio, renderers, exporters, or MCP.
- Renderers must not depend on exporters.
- MCP must depend on commands and contracts, not UI.
- Blender Bridge must not own canonical state.
- Reconstruction must produce proposals and commands.
- Validation must not depend on state-mutating packages.
- Exporters must derive from the Canonical Design Document.
- Circular dependencies are prohibited.

Run `pnpm validate:deps` after changing workspace dependencies.

## Implementation Rules

- Inspect existing code and docs before creating new code.
- Reuse existing types, schemas, and utilities.
- Do not create architecture outside documented package ownership.
- Do not create duplicate types in multiple packages.
- Do not bypass runtime schemas for trusted-looking input.
- Do not place domain logic in `packages/shared`.
- Do not allow Studio, MCP, renderers, validation, or exporters to own canonical state.
- Do not hard-code one exporter or renderer into the Canonical Design Document.
- Do not hard-code one AI provider into core systems.
- Do not mark placeholders as production implementations.
- Do not flatten designs without reporting why.
- Keep new abstractions tied to documented responsibilities.

## Coding Rules

- Use TypeScript for implementation.
- Use runtime validation for external input, environment variables, commands, tool payloads, and persisted documents.
- Prefer deterministic pure functions for validators and schema logic.
- Use structured error codes and recoverability metadata.
- Use structured logging with correlation IDs for requests, jobs, projects, and documents.
- Keep package public APIs narrow and typed.
- Do not introduce circular dependencies.
- Do not add real secrets to source files.

## Testing Rules

Tests must be meaningful. Do not add tests that only assert `true`.

Expected test locations:

- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- End-to-end tests: `tests/e2e/`
- Visual fixtures: `fixtures/visual/`
- 3D fixtures: `fixtures/3d/`
- Golden baselines: `fixtures/golden/`

For Phase 0 and foundation changes, run the applicable checks:

- `pnpm validate:docs`
- `pnpm validate:deps`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `docker compose config`

Do not claim a check passed unless it actually ran.

## Validation Rules

- Validation is required for completed reconstruction, rendering, export, and correction work.
- Validation reports must be measurable and traceable to project, document, asset, viewport, renderer, and quality metadata where applicable.
- Export output must be built, rendered, and compared when export validation exists.
- Unsupported features and flattened fallbacks must be reported.
- Maximum Fidelity output must use iterative render-compare-diagnose-correct loops where implemented.

## Status-Update Rules

Update `docs/11_ROADMAP_AND_STATUS.md` only after implementation evidence exists.

A phase or roadmap item may be marked `VALIDATED` only when its acceptance criteria and required checks have actually passed. Status updates must record:

- Date
- Previous status
- New status
- Evidence
- Test results
- Remaining warnings
- Blockers
- Decisions
- Next action

## File-Creation Rules

- Keep the canonical docs intact and consolidated.
- Create ADRs only for real decisions.
- Create package code only inside the package that owns the responsibility.
- Keep placeholder files clearly marked as Phase 0 shells.
- Avoid duplicating long canonical requirements in package READMEs; link to canonical docs instead.

## Dependency Rules

- Use pnpm workspaces.
- Pin dependency versions deliberately.
- Do not use `latest` ranges.
- Do not introduce a dependency without a clear owner and reason.
- Keep external AI, rendering, export, and 3D provider adapters replaceable.
- Run dependency-boundary validation after package dependency changes.

## Security Rules

- Do not commit secrets.
- Validate file types, paths, archives, and external command requests.
- Preserve workspace isolation for MCP and workers.
- Use sandbox boundaries for generated code, exporter builds, Blender jobs, and external tools.
- Treat source assets and provider outputs as untrusted until validated.
- Use audit records for writes and destructive operations.

## Definition of Done

A task is complete only when:

- Code exists where required.
- Types are correct.
- Runtime validation exists for untrusted input.
- Tests pass.
- Documentation is current.
- Failure cases are handled.
- Logging exists where relevant.
- Security has been considered.
- Performance impact is understood.
- MCP support exists where required by the phase.
- Validation support exists where required by the phase.
- Export behavior exists or is explicitly deferred.
- Roadmap status is updated with evidence.

## Prohibited Shortcuts

- Do not reinterpret AEVUM as a normal design editor.
- Do not reduce reconstruction to screenshot tracing.
- Do not reduce 3D scope to simple WebGL display.
- Do not reduce export to one React implementation.
- Do not bypass the Command Engine for state changes.
- Do not flatten complete designs by default.
- Do not overwrite original assets.
- Do not claim exact reconstruction without evidence.
- Do not mark placeholder interfaces as production systems.

## Resuming After Context Loss

When a new Codex session resumes work:

1. Follow the mandatory reading order.
2. Inspect `docs/11_ROADMAP_AND_STATUS.md` for the current phase and evidence.
3. Inspect the existing files before editing.
4. Run or inspect validators before changing status.
5. Continue from documented state, not from chat history.
6. If state is ambiguous, record the ambiguity as a warning in the roadmap rather than guessing completion.

