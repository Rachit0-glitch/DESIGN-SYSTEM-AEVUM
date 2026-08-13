# @aevum/studio

AEVUM Studio is the professional visual editor and AI workspace for the AEVUM AI Reconstruction Engine.

## Architecture

Studio is a client of canonical systems. A `StudioSession` loads a validated Canonical Design Document into
`ProjectStore`, submits all persistent edits to Command Engine, projects the resulting version through Scene Runtime,
and consumes the Hybrid 2D Renderer graph. Studio never writes document objects directly.

Canonical state includes nodes, typography, assets, responsive overrides, timelines, 3D scenes, materials, lights,
cameras, and cinematics. Transient state includes selection, hover, active tool, open panels, zoom, pan, drag previews,
playhead UI, and menus. Transient state is not serialized into the CDD.

The browser build contains a narrow `node:crypto` compatibility alias because existing deterministic core packages use
synchronous SHA-256. It implements only SHA-256 and UUID generation. This is a bundler boundary, not a second hashing
contract.

## Workspaces

- Design: canonical layer hierarchy, direct canvas selection/manipulation, numeric properties, typography, assets,
  responsive viewports, snapping, keyboard nudge, duplicate, delete, undo, and redo.
- Animation: canonical tracks, keyframes, fixed-time Scene Runtime evaluation, playhead scrubbing, and reduced motion.
- 3D: a Three.js runtime view driven by canonical mesh, material, camera, light, and transform records.
- Fidelity: reference/current comparison, scores, coverage/confidence, attributed issues, heatmap regions, and bounded
  correction review.
- AI: selected-node context, structured operational stages, human-readable action records, version conflict failures,
  and Command Engine-backed accepted edits. Hidden chain-of-thought is never displayed.

## Persistence

`StudioPersistenceAdapter` is replaceable. The acceptance application uses durable browser storage and serializes the
validated CDD after successful commands. Production project access remains subject to the existing Supabase/MCP auth,
workspace, and permission boundaries; service-role credentials are never included in the frontend.

## Development

```text
pnpm --filter @aevum/studio dev
pnpm --filter @aevum/studio typecheck
pnpm --filter @aevum/studio build
pnpm test:e2e
```

The local URL is `http://127.0.0.1:4173`. Vite emits the production application to `apps/studio/dist/web`, the
ignored output directory used by the existing Vercel project.

## Bounded Limitations

Studio does not replace Blender, implement point-level vector authoring, upload untrusted files, or claim an external
vision provider. Real-time server push is deferred; successful commands update immediately in the current session.
The deterministic local AI acceptance path proves selected-context, versioning, operational status, and canonical
mutation without requiring a paid model. Production AI continues to use Agent -> MCP -> Command Engine.

## Canonical References

- `../../AGENTS.md`
- `../../docs/00_PROJECT_CONTEXT.md`
- `../../docs/02_SYSTEM_ARCHITECTURE.md`
- `../../docs/08_MCP_SPECIFICATION.md`
- `../../docs/09_VISUAL_VALIDATION.md`
- `../../docs/11_ROADMAP_AND_STATUS.md`
