# Studio ↔ MCP ↔ Agent Integration — Known Limitations (STEP 3–11)

This document is part of the Studio↔MCP↔Agent stabilization block (not a new numbered phase —
see `11_ROADMAP_AND_STATUS.md` for phase history). It records, per step, exactly what was built
and exactly where it is still weak, incomplete, or unverified against real infrastructure. Nothing
here should be read as "done" without also reading its limitations. Where a limitation was fixed
during this same block, that is noted; where it was not, that is stated plainly.

Status key: 🟢 solid and tested · 🟡 real but bounded/partial · 🔴 known gap, not built

---

## STEP 3 — Studio MCP command gateway

**What it is:** `apps/studio/src/core/production.ts`'s `execute()` replaced a hardcoded
`node.update`/`node.delete`-only allowlist with a gateway that calls the MCP server's own
`system.get_capabilities` and only forwards commands with a verified 1:1 Command-Engine-payload-to-
MCP-tool-input match.

**Limitations:**
- 🟢 **Update (Block D completeness, 2026-08-16): this bullet was stale — the "only 4 command
  types" ceiling no longer exists.** `apps/studio/src/core/capabilities.ts`'s `STUDIO_CAPABILITIES`
  registry (added after this bullet was originally written) now documents 12 `AVAILABLE` MCP
  tools — 8 routable through the generic command-shaped gateway (`node.create`, `node.update`,
  `node.delete`, `document.rename`, `node.move`, `node.duplicate`, `token.register`,
  `reference.update`) plus 4 invoked directly with tool-specific payloads because their shape
  doesn't match a single Command Engine payload (`asset.register`, `reconstruction.import_reference`,
  `document.get`, `fidelity.measure`). Commands with genuinely no MCP tool yet (`material.update`,
  `light.update`, `page.*`, `lighting.*`, `camera.*`, `scene3d.import`, `node.reparent`, …) are
  still honestly rejected — `session.ts`'s `moveNode`/`duplicateNode` no longer need to throw for
  this reason since Block D2, and `findStudioCapability()`/`isGatewayRoutable()` are the current
  single source of truth for what's routable, not a bare allowlist.
- 🟢 **Update (Block D completeness, 2026-08-16): fixed.** A capability re-fetch mechanism now
  exists. `ProductionStudioProject.refreshCapabilities()` (`apps/studio/src/core/production.ts`)
  re-calls `client.discoverCapabilities()` and swaps the module's capability state (enabled tools +
  derived actor permissions) in place; `ProductionBootstrap` (`apps/studio/src/main.tsx`) calls it
  automatically on `document.visibilitychange` whenever the tab becomes visible again. A mid-session
  role change is now reflected without a full project reload — proven by
  `tests/unit/studio-production.test.ts`'s "reflects a mid-session role change... without a full
  project reload" test, which asserts a command is rejected before the refresh and accepted after
  it, using a fetch mock that changes `enabledTools` between calls. The server still independently
  re-checks every write regardless (this was never the security boundary); this closes the
  client-side staleness window instead.

---

## STEP 4 — Studio AI panel → real Agent Planner

**What it is:** `apps/studio/src/main.tsx`'s `AiPanel` now builds a real `AgentGoal`/`AgentSession`
and drives them through `createAgentEngine()` (`@aevum/agent-runtime`) with
`createDeterministicReasoningProvider()`, a real MCP client from `agentContext.createMcpClient()`,
and real capability/permission gating inside the engine itself. This is not a second, parallel
agent architecture — it's the same one `packages/agent-planner`/`packages/agent-runtime` already
implement, previously only exercised by tests.

**Limitations:**
- 🟡 **Update (Block D completeness, 2026-08-16): function name in this bullet was stale, the
  underlying limitation is not.** The keyword-matching prompt interpreter moved server-side and was
  renamed to `interpretNodeEditPrompt()` (`packages/agent-runtime/src/engine.ts`, Block D4) — it is
  still deliberate keyword matching (`rename to "..."`, `center`, `bigger`/`smaller`,
  `left`/`right`/`up`/`down` with optional `NNpx`, plus delete-intent classification added in
  Issue 2), not real NLU, and a prompt it can't map still returns honestly rather than guessing.
  The "AI panel cannot act on open-ended instructions" conclusion still holds.
- 🟡 **Only ever edits one already-selected node.** `run()` operates on `selected[0]` (or the first
  root node); there is no multi-node selection support, no node creation or deletion via the AI
  panel, no cross-node instructions ("make all headings bold").
- 🟢 **Update (Block D5, fixed before this pass): the approval adapter is no longer a stub.**
  `createInteractiveApprovalAdapter()` (`apps/studio/src/core/approval.ts`) replaced the old
  `createDeterministicApprovalAdapter()` call that always auto-rejected every approval-gated step.
  Approval-gated plan steps now surface a real pending-approval UI in Studio
  (`StudioPendingApproval`) that a user can actually approve or reject, instead of failing closed
  with no way to respond.
- 🟢 **Canonical sync is correct**: production-mode writes call
  `session.acknowledgeAgentNodeUpdate()` afterward (STEP 10); dev-fixture mode's in-process
  transport already applies the change via `session.updateNode()` as part of simulating the tool
  call, and the code explicitly avoids double-applying it.

---

## STEP 5 — Local/free vision pipeline (`@aevum/reconstruction-vision`)

**What it is:** Real, local, free region segmentation (color-histogram quantization → nearest-
palette assignment → morphological close → connected components → non-max suppression) plus real
local OCR (tesseract.js, two-pass: whole-image line localization, then crop-and-re-recognize per
candidate). No paid vision/OCR API is called anywhere.

**Limitations — demonstrated against the real sushi poster fixture (`fixtures/sushi poster.jpg`),
not hypothetical:**
- 🔴 **Heavily stylized/display typography is not detected as text at all.** The poster's large
  "SUSHI" headline (glow/shadow/gradient effects, distressed lettering) never appears as an OCR
  line candidate — tesseract's line-level detector doesn't propose it as plausible text in the
  first place. This is not a threshold that can be tuned away; a dedicated text-region-detection
  front end (EAST/CRAFT-style) would be needed, which is new engineering, not a fix to what's here.
- 🟡 **OCR accuracy on busy photographic scenes is inconsistent.** Some lines came back exactly
  right ("PEGA PELO DELIVERY", "RUA DESIGNER PREMIUM, 3490", "CENTRO - RIO DE JANEIRO/RJ"); others
  stayed garbled (the price/RODÍZIO block) or misread individual characters (phone number digits).
- 🟡 **Region segmentation over- or under-segments depending on the image.** Color-histogram
  quantization with a fixed palette size (8) works well on flat/poster-style compositions (proven
  by synthetic tests) but on real photographs produces either many small redundant fragments
  (before NMS was added) or, after NMS, a smaller number of coarser zones that don't always
  correspond to one human-meaningful design element each — e.g. the product photo and part of the
  background can merge into one BACKGROUND-classified zone rather than staying separate.
- 🟡 **No rounded corners / vector paths.** Every SHAPE region is a plain axis-aligned rectangle;
  `cornerRadius`, non-rectangular geometry, and gradients/strokes are never detected (the sushi
  poster's rounded price badge becomes a sharp-cornered rectangle).
- 🟢 **Update (fixed before this pass): qualifying IMAGE regions are now independently extracted.**
  `extractIndependentImageAssets()` (`apps/mcp-server/src/tools.ts`) crops a real, separately stored
  DERIVED asset (with full lineage back to the source via `source.originalAssetId` +
  `provenance.processingChain`) for each IMAGE region big enough and small-enough-relative-to-the-
  source-image to be a plausible standalone graphic — not a tiny fragment or a near-full-image crop.
  Regions outside that range still fall back to `extracted: false` (a crop-window into the shared
  source asset), which is the correct behavior for e.g. a decorative sliver too small to be its own
  asset. See STEP 7 below for what this means for editability.
- 🟡 **OCR trained-data caching is a real, disclosed network dependency.** First use in a given
  cache directory downloads `eng.traineddata` from tesseract.js's CDN; every run after that against
  the same cache directory is offline. The MCP server points this at
  `os.tmpdir()/aevum-reconstruction-vision-ocr-cache` so it downloads once per deployment process,
  not once per request — but a fresh container/deployment will re-download once.
- 🟢 **Fully local and free either way** — no request ever leaves the process boundary to a paid
  vision/OCR vendor, satisfying the explicit "no paid external AI APIs" constraint.

---

## STEP 6 — Asset ingestion via MCP (`asset.register`)

**What it is:** A new MCP tool that decodes base64 image bytes, optionally runs STEP 5's vision
analysis (`analyzeForReconstruction: true`), stores the bytes via a real `AssetStorageAdapter`
(`createSupabaseAssetStorage`, new, in `@aevum/project-store`), and registers the resulting
`AssetRecord` through the existing, previously-unused `asset.register` Command Engine command.

**Limitations:**
- 🔴 **`createSupabaseAssetStorage` has never been exercised against a real Supabase Storage
  bucket.** All tests use `createInMemoryAssetStorage` (a legitimate test double for the adapter
  *interface*, `packages/assets/src/storage.ts`'s `AssetStorageAdapter`), but the actual Supabase
  Storage HTTP calls inside `createSupabaseAssetStorage` (`packages/project-store/src/supabase.ts`)
  are unverified against a live bucket. This needs real `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
  `SUPABASE_STORAGE_BUCKET` credentials in a real deployment to confirm.
- 🔴 **No real security/quarantine scanning.** Every registered asset gets
  `security: { status: "PASSED", inspectedAt, inspector: "NONE", issues: [] }` — `inspector: "NONE"`
  is a deliberately honest label (no scan happened), not a fabricated pass from a real scanner. No
  malware/content-safety inspection exists anywhere in this codebase.
- 🟡 **IMAGE-kind only.** The MCP input schema (`AssetRegisterInputSchema`) only accepts
  `kind: "IMAGE"` — VIDEO/FONT/AUDIO/SVG/HDRI/GLB/etc. registration is not exposed via MCP at all,
  by explicit scope decision, not an oversight.
- 🟡 **Size bounding is generic, not asset-specific.** Base64 payload size is capped only by the
  MCP server's general `toolInputBytes`/`requestBodyBytes` limits (already-enforced, real), not by
  any image-specific dimension/byte-size policy.

---

## STEP 7 — Editable 2D reconstruction flow (`reconstruction.import_reference`)

**What it is:** A new MCP tool that runs `packages/reconstruction`'s existing, *unmodified*
analyze → proposal → command-plan pipeline against an already-registered, already-analyzed image
asset, then executes the resulting multi-command transaction (`beginTransaction` +
`proposal.commandPlan.commands`) against the real canonical document. Studio's References panel
wires a real upload button through `asset.register` → `reconstruction.import_reference` →
`session.resyncDocument()`.

**Limitations:**
- 🟡 **Update (Block D completeness, 2026-08-16): merging into an existing page is now possible,
  but opt-in, not automatic.** `reconstruction.import_reference` accepts an optional `targetPageId`;
  when set and it resolves to a real PAGE already in the target document,
  `createReconstructionProposal()` (`packages/reconstruction/src/proposal.ts`) parents the new
  FRAME under that page and skips proposing a `page.create` at all — `addNode()`'s existing
  parent-`childIds`-append behavior (Command Engine) handles wiring the frame in without any new
  update command. Verified end to end by
  `tests/integration/mcp-reconstruction-import.test.ts`'s "merges into an existing page via
  targetPageId" test (imports twice, second import's `targetPageId` set to the first import's page,
  asserts exactly one PAGE node and two FRAME children under it). Studio does not yet pass
  `targetPageId` from the References panel's import flow — the capability exists at the MCP/engine
  layer, wiring it into a "import into current page" UI control is unbuilt. When `targetPageId` is
  unset (Studio's current default), behavior is unchanged: a new page is always created.
- 🟢 **Update (fixed before this pass): IMAGE nodes for qualifying regions now reference a real,
  independently extracted derived asset, not only a crop of the source.** See STEP 5's corrected
  IMAGE-extraction bullet above — `extractIndependentImageAssets()` covers regions in a sane
  size/area range; regions outside that range still fall back to a crop of the shared source asset,
  which remains real and editable at the node level (move/resize/recrop) but not independently
  replaceable. See the direct answer on "is the image editable" below for the current, accurate
  per-node-type breakdown.
- 🟡 **No response streaming / progress feedback during the import itself.** Studio's References
  panel shows coarse stages (Uploading… / Analyzing… / Creating editable layers…) driven by which
  MCP call is in flight, not real per-region progress from the engine (the engine call itself is
  a single synchronous request-response, consistent with STEP 4's engine also being non-streaming).
- 🟢 **Corrected framing (Block D completeness, 2026-08-16): this was never a gap to fix, it was
  always intentional design — the original 🟡 framing here was misleading.** Fidelity evaluation
  (Block D8's `fidelity.measure`) is deliberately on-demand, not automatic-on-import: reconstruction
  produces canonical nodes, and a user (or the Fidelity workspace) separately triggers a real
  measurement against a chosen reference when they want one, persisting a real `ValidationRecord`
  (see STEP 8's corrected bullet below). Nothing about reconstruction blocks or defers an automatic
  measurement that was supposed to exist — none was ever designed to run automatically on import.
- 🟢 **Undo/redo/save/reload work correctly for reconstructed content** because reconstructed nodes
  are ordinary canonical nodes — this relies on already-existing, already-tested Command Engine /
  `ProjectStore` machinery, not anything new built in this block.

---

## STEP 8 — "Real" Fidelity workspace data

**What it is:** `FidelityWorkspace` now reads `document.validations` and shows real per-domain
scores when a `ValidationRecord` exists, and an honest "Not evaluated" empty state when it doesn't.

**Limitations:**
- 🟢 **Update (Block D8, fixed before this pass): a real path now writes `ValidationRecord`s.**
  `fidelity.measure` (`apps/mcp-server/src/tools.ts`) runs a real Maximum Fidelity measurement —
  rendering the current document via the real Scene Runtime/Renderer 2D/Playwright raster pipeline,
  comparing it against a registered reference image — and persists the result via a new
  `validation.record` Command Engine command, so `document.validations` is genuinely populated for
  any node a user chooses to measure. `fidelity.validate_report`/`fidelity.propose_corrections`
  remain stateless validators over an externally-supplied report, unrelated to this path.
  `FidelityWorkspace` still correctly shows "Not evaluated" for any node nobody has measured yet —
  that empty state is honest, not a bug — but it is no longer true that *no* path exists to produce
  a real one.
- 🟡 **The displayed "average" score is a client-side mean of whatever domain scores exist**, not
  a value the fidelity engine itself computed as "overall" — deliberately labeled "Average of N
  domain score(s)" rather than "Overall" to avoid implying more authority than it has.

---

## STEP 9 — "Real" References panel data

**What it is:** `ReferencesPanel` reads `document.references`/`document.assets`/
`document.validations` directly instead of hardcoded values, plus the new upload/import control.

**Limitations:**
- 🟡 **Depends entirely on STEP 7 having been run for a document to show anything** — this panel
  itself introduces no new data-producing capability, only a real rendering of whatever
  `reconstruction.import_reference` (or manual reference registration) has produced.
- 🔴 **No on-canvas reference-image overlay/toggle exists.** The panel shows reference *metadata*
  (dimensions, evaluation status) in the left sidebar; there is no "show the original image
  semi-transparently over the canvas for comparison" feature. This was flagged explicitly before
  attempting STEP 11 and is still unbuilt.
- 🟢 **Update (Block D completeness, 2026-08-16): "Replace reference" is now wired.** A new
  `reference.update` Command Engine command + MCP tool
  (`packages/command-engine/src/commands/reference.ts`, `apps/mcp-server/src/tools.ts`) replaces an
  existing reference's underlying `assetId` while preserving the reference's own `id`, so any
  `ValidationRecord`s that already cite it by `referenceId` stay linked. The panel's "Replace
  reference" button now uploads a new image and calls it, mirroring the existing "Import reference"
  flow's upload UX. There is still no delete-reference flow — replacing is covered, removing is
  not.

---

## STEP 10 — Canonical state sync fixes

**What it is:** Two confirmed, fixed bugs: (1) the tab-return delay's real root cause — Studio
rebuilt its entire session on every Supabase background token refresh because
`ProductionBootstrap`'s effect depended on `authSession` object identity, not user identity; fixed
by tracking the session in a ref and only reloading on genuine sign-in/out/user-change. (2)
Agent-driven writes (and now reconstruction imports) never reached the locally rendered document;
fixed via `session.acknowledgeAgentNodeUpdate()` (single-node) and `session.resyncDocument()`
(whole-document refetch, used after multi-command transactions whose exact command list isn't
returned to the caller).

**Limitations:**
- 🟡 **`resyncDocument()` is a hard resync, not an incremental merge.** It replaces the entire
  local `ProjectStore` with a freshly fetched document and clears remote undo/redo history. This is
  correct and safe (no drift risk) but means a large import discards the ability to undo whatever
  the user had just done locally immediately beforehand, in favor of trusting the server's fetched
  state as ground truth.
- 🟢 **Update (Block D13, 2026-08-15): the tab-return fix is now verified by real, executed
  reproduction, not just code-level analysis.** `tests/unit/studio-bootstrap.test.tsx` mounts the
  real `ProductionBootstrap` component with a controllable fake Supabase auth client and fires the
  exact event shape a real background token refresh produces (a new `Session` object, same signed-in
  user) — and measures, via a real call-count on a mocked `/v1/bootstrap` fetch (not a read of the
  guard condition in the source), that the expensive full reload does not fire a second time. A
  second test in the same file fires a genuine identity change (different user) and confirms the
  reload *does* correctly fire then, proving the guard is selective rather than just permanently
  suppressed. Two further, real (not guessed) findings from this investigation, both negative —
  ruling things out, not finding new bugs: (1) a live-browser attempt to reproduce this via the Page
  Visibility API found that the sandboxed Chromium instance available in this environment reports
  `document.visibilityState` as permanently `"hidden"` regardless of tab focus/selection, making
  that specific reproduction angle unusable here (an environment limitation, not an app bug); (2) a
  full search of Studio's client code found no `visibilitychange` listener anywhere, and the only
  `requestAnimationFrame` loop (`ThreeViewport`'s 3D scene rotation) advances by a fixed increment
  per callback rather than a wall-clock time delta, so it cannot produce a "catch-up" burst of work
  after a paused/throttled background period even in principle — ruling out two plausible alternative
  mechanisms for a tab-return freeze. **Production confirmation against a live Supabase deployment
  remains open** — this environment still has no live backend to time the fix against end-to-end —
  but the causal mechanism itself is no longer merely inferred from reading the code; it has been
  exercised and measured directly.

---

## STEP 11 — Sushi poster acceptance test

**Result: partial pass**, run for real against the actual supplied poster
(`fixtures/sushi poster.jpg`, 736×920 JPEG) through the full, unmodified MCP pipeline —
`asset.register` (with `analyzeForReconstruction: true`) → `reconstruction.import_reference`.

**What genuinely works:**
- Multiple real, separately-editable nodes are created (not one embedded reference image) — a
  PAGE, a FRAME, several BACKGROUND/SHAPE/IMAGE nodes, and TEXT nodes.
- Two IMAGE-category regions correctly correspond to visually distinct photographic zones
  (the decorative flying-sushi pieces).
- Two TEXT regions were read essentially exactly right: "PEGA PELO DELIVERY" and
  "RUA DESIGNER PREMIUM, 3490" / "CENTRO - RIO DE JANEIRO/RJ".

**What does not work, against the literal acceptance criteria:**
- The "SUSHI" headline typography — explicitly named in the acceptance criteria as its own
  layer — is **never detected as text at all** (see STEP 5's typography-detection limitation).
- The price card ("RODÍZIO COMPLETO R$ 67,90") is read as one region but the recognized text is
  still garbled, not clean/correct.
- The phone number is misread (a digit-level OCR error: 99999 → 00000).
- Decorative elements, the price card, and the product photo are approximated as generic
  BACKGROUND/SHAPE/IMAGE color-cluster zones rather than cleanly matching each named element in the
  original design (top label badge, price card *as a rounded card*, etc.) one-to-one.

This is documented as a real, partial result — not marked VALIDATED — per the explicit instruction
to never claim validation before acceptance tests actually pass.

**Update (Block D6, 2026-08-15):** this result is now backed by a real, runnable, checked-in
regression test — `tests/integration/sushi-poster-acceptance.test.ts` — instead of only a one-off
manual run. It re-verifies the "genuinely works" list above (real page/frame/multiple-node
decomposition, the two reliably-OCR'd text lines, ≥2 independently editable IMAGE regions, every
node editable) end to end through the real, unmodified pipeline, plus a rendering step: the
reconstructed document is projected through the real Scene Runtime and Renderer 2D pipeline
(`projectScene` → `buildRenderGraph`/`render`) and asserted to produce real paint/text render
operations without throwing. It deliberately does not assert the "does not work" items above (the
undetected SUSHI headline, garbled price/phone OCR) as passing — asserting those would either fail
honestly or require weakening the test to hide a known, disclosed limitation, neither of which this
test does. No genuine new defect was found while building this test: the reconstructed node
positions/dimensions are sane (within the 736×920 frame, no NaN/zero-size), and rendering succeeds
cleanly.

---

## BLOCK C addendum (2026-08-15) — the Paint model gap, found and then closed for solid color

While implementing Block C (reconstruction quality), auditing why reconstructed SHAPE/TEXT fill
colors were never visible surfaced a real, pre-existing architectural gap. This section originally
reported it as unaddressed; it has since been closed for the solid-color case in this same session
(CDD 1.8.0). What follows is the corrected record, not the original (partially inaccurate) claim.

- 🟢 **Fixed: the canonical schema now has a minimal Paint-by-token model.** `TextStyle` gained an
  optional `fillTokenId` (CDD 1.8.0, `packages/document-model`), mirroring `ShapeNodeSchema`'s
  existing `fillTokenId`/`strokeTokenId`. This is still solid-color-only — there is no gradient
  type and no inline paint value anywhere in the schema — but text can now represent color at all,
  which it could not before.
- 🟢 **Fixed: reconstruction creates real, applied color tokens, not just captured metadata.**
  `packages/reconstruction/src/proposal.ts` now samples real ink color (TEXT) and fill color
  (SHAPE), deduplicates identical colors into shared `COLOR` Tokens, and sets `fillTokenId` on the
  resulting nodes. This required a genuinely missing Command Engine capability — there was no way
  to register a Token on a document at all — so `token.register` (command + schema + event) was
  added, mirroring `asset.register`. Verified end to end: a node's `fillTokenId` resolves to a real
  token actually committed in the persisted document, not a dangling reference
  (`tests/integration/mcp-color-tokens.test.ts`).
- 🟡 **Corrected: Studio's 2D canvas was not actually unpainted before this fix — the original
  claim here was wrong.** `apps/studio/src/main.tsx`'s canvas node component already resolved a
  node's `PAINT` operation from the real render graph and applied it as CSS `background` — SHAPE
  fills (from a hand-set token, or now from reconstruction) already rendered before this session.
  The real, narrower gaps were: (1) a TEXT node's resolved paint was never read at all — `color`
  only ever fell back to legacy `metadata.customData["aevum.studio.color"]`; (2) `cornerRadius` was
  never read from real `geometry.cornerRadius`, only from legacy customData; (3) no stroke/border
  CSS was ever applied, even though `resolveStyle()` already resolved a `strokeTokenId` paint. All
  three are now fixed, and — a step below `main.tsx` — `packages/scene-runtime`'s reference
  resolver only ever collected token ids from `SHAPE.fillTokenId`/`strokeTokenId`; a TEXT run's
  `style.fillTokenId` was never added to `resolvedReferences.tokens` at all, so `renderer-2d`'s
  token lookup would have silently found nothing regardless of the `main.tsx` fix alone. Fixed
  scene-runtime to also collect fill tokens from text runs. Verified live in the real Studio dev
  server (not just typechecked): a real document with a token-backed SHAPE fill, stroke, and
  `geometry.cornerRadius`, and a token-backed TEXT color, was loaded and its computed CSS
  (`background`, `border`, `border-radius`, `color`) inspected directly in the running app,
  alongside confirming zero change to every node still using the legacy customData path.
- 🔴 **Still not built:** gradients and patterns as Paint (only solid COLOR tokens exist);
  stroke *color sampling* in reconstruction (the stroke-rendering plumbing now exists end to end,
  but nothing yet samples a real stroke color from pixels the way fill/ink color sampling does);
  any Studio UI for a user to create or assign a token by hand (today only reconstruction and
  hand-authored fixtures can set one); rounded-corner *detection* from pixels (the geometry field
  and its rendering are both real now, but no analyzer infers a non-zero radius from an image).

---

## Block D completeness pass (2026-08-16)

A full re-audit of every limitation recorded above found the list itself had drifted: several
bullets described gaps that earlier Block D work (D2–D13, already committed) had already closed
without this document being updated to say so. This pass did two things: corrected every stale
claim in place (marked 🟢 with an "Update" note above, at STEP 3, 4, 5, 7, 8, and 9), and closed
the remaining gaps that were genuinely still open and didn't require infrastructure unavailable in
this environment:

- **"Replace reference" wired** (was unwired in STEP 9) — new `reference.update` command + MCP
  tool + Studio button wiring.
- **Client-side capability re-fetch** (was entirely absent in STEP 3) — `refreshCapabilities()`,
  fired automatically on tab-visibility return.
- **Reconstruction page-merge** (was always-new-page in STEP 7) — optional `targetPageId` on
  `reconstruction.import_reference`, opt-in, verified end to end.

**Deliberately left open, with the concrete reason each needs something this environment doesn't
have:**
- 🔴 **Live Supabase Storage confirmation** (STEP 6) — `createSupabaseAssetStorage` is still only
  exercised via `createInMemoryAssetStorage` in tests. Confirming it needs a real
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_STORAGE_BUCKET` against a live bucket, which
  this environment does not have credentials for.
- 🔴 **Malware/content-safety scanning on asset upload** (STEP 6) — every asset still gets
  `inspector: "NONE"`. This needs integrating a real third-party scanning service; there is no local
  substitute that would be honest to build, and no such service is wired into this project.
- 🔴 **Stylized/display typography detection** (STEP 5/11, the "SUSHI" headline) — tesseract's
  line-level detector fundamentally doesn't propose heavily stylized text as a candidate at all;
  fixing this needs a dedicated text-region-detection front end (EAST/CRAFT-style), which is new ML
  engineering, not a fix to what exists.
- 🔴 **On-canvas reference-image overlay** (STEP 9) — showing the original reference
  semi-transparently over the canvas for visual comparison is a real, sizeable new Studio UI
  feature (canvas layering, opacity control, toggle state), not a small wiring gap like the three
  items closed above.

None of these four required a design decision to skip — each has a concrete, stated reason it
needs infrastructure or engineering effort beyond what "wire up an existing capability" covers.

---

## Block F — Fidelity / Production QA (2026-08-16)

A full, code-level audit of the reference → analysis → reconstruction → render → fidelity →
correction pipeline, prompted by a direct request to make the reconstruction system production-
grade from a fidelity/QA perspective. The audit's central finding: `packages/fidelity/src/structure.ts`'s
`compareStructuralFidelity()` (BOUNDS/CROP/GRADIENT/PAINT_ORDER/LINE_BREAKS detection) was real and
already tested, but **completely unreachable from any real `fidelity.measure` call** — the
`structuralExpectations` parameter it depends on was only ever populated by hand-built unit-test
fixtures, never by the real MCP handler. Region-based pixel comparison (Block E5) was SHAPE-only,
so TEXT/IMAGE content mismatches and missing elements were invisible to any real measurement.

**Closed, for real, this pass:**
- 🟢 **Geometry (BOUNDS) mismatch detection is now real and reachable.** `apps/mcp-server/src/tools.ts`'s
  `fidelity.measure` handler now builds real `StructuralExpectation`s from data reconstruction
  already captures at import time: every reconstructed node carries a real `RECONSTRUCTED_FROM`
  `sourceLink` (`packages/reconstruction/src/proposal.ts`) back to its real originally-detected
  region, and `document.references[refId].regions[regionId].bounds` still holds that region's real,
  original bounds. If a node's live position/size has since drifted from that, the already-tested
  BOUNDS comparator now genuinely fires. Verified against the real sushi poster fixture: moving a
  genuinely reconstructed node by a real (60, 45) px offset produces a real `LAYOUT_BOUNDS_MISMATCH`
  issue reporting exactly that delta (`tests/integration/mcp-fidelity-structural.test.ts`).
- 🟢 **Missing-element detection is now real.** Region-based comparison now iterates every region a
  reference genuinely detected, not just the SHAPE nodes currently in the render graph — a region
  with no surviving node still produces a real region-mismatch issue (no fabricated `nodeId`,
  honestly absent) instead of silently vanishing from the report the moment the node is deleted.
  Verified against the real sushi poster fixture: deleting a genuinely reconstructed leaf node
  produces a real, detected mismatch for its now-empty region.
- 🟢 **Image and typography region coverage.** Region-based comparison is no longer SHAPE-only —
  every reconstructed region is now compared and attributed by its real node type (TEXT →
  TYPOGRAPHY domain, IMAGE → ASSET domain, everything else → COLOR), closing the "wrong image
  content" and "wrong text region" gaps Block E5 left open. Verified against the real sushi poster
  fixture: real TYPOGRAPHY and ASSET domain regions are genuinely built and measured
  (`domainScores[...].totalRegions > 0` for both).

**Left honestly open, each for a concrete, investigated reason — not hidden behind a heuristic:**
- 🔴 **LINE_BREAKS (typography line-wrap) structural comparison remains unreachable.** Unlike BOUNDS,
  there is no equivalent real, already-captured "expected" line-wrap layout anywhere in the
  document/reference data — `reference.regions[]` only ever stored bounds, never shaped-text
  metrics. Building one would mean capturing real line/baseline data at reconstruction time first;
  not done this pass.
- 🟡 **No separately-attributed spacing/alignment metric was built.** Real per-node BOUNDS
  comparison (above) already reports an exact, real positional delta for any drifted reconstructed
  node; since spacing between two nodes is fully determined by their individual positions, a
  dedicated spacing/alignment comparator would report information the BOUNDS comparator already
  provides. Documented as intentionally not duplicated, not as an unaddressed gap.
- 🟡 **Stroke/gradient mismatches are not separately attributed.** GRADIENT is one of
  `compareStructuralFidelity`'s real types but, like LINE_BREAKS, has no real captured "expected"
  source to compare against outside unit-test fixtures. A stroke or gradient rendering difference on
  a SHAPE region is still genuinely caught — it's real pixel content inside that region's real pixel
  comparison (above) — just reported as a generic region mismatch, not a `GRADIENT`-coded or
  stroke-specific one.
- 🔴 **CROP structural comparison remains unreachable**, for the same reason as LINE_BREAKS/GRADIENT
  — real IMAGE-region pixel comparison (above) catches a wrong crop's visible content as a genuine
  ASSET-domain mismatch, just not attributed specifically to "the crop window is wrong" versus any
  other reason that region's pixels differ.
- 🔴 **The older, parallel Phase 7/8 validation/correction system
  (`packages/validation`/`packages/correction`, `apps/validation-worker`/`apps/correction-worker`)
  remains disconnected from the real, MCP/Studio-wired fidelity system
  (`packages/fidelity`).** A bridge exists (`packages/fidelity/src/phase8.ts`'s
  `createPhase8FidelityBridge`) but investigated and confirmed unused by any real caller — and
  `packages/correction`'s engine has no inference logic of its own (it only ever copies an
  externally-supplied `expectedValue` onto node fields), so wiring it to a real fidelity measurement
  today would produce empty, no-op proposals for every issue `fidelity.measure` actually generates.
  Left unbuilt rather than wired to produce nothing (same reasoning Block E5 already applied to
  structural auto-correction).
- 🟡 **A real, disclosed (not previously documented) performance characteristic**:
  `packages/fidelity/src/raster.ts`'s in-browser raw-pixel-to-base64 encoding (inside the Playwright
  page, ahead of decoding back to bytes in Node) builds the output string in 32KB chunks via
  `String.fromCharCode` — real, bounded (scales with the rendered pixel count, capped by
  `maxPixels`), and already avoids a call-stack overflow via chunking, but is a real O(pixels)
  JS-string-building cost inside the browser for large renders. Not rewritten this pass (would need
  a real architecture change to the raster backend, e.g. `canvas.toDataURL()`/
  `OffscreenCanvas.convertToBlob()`); disclosed here instead of silently left undocumented.
- 🟢 **Fabricated/demo fidelity values: re-audited, confirmed still clean.** No hardcoded score,
  hardcoded `fontMatchStatus: "EXACT"`, or other fabricated-looking value was found anywhere in
  `apps/studio/src` — Block D10's removal holds under a fresh, direct search.

**Live-verified in Studio (dev server):** the Fidelity workspace shows the honest "Not evaluated. No
Maximum Fidelity report has been generated for this document yet." empty state with no report
present (no fabricated score); attempting the reference-import flow in the local dev fixture (which
has never implemented `asset.register`, by design — see STEP 6) surfaces the real, honest error
"Deterministic Studio provider does not expose asset.register." directly in the References panel —
confirming the whole chain (UI action → real MCP call → honest failure → honest UI display) never
fabricates success at any point, even when the underlying capability genuinely isn't available in
this environment.

New tests: `tests/integration/mcp-fidelity-structural.test.ts` (2 tests, both against the real
sushi poster fixture, not a synthetic substitute).

---

## Block G — Final End-to-End Acceptance + Production Hardening (2026-08-16)

Two parts: (1) a real, evidence-based acceptance pass over the whole A→F pipeline against the real
sushi poster fixture and the live Studio app, and (2) an independent forensic audit of the entire
repository across MCP/Command-Engine reachability, the reconstruction→renderer→fidelity→correction
data lifecycle, and security/production-readiness/docs-consistency — run as three parallel,
citation-required background investigations with no access to each other's findings or to this
session's prior conclusions, so they could not simply confirm each other.

### Acceptance results (Part 1)

- **G1 (reconstruction value verification).** Existing tests already assert real value ranges (not
  just existence) for cornerRadius/ellipse-vs-rectangle detection, gradients, strokes, derived image
  assets, and token references. The one genuine gap found — repeated imports of the same reference —
  is now covered: `tests/integration/mcp-reconstruction-repeated-import.test.ts` imports the real
  sushi poster twice with no `targetPageId` and proves two independent, non-colliding, structurally
  valid pages result (no corrupted merge, no id collision).
- **G2/G3 (fidelity + correction acceptance).** Already substantively proven by Block E5/F's real
  autocorrect and structural-comparison tests against the real fixture; no new gap found in this
  pass.
- **G4 (failure/recovery).** An extensive pre-existing failure-mode suite already covers auth
  rejection, malformed payloads, transaction rollback, locked-node rejection, disabled-tool honesty,
  and stale-version rejection. Three new tests in `tests/integration/mcp-failure-recovery.test.ts`
  close the remaining real gaps: (1) a `targetPageId` naming a real-but-wrong-type node gracefully
  falls back to a new page rather than crashing; (2) a genuinely blank/featureless reference image
  gracefully degrades to `fallbackManifest()`'s single-region manifest rather than crashing or
  producing zero regions; (3) `autoCorrect: true` honors the exact same optimistic-concurrency check
  as every other write path — no weaker safety net for corrections.
- **G5 (Studio live acceptance).** Run against the actual dev server, not backend tests alone.
  Verified live: a real two-clause compound edit ("make the headline larger and make the introduction
  smaller") resolved two distinct real nodes and committed, advancing the canonical document version
  by two real `node.update` commits; a real, honest `"...targets a FRAME node, which has no fill to
  recolor."` failure left the document version completely unchanged (zero partial writes); the
  Fidelity workspace's honest "Not evaluated" empty state and the References panel's honest
  `asset.register`-unavailable error both reproduced exactly as Block F documented. **A real bug was
  found and fixed in this pass**: the AI panel's activity log rendered each operational-action string
  with `key={action}`, so a compound edit producing multiple identical strings (e.g. two
  `"node.update — succeeded"` entries) triggered a real React duplicate-key warning
  (`apps/studio/src/main.tsx`). Fixed to key on `${index}:${action}` — safe here because `actions` is
  always replaced wholesale by `setActions(...)`, never incrementally mutated, verified fixed by
  reproducing the exact same compound edit again and confirming no new console warning.
- **G6 (real, measured performance).** Timed against the real sushi poster fixture, 3 repeated
  rounds, no synthetic data: `asset.register` with `analyzeForReconstruction: true` (real local
  OCR + color-histogram vision) ≈ 9.0–9.4s; `reconstruction.import_reference` ≈ 80–270ms (fast — the
  expensive analysis already happened at register time); `fidelity.measure` (STANDARD profile,
  real raster render + region comparison) ≈ 7.5–8.2s. Heap usage rose from 620MB to 675MB between
  round 1 and round 2 (one-time warm-up: module init, JIT, caches) and then held flat at 675MB into
  round 3 — no continued growth observed across repeated calls. A full end-to-end
  register→import→measure round trip costs roughly 16–17 real seconds today, dominated by local
  vision analysis and pixel-based fidelity measurement — both real, expected costs of the
  no-paid-API-beyond-Vision architecture, not something this pass claims to have sped up.
- **G7 (fabrication/dead-code sweep).** A fresh, repo-wide grep for `TODO`/`FIXME`/`HACK:`/`not
  implemented`/`placeholder` across `apps/mcp-server/src`, `apps/studio/src`, `packages/fidelity/src`,
  and `packages/reconstruction/src` found nothing beyond two already-honest, correctly-commented
  dry-run placeholders in `apps/mcp-server/src/tools.ts` (they never persist bytes and are clearly
  labeled as such). No new fabrication found beyond what the forensic audit below independently
  surfaced.

### Forensic audit findings (Part 2) and disposition (Part 3)

Three independent background audits (MCP/Command-Engine surface; data lifecycle across
reconstruction→renderer→fidelity→correction; security/production-readiness/docs-consistency)
returned the following real findings, each fixed within the existing architecture unless noted as a
proposed future phase below.

**CRITICAL**
- Component and advisory-token candidates that reconstruction's own analyzer detects
  (`packages/reconstruction/src/analyzer.ts`'s `components.detect` and multi-region-fill token
  inference) are validated into real `ProposedComponent`/`tokenCandidates` structures by
  `proposal.ts`, but `commands.ts`'s `buildCommandPlan` never emits any command for them —
  `document.components` is always empty after reconstruction, and only `applied: true` tokens (a
  different code path) ever reach `document.tokens`. The whole `COMPONENT_INFERENCE` capability
  currently has zero document effect. **Not fixed this pass** — closing it needs a real
  `component.register` command type (none exists today) plus a genuine decision about component
  identity/instancing semantics, not a mechanical wiring fix. See "Proposed Future Phase: Component
  Materialization" below.

**HIGH — fixed this pass**
- `packages/renderer-2d`'s `resolveStyle` never read the real sampled `cornerRadius`/`stroke.width`
  values reconstruction writes onto `SHAPE.geometry` — only Studio's own CSS canvas read them
  directly, so the renderer used for `fidelity.measure`'s raster comparison silently disagreed with
  what Studio actually shows the user. Fixed: `styles.ts` now falls back to
  `geometry.cornerRadius`/`geometry.stroke.width` when no explicit `aevum.renderer2d` metadata is
  set, mirroring Studio's own fallback exactly. Verified with two new regression tests
  (`tests/unit/renderer-2d.test.ts`): the fallback applies when no explicit metadata exists, and
  explicit `aevum.renderer2d` metadata still wins when both are present.
- `asset.remove`'s `canExecute` performed no cross-reference check before deleting an asset record,
  so removing an asset still referenced by a node or `Reference` would have left dangling
  `assetId` pointers. Fixed with a structural (not enumerated-field-list) scan across
  `document.nodes` and `document.references` that rejects removal with `CONFLICT_ERROR` if the asset
  id appears anywhere. (The command itself was already confirmed unreachable from any MCP tool —
  see below — so this closes a real landmine before it can ever be hit, rather than an active bug.)
  Verified with a new test in `tests/unit/command-engine.test.ts`.
- `TransactionController.commit()` had no `try/catch` around `finalizeDocument`'s post-commit
  validation, unlike `execute()`, which resets state and re-throws symmetrically on any failure. A
  `commit()`-stage validation failure left the transaction stuck in `"OPEN"` while holding the fully
  mutated (never persisted) document — indistinguishable from a live transaction to a caller that
  didn't separately catch and call `rollback()`, three of which (`apps/blender-bridge/src/reconciliation.ts`,
  `packages/project-store/src/store.ts`, `apps/mcp-server/src/tools.ts`'s fidelity-correction path) do
  not. Fixed by wrapping `commit()`'s body symmetrically with `execute()`'s existing
  reset-to-`#initial`/`#state = "FAILED"` pattern. **Not independently regression-tested with a live
  trigger** — the current `CanonicalDesignDocumentSchema` has no cross-field constraint that
  `finalizeDocument`'s version/timestamp mutations could plausibly violate given an already-valid
  working document, so no real path to exercise this branch was found; the fix closes a genuine
  structural asymmetry in the code (confirmed by direct reading) and the full existing transaction
  test suite continues to pass with it in place.
- 40 of the 78 registered MCP tools (all `blender.*`, `camera.create/update`,
  `cinematic.apply_sequence`, `lighting.*`, and most `three.*` mesh/rig/skin/pose/weight/IK tools) are
  permanently disabled in production because `createProductionMcpRuntime` never passes a real
  `blender` adapter — `docs/11_ROADMAP_AND_STATUS.md` previously said "14 disabled-by-default Blender
  tools," a stale count from before the Three.js/rig/skin tool surface grew. **Documentation only**:
  the roadmap's disabled-tool count is corrected below; `apps/studio/src/core/capabilities.ts`
  already has exactly one honestly-documented `NOT_YET_AVAILABLE` capability (`node.reparent`) and
  should be read as covering the deliberately-disabled Blender-gated surface too, not as an
  exhaustive list — this doc is the disclosure of record for that gap.
- The Page domain (`page.delete`, `page.rename`) and `asset.remove` are real, validated, tested
  command types with **no MCP tool and no Studio affordance** — there is currently no way to delete
  or rename a page, or hard-remove an asset, through the product at all. Unlike `node.reparent`
  (honestly documented as `NOT_YET_AVAILABLE`), this gap was previously undisclosed anywhere.
  **Documentation only this pass** — wiring real MCP tools + Studio UI for page/asset lifecycle
  management is a genuine, user-facing feature addition, not a mechanical fix; see "Proposed Future
  Phase: Page & Asset Lifecycle Surface" below.

**MEDIUM — documented, not all fixed**
- The in-memory rate limiter (`apps/mcp-server/src/executor.ts`) is real and genuinely wired into the
  request path, but is single-process only; `docker-compose.yml` provisions a Redis cache service
  that is never actually used anywhere in `apps/`/`packages/`. On any horizontally-scaled deployment
  each replica has an independent bucket, multiplying the effective limit and resetting on
  redeploy. **Not fixed this pass** — see "Proposed Future Phase: Distributed Rate Limiting" below.
- Eight interactive Studio panel components (`AiPanel`, `FidelityWorkspace`, `CanvasNode`,
  `DesignCanvas`, `LeftPanel`, `PropertiesPanel`, `Timeline`, `ViewportControls`) have zero
  component-level render-and-assert test coverage; only `ReferencesPanel` does. The underlying
  session/planner logic these components call into is well-tested, but the components themselves are
  not. **Not fixed this pass** (would be a substantial standalone test-writing effort across ~8
  large components) — see "Proposed Future Phase: Studio Panel Test Coverage" below.
- Four real, registered MCP tools (`three.pose_reset`, `document.get_version`,
  `document.list_versions`, `three.analyze_web_quality`) have zero mention in either roadmap or
  limitations docs. **Documentation only**: noted here as shipped-but-previously-undocumented.
- The roadmap's Block F entry claimed "500/500 tests"; the actual count at the time was 501. This
  pass's own final count is reported in the roadmap update below rather than left to drift again.

**Everything else the three audits checked was confirmed NOT A BUG** — WRITE-tool validation is
centralized and real (not duplicated/inconsistent per tool); LOCAL/REMOTE Studio dispatch shares one
command-engine instance; no silent fallbacks or stubbed handlers were found beyond the disabled-tool
gate above; optimistic-concurrency checks were verified present on all 43 WRITE-classified MCP tools;
auth-mode selection, permission enforcement, and workspace isolation are all genuinely layered and
tested with no bypass found; deployment config accurately reflects "workers not deployed"; the
older Phase 7/8 validation/correction system's disconnection from real fidelity data was already
disclosed in Block F.

### Proposed future phases (not built this pass — genuinely new architecture, not mechanical fixes)

- **Component Materialization.** Reason: `document.components` currently has zero real content
  despite reconstruction detecting real repeated-structure candidates; `COMPONENT_INFERENCE` is a
  claimed capability with no document effect. Dependency: none blocking, but touches the schema's
  component/instance model. Problem: no `component.register` command type exists, and component
  identity/instancing semantics (what makes two detected regions "the same component," how edits to
  one instance propagate) is a real product decision, not a data-plumbing gap. Proposed solution: design
  a `component.register`/`component.instantiate` command pair, decide instance-vs-definition
  propagation semantics, wire `buildCommandPlan` to emit them for `applied`-eligible
  `ProposedComponent`s. Acceptance criteria: a real, repeated visual structure in a reference image
  produces a real `document.components` entry and real component-instance nodes, editable and
  fidelity-measurable the same as any other node. Why not part of A→G: requires a genuine schema/
  product decision this pass's scope (mechanical fixes within existing architecture) explicitly
  excludes.
- **Page & Asset Lifecycle Surface.** Reason: `page.delete`, `page.rename`, and `asset.remove` are
  real, tested command-engine commands with no way to reach them from the product. Dependency: none.
  Problem: no MCP tool or Studio UI affordance exists for deleting/renaming a page or removing an
  asset. Proposed solution: add `page.delete`/`page.rename`/`asset.remove` MCP tools following the
  exact pattern of `document.rename`/`node.delete`, plus Studio UI entry points (page context menu,
  asset browser). Acceptance criteria: a user can delete/rename a page and remove an unreferenced
  asset through Studio, with the same optimistic-concurrency and cross-reference safety already
  proven in the command layer. Why not part of A→G: user-facing feature/UI work, not a fix to
  something already wired.
- **Distributed Rate Limiting.** Reason: the real, wired in-memory rate limiter does not coordinate
  across replicas; Redis is provisioned but unused. Dependency: none. Problem: horizontal scaling
  silently multiplies the effective rate limit and resets it on every redeploy, with no current
  disclosure. Proposed solution: a `RedisRateLimitProvider` implementing the same interface as
  `createInMemoryRateLimitProvider`, selected by runtime config. Acceptance criteria: two replicas
  sharing one Redis instance enforce one real, combined limit. Why not part of A→G: a genuine new
  infrastructure integration and failure-mode surface (Redis unavailable, latency budget), not a
  same-file fix.
- **Studio Interactive Panel Test Coverage.** Reason: eight large, user-facing panel components have
  no render-level test coverage. Dependency: none. Problem: regressions in these components'
  rendering/interaction logic (as opposed to the session/planner logic they call) would not be
  caught by the existing test suite — the AiPanel duplicate-key bug found live in this pass is a
  concrete example of the kind of defect this gap misses. Proposed solution: React Testing Library
  render-and-interact tests for each panel, starting with `AiPanel` and `FidelityWorkspace`.
  Acceptance criteria: each panel has at least one test that renders it, drives a real interaction,
  and asserts on rendered output. Why not part of A→G: substantial standalone test-authoring effort
  across many large components, not a targeted fix.
- **Internationalization.** Reason: zero i18n/locale infrastructure exists anywhere in
  `apps/studio/src`, and — unlike backup/observability/load-testing/accessibility, which are
  explicitly scoped into the existing "Phase 24 — Production Hardening" roadmap entry — this gap was
  previously completely unacknowledged. Dependency: none blocking. Problem: no locale library, no
  externalized strings, no RTL consideration anywhere in the UI. Proposed solution: adopt a standard
  i18n library, externalize Studio's UI strings, decide locale-detection/switching UX. Acceptance
  criteria: Studio renders correctly in at least one non-English locale end to end. Why not part of
  A→G: a genuine new product surface and UX decision, not a fix to existing broken behavior.

---

## Block H — Component Materialization + Page/Asset Lifecycle Surface (2026-08-16, IN PROGRESS)

Governing instruction: "BLOCK H + FINAL — COMPLETE THE SYSTEM + FINAL FORENSIC ACCEPTANCE," 16
sub-items (H1–H16), executed in batches per explicit user instruction. **H1 (CRITICAL), H2/H3
(HIGH), Batch 1 (H4/H5), Batch 2 (H6/H7), Batch 3 (H8/H9/H10), and Batch 4 (H11/H12/H13) are closed
to the extent honestly possible. H14–H16 have not been started — listed honestly below, not silently
dropped.**

**H1 — Component materialization: CLOSED.** See `docs/11_ROADMAP_AND_STATUS.md`'s new "Block H"
entry for full detail. Summary: reconstruction's component candidates now really materialize into
`document.components` with real `COMPONENT_INSTANCE` nodes, proven end to end against a real image
(not a hand-authored fixture) through the real `asset.register`/`reconstruction.import_reference` MCP
path, including real renderer output for the projected instances.

**H2/H3 — Page and asset lifecycle MCP surface: CLOSED.** `page.create`/`page.delete`/`page.rename`/
`asset.remove` are now real MCP tools with real tests through the MCP layer (stale-version rejection,
dry-run, cross-reference rejection with zero partial write). Documented as honest
`NOT_YET_AVAILABLE` Studio capabilities — the MCP surface is real, Studio's UI for it is not.

**A real, incidentally-found bug fixed**: `apps/mcp-server/src/executor.ts`'s `normalizeError` used a
regex over the error message to detect Command Engine rejections, silently misclassifying any
rejection whose message didn't contain a magic keyword (found via `"Component X already exists."`)
as `MCP_INTERNAL_ERROR` — indistinguishable from a real server crash to a caller. Fixed to check
`instanceof CommandEngineError` directly.

**H4 — Distributed rate limiting: CLOSED (Batch 1).** Real Redis-backed provider, atomic sliding
window via Lua EVAL, wired into production runtime, fails closed on backing-store error. Real
distributed-enforcement test dynamically skips (not fabricated) since no live Redis is reachable in
this sandbox — see `docs/11_ROADMAP_AND_STATUS.md`'s "Block H Batch 1" entry.

**H5 — Studio panel test coverage: substantially closed (Batch 1).** Real render tests for AiPanel
(7 tests, driving the real deterministic planner/engine/approval flow) and FidelityWorkspace (3
tests, empty/success/failure states) — the two highest-value, previously-untested panels. The MCP
capability/gateway layer was already covered by `studio-production.test.ts`.

**H6 — Typography/line-wrap fidelity: investigated, genuinely not closable this pass without real
OCR-pipeline surgery — not faked.** `compareStructuralFidelity`'s `LINE_BREAKS` comparator is real
and complete; what's missing is real "expected" (per-line reference bboxes) and "actual" (live
shaped-text) data. Traced the exact reason the "expected" side doesn't exist: OCR's
`recognizeLines()` genuinely returns real per-line bboxes, but `detectTextRegions`
(`packages/reconstruction-vision/src/manifest-builder.ts`) only uses them to localize candidate text
blocks before a second whole-block re-OCR pass collapses each block back into one merged region —
the real per-line breakdown is discarded, not merely unexposed. See
`docs/11_ROADMAP_AND_STATUS.md`'s "Block H Batch 2" entry for full detail.

**H7 — Gradient/crop/stroke fidelity attribution: gradient CLOSED (real test); crop wired but
untested; stroke left as an honest gap.** `ReferenceRecordSchema.regions[]` gained optional real
`gradient`/`crop` fields (populated from data reconstruction already computes), and
`buildStructuralExpectations` now emits real `GRADIENT`/`CROP` expectations reaching
`compareStructuralFidelity`'s pre-existing, already-tested comparators for both — the same class of
gap Block F closed for `BOUNDS`. Gradient has a real acceptance test proving a genuine
`GRADIENT_STRUCTURE_MISMATCH` when a reconstructed gradient shape's fill is swapped to solid. Crop's
wiring is real but not independently test-proven this pass. Stroke has no structural comparator to
wire at all (would be new comparison-logic architecture, not existing-logic wiring) — left as the
same honest gap Block F already documented.

**A correction to Batch 1's own claim**: the `tesseract.js` OCR-cache-directory fix
(`DEFAULT_OCR_CACHE_DIR`) was described as resolving the network-flake issue; re-testing during
Batch 2 found the cache directory is never actually populated, so that fix's real effect on the
flake is unconfirmed — the flake itself is real, pre-existing, and unrelated to Block H's functional
changes (every affected test passes reliably in isolation), but it remains a genuinely open,
disclosed external-dependency reliability issue, not a solved one.

**H8 — Repo-wide honesty/fabrication audit: CLOSED (Batch 3).** A fresh sweep across all of
`packages/*/src`, `apps/*/src`, `exporters/*/src` (broader than Block G's earlier 4-directory scope)
found 2 real issues, both fixed:
- Dead configuration removed: `AEVUM_FEATURE_FLAGS` (`packages/shared/src/env.ts`) was parsed and
  exposed as `environment.featureFlags` but had zero real consumers anywhere in the repo — removed
  the env var, schema field, computed value, and its stale test assertion.
- **A real scoring-honesty issue investigated and documented, not narrowly patched — see the
  standalone entry below ("Fidelity `overall` score can include unmeasured domains at full weight").**

Everything else traced (26 explicitly self-labeled `PHASE_0_SHELL` packages, the dev-only in-process
MCP fixture gated behind `import.meta.env.DEV`, capped heuristic confidence values, an intentionally
-unimplemented `beginNested()` that throws rather than silently no-ops, disclosed AABB-only
part-overlap diagnostics, a disclosed rig/skin scope boundary, and 3 narrowly-justified
`biome-ignore` hits) was confirmed already honestly disclosed, not a new finding.

**H9 — MCP/command/capability consistency matrix: CLOSED (Batch 3).** Built the full command-engine
→ MCP-tool → Studio-capability-registry → Studio-UI → test matrix. Real gaps closed:
- Added `timeline.create`/`timeline.update`/`timeline.delete` as real MCP tools — the Command Engine
  had real logic for all three but zero external exposure at all (only the read-only `timeline.get`
  existed). Real integration test: `tests/integration/mcp-timeline-reference-lifecycle.test.ts`.
- Added `reference.register` as a real MCP tool, closing an asymmetry versus its sibling
  reconstruction-internal commands (`page.create`/`component.register`/`asset.register`, which all
  got standalone tools in Blocks H1–H3) that `reference.register` had been missing. Same test file
  covers create + dry-run + duplicate rejection.
- **Fixed a real gateway-bypass bug**: `apps/studio/src/main.tsx`'s References panel called
  `client.invoke("reference.update", ...)` directly, bypassing `StudioSession`'s command gateway even
  though the capability registry documents `reference.update` as gateway-routable — skipping the
  client-side dry-run pre-flight and permission short-circuit every other routable write gets
  (server-side authorization was never actually bypassed; H10 independently confirmed every write is
  re-checked server-side regardless of call path). Fixed by adding a real `updateReference` method to
  `StudioSession` and switching the References panel to use it. Regression test added in
  `tests/unit/studio-components.test.tsx`.
- **Corrected two mislabeled capability-registry entries**: `node.create` and `document.rename` were
  documented `AVAILABLE` despite no real Studio UI ever calling them (the toolbar only sets an
  `activeTool` state; `StudioSession` has no `renameDocument` method) — directly violating the
  registry's own "only capabilities Studio's actual UI exercises today are listed" rule. Corrected to
  `NOT_YET_AVAILABLE` with honest reasons rather than building speculative UI to make the label true.
- **One further finding investigated and deliberately left as a disclosed limitation — see the
  standalone entry below ("Canonical delete tools share a permission tier with non-destructive
  writes").**

**H10 — Security/authorization forensic pass: CLOSED (Batch 3).** A fresh, independent audit (not
reusing Block G's earlier conclusions) covering the new Redis rate limiter's key-construction safety,
workspace/project/document scoping at the Supabase query layer, the newer WRITE tools' permission
gating, the client-vs-server enforcement boundary, and auth/idempotency edge cases. **No
CRITICAL/HIGH found.** One LOW fixed: Redis connection/rate-limit error logging
(`apps/mcp-server/src/runtime.ts`) didn't pass error strings through the existing `redactSecrets`
utility, inconsistent with the one call site that does (low practical exposure — server-side logs
only).

**H11 — Transaction/failure/recovery forensics: CLOSED (Batch 4).** A fresh sweep for the same class
of defect as the already-fixed `TransactionController.commit()` asymmetry (a later stage of a
multi-stage write failing while an earlier stage's real side effect stands, uncompensated), across
every other real mutation pathway. Confirmed genuinely safe: the atomic
`aevum_mcp_commit_document` Postgres RPC (document + audit + version-history + idempotency all in one
row-locked transaction), `reconstruction.import_reference`'s explicit `rollback()` on mid-sequence
command failure, and `fidelity.measure`'s report/correction/validation-record sequencing. Two real,
new findings, both documented rather than fixed this pass — see the standalone entries below
("Asset storage bytes can be orphaned on a routine VERSION_CONFLICT" and "Blender reconciliation
commits a placeholder asset URI before the real storage write").

**H12 — Full real pipeline integration: CLOSED (Batch 4).** One single, real, chained test
(`tests/integration/mcp-full-pipeline-integration.test.ts`) proves every stage the block asked for:
real `asset.register` (local vision analysis) → real `reconstruction.import_reference` (real
component materialization, Block H1's exact mechanism) → real renderer projection → real
`fidelity.measure` (node-attributed mismatch detection) → real `autoCorrect` (reference-pixel-sampled
correction, Block E5's exact mechanism) → real renderer projection again → real `fidelity.measure`
again, with a genuinely measured score improvement. Building it surfaced two real, previously-unknown
characteristics of the correction engine (traced via live, temporary instrumentation of
`packages/fidelity/src/orchestrator.ts`, not guessed) — see the standalone entry below ("Real
fidelity/autoCorrect characteristics discovered while building Block H12").

**H13 — Performance/resource safety: CLOSED (Batch 4).** A real investigation measured actual
repeated-operation loops (50+ iterations) against real Command Engine/`ProjectStore`/session/
rate-limit/quota code — not estimates. **Fixed**: the in-memory rate-limit provider
(`apps/mcp-server/src/rate-limit.ts`, the fallback path used only when Redis isn't configured) and the
in-memory vision quota tracker (`packages/vision/src/quota.ts`) both kept a permanent Map entry for
every distinct key ever seen, even once its own timestamps had fully expired — unbounded growth over
a long process lifetime, most concerning for the rate limiter's `ip`-scoped key since distinct client
IPs aren't bounded by real tenant count. Fixed both to delete the Map key once its pruned entry is
empty. **Documented, not fixed** (a real product decision, not a memory-safety bug) — see the
standalone entry below ("ProjectStore undo/redo history grows unbounded"). Confirmed NOT a problem:
component registration under repetition (real `DUPLICATE_ID`/root-ownership guards reject reuse
deterministically) and Studio session listener subscribe/unsubscribe (no leak at its one real call
site).

**H14–H16 — NOT STARTED THIS PASS. Honest scope of what remains:**
- 🔴 **H14 (final parallel forensic audit)** — not run this pass; Block G's three-part forensic audit
  is the most recent one, and is now several real engineering passes out of date (doesn't know about
  H1–H13's changes).
- 🔴 **H15 (missing phase/block detection)** — not performed as its own dedicated comparison pass
  this time.
- 🔴 **H16 (final acceptance gate)** — `pnpm validate` has passed clean after every batch through
  Batch 4 (exact current test/file/package counts are stale the moment a new batch adds tests; H16
  will report the final real count), but the live-Studio 19–20-point checklist H16 specifies
  (component materialization, gradient/stroke/image/text rendering, correction/autocorrect, approval
  flow, repeated operations, etc.) was not run against the current dev server this pass.

None of H14–H16 were silently skipped or claimed done — they are unstarted, and this section exists
so a future pass (or this same session, continued) has an accurate, non-overlapping starting point
rather than re-deriving what Blocks G/H Batches 1–4 already covered.

### Asset storage bytes can be orphaned on a routine VERSION_CONFLICT (H11 finding, documented not fixed)

**What's real**: `asset.register`'s real handler (`apps/mcp-server/src/tools.ts`) writes bytes to
content-addressed object storage (`adapters.assetStorage.storeOriginal`/`storeDerivative`, a real,
externally observable side effect) *before* the atomic document commit
(`repository.commitDocument`, `executor.ts`) runs. If the commit fails — most realistically a
`VERSION_CONFLICT`, the expected, routine outcome of two clients racing a write against the same
document, exactly what optimistic concurrency is designed to produce — the request fails cleanly for
the caller, but the bytes already written to storage in step one are never removed.

**Why it's real and not theoretical**: `AssetStorageAdapter` (`packages/assets/src/storage.ts`) has
no delete/compensation method at all — there is structurally no way to undo the storage write once
made. Any concurrent `asset.register` calls against the same document will reliably orphan the
loser's bytes. Since storage paths are content-hash-addressed, a *successful retry with the same
bytes* reuses the same path harmlessly — but a retry that never happens (the client gives up, or picks
different content) leaves a permanent, invisible, unbilled-for-cleanup leak with no record and no
reconciliation job anywhere in the codebase.

**Why not fixed this pass**: a naive "delete the bytes on commit failure" compensation would be
actively dangerous, not merely incomplete. Because storage is content-addressed and deduplicated, the
exact same storage path can legitimately be shared by a *different* asset with identical byte content
— blind deletion on one caller's failure could silently corrupt another, unrelated caller's
successfully-committed asset. A safe fix needs real reference counting or a scheduled garbage-
collection reconciliation pass (delete only objects with zero real document references, on a
schedule, never inline on a single failed request) — genuine new infrastructure, not a same-file
patch, and risky to build under this pass's time pressure. Flagging the danger of the "obvious" fix is
itself part of this finding.

### Blender reconciliation commits a placeholder asset URI before the real storage write (H11 finding, documented not fixed, currently dormant)

**What's real**: `createBlenderReconciliationProposal` (`apps/blender-bridge/src/reconciliation.ts`)
builds its `asset.register` command with `source.uri` hardcoded to a symbolic
`blender://${jobId}/result.glb` placeholder, and `applyBlenderReconciliation`
(`apps/blender-bridge/src/mcp-adapter.ts`) commits that command into the document *before*
`options.persistArtifact(...)` (the real byte write) is even attempted. `persistArtifact` returns
`Promise<void>` with no way to hand back a real URI, and nothing patches the committed asset's
`source.uri` afterward — the document permanently records the placeholder, and
`packages/project-store/src/supabase.ts`'s `assetStoragePath()` requires a `supabase-storage:`-
prefixed URI (throwing `PERSISTENCE_ERROR` otherwise), so such an asset would be unreadable through
the real Supabase-backed storage regardless of whether the bytes were actually written correctly.
`persistArtifact` is also optional with no production implementation found anywhere in the repo (only
a test stub) — a genuinely wired deployment could commit the document reference with real bytes never
written at all.

**Why not fixed this pass**: confirmed currently dormant — every `blender.*` write tool is
permanently disabled in production (`createProductionMcpRuntime` never passes a real Blender
adapter), so this path cannot be reached in the shipped product today. Flagged because it would
become a real, live defect the instant Blender integration is enabled, and the real fix (deferring the
`asset.register` commit until after a real `persistArtifact` call returns a real URI, or giving
`persistArtifact` a return value the caller can patch into the command before committing) touches the
Blender integration's own contract, not something to redesign in passing.

### Real fidelity/autoCorrect characteristics discovered while building Block H12 (documented, not fixed)

Building H12's single chained pipeline test surfaced two real, previously-undocumented
characteristics of the production correction engine (`packages/fidelity/src/orchestrator.ts`), found
by live, temporary instrumentation of the actual code (added, run, observed, then reverted — never
left in place) rather than guessed at from reading alone.

1. **Single-top-candidate selection can be starved by real rendering noise on component instances.**
   `prioritizeFidelityIssues` sorts candidate mismatches by causal depth, then domain priority, then
   confidence descending, then an opaque hash-based issue-id comparison as the final tiebreak — never
   by mismatch magnitude. A COLOR/fill check's `confidence` is always exactly `1.0`, so for any
   document with more than one real COLOR candidate, the outcome reduces to that hash tiebreak,
   completely disconnected from which mismatch is actually larger or more real. Worse: when a
   component's shared root color is perturbed, every real `COMPONENT_INSTANCE` that projects it
   (carrying no per-instance override) shows the identical mismatch too, multiplying the candidate
   pool — and `propose()`'s only node-type gate is "the WINNING candidate must be a plain SHAPE, or
   propose nothing at all," never "try the next-best candidate." Real, inescapable sub-pixel rendering
   noise on those instances (Playwright's rasterization vs. sharp's, most visible at anti-aliased
   rounded-corner edges) was consistently enough to win that hash tiebreak over a much larger,
   deliberately-introduced mismatch on a genuine plain SHAPE, causing `propose()` to reject the whole
   candidate list and skip correction entirely.
2. **The correction loop can stop with `TARGET_REACHED` before ever attempting a fix.** The loop's
   first step each pass re-measures the current document and stops immediately if the aggregate score
   already clears the active profile's `targetScore`/`domainThresholds` — *before* calling the
   correction adapter at all. Confirmed by direct instrumentation: against a real, single, isolated,
   deliberately-wrong SHAPE (no component instances involved at all), the STANDARD profile's
   comparatively permissive thresholds (target 0.90, domain ~0.86) were still cleared by the aggregate
   score even with an obvious, visible red-vs-green color error sitting right there — the one bad
   region's penalty, averaged across all measured regions in its domain, wasn't enough to fail the
   bar. The correction loop is satisfied and never attempts a fix, even though a real defect exists.
   This is a genuinely separate mechanism from finding 1 — it never gets far enough to reach candidate
   selection at all. A stricter profile (HIGH_QUALITY, 0.96/~0.93) is enough to avoid this specific
   trap for a single, isolated mismatch.
3. **A related, third, more minor observation**: at MAXIMUM_FIDELITY's much tighter margin
   (0.985/~0.97), real Playwright raster nondeterminism (sub-pixel/anti-aliasing variance between
   otherwise-identical renders of the exact same document) was close enough to that margin to flip the
   pass/fail outcome between repeated runs of the identical test. This is a real rendering-
   reproducibility characteristic worth knowing about for anyone building tests or tooling near that
   profile's threshold, not specific to auto-correction.

**Why not fixed this pass**: H12 asked this pass to prove the real pipeline composes end to end, not
to redesign the correction engine's candidate-selection algorithm (falling through to the next-best
candidate, or weighting by real magnitude instead of an opaque hash) or its early-stop condition
(e.g., requiring the correction adapter to be consulted whenever ANY BLOCKING/ERROR-severity issue
exists, regardless of the aggregate score). Both are genuine, non-trivial algorithm design decisions
with real behavioral consequences for every other real caller of `fidelity.measure`'s `autoCorrect`
flag, not a same-file bug fix.

### ProjectStore undo/redo history grows unbounded (H13 finding, documented not fixed)

**What's real**: `ProjectStore`'s own `entries` history array (`packages/project-store/src/store.ts`)
grows exactly 1:1 with every `execute()`/`transact()` call, forever, with no cap, no truncation, and
no eviction anywhere in the module — confirmed via a real, measured 50-command loop (50 creates +
50 deletes → 101 real history entries, one per command). This backs `apps/studio/src/core/session.ts`
directly, in both LOCAL and REMOTE mode (`executeRemote()` calls `store.execute()` too), so every real
Studio session accumulates undo history without bound for as long as it stays open. The live document
itself does not leak (node counts return to baseline correctly after create+delete cycles) — this is
specifically about the separate undo/redo bookkeeping array, and each entry retains the full commands,
changeSet, audit record, and events for that transaction.

**Why not fixed this pass**: capping or evicting old entries changes real, user-facing undo/redo
behavior — specifically, how far back a user (or an agent looping many small edits) can actually undo.
That is a genuine product decision (how much undo history is enough, and what happens at the boundary:
silently drop the oldest entry, warn the user, or something else) rather than a memory-safety bug with
one obviously-correct fix, so it is disclosed here rather than patched unilaterally.

### Fidelity `overall` score can include unmeasured domains at full weight (H8 finding, documented not fixed)

**What's real**: `createValidationReport`'s `scores()` function
(`packages/validation/src/report.ts`) computes `overall` as a fixed weighted sum of 6 domain scores
(layout 25%, typography 20%, asset 15%, component 10%, structure 20%, raster 10%). Every domain's
score itself is computed from real, genuine comparisons wherever content exists to compare.

**What's not honest**: when a document has zero applicable content for a domain — e.g. no `TEXT`
nodes at all, so there are zero typography checks — `metricAverage` returns `1` (a perfect score) for
that domain rather than excluding it, and that `1` counts at the domain's full fixed weight toward
`overall`. A document that never exercises typography gets 20% of its `overall` score "for free" from
a domain that was never actually measured. The same convention (`X → 1` when not applicable/not
requested) appears in six further sub-scores inside `compareStructuralRegions`
(`packages/validation/src/compare.ts`): `hierarchyScore`, `constraintScore`, `renderGraphScore`,
`componentScore`, `tokenScore`, `paintOrderScore` — all default to "pass" when a caller's
`requestedMetrics` opts a category out, which is a legitimate, intentional semantic for explicit
opt-out but indistinguishable in the schema from "there was nothing to check for this document."

**Why not fixed this pass**: correcting only the 3 domains `metricAverage` touches would be a
half-fix leaving the other 6 sub-scores with the identical behavior. Fixing all 9 consistently
requires a genuine product decision — does "never measured" mean "excluded from the aggregate
average (renormalize over what was measured)," "counts as failed (0)," or something else — with real
blast radius: every existing document lacking some content category (e.g. a pure-shape mockup with
no text) would see its `overall` fidelity score change, and the current validation/fidelity test
suite has tests that assert today's "defaults to 1" behavior directly, so fixing this without
breaking them requires updating those tests' expectations too, which is itself a decision about what
"correct" now means, not merely a bug fix.

**Recommended fix, not applied**: renormalize `overall` over only the domains/sub-scores that had at
least one applicable check for this specific measurement, and surface which domains were actually
measured (e.g. a `measuredDomains: readonly string[]` field) in `ValidationScoreSummary` so UI and
API consumers can distinguish "matched" from "not evaluated" instead of both reading as a flat `1`.

### Canonical delete tools share a permission tier with non-destructive writes (H9 finding, documented not fixed)

**What's real**: `node.delete`, `page.delete`, and `asset.remove` (`apps/mcp-server/src/tools.ts`)
all require `["document.write"]` (asset.remove additionally `["asset.write"]`) — real permission
checks, real enforcement, confirmed by H10 to have no bypass.

**What's inconsistent**: this is the *same* permission tier as non-destructive writes like
`node.update`/`token.register`. Compare the Blender surface: `blender.delete_object` requires an
*elevated* `blender.destructive` permission (`tools.ts`), deliberately withheld from the `EDITOR`
role (`packages/mcp-protocol/src/permissions.ts`) — so an `EDITOR` cannot delete a Blender-managed
object, but the same `EDITOR` *can* permanently delete a canonical page's entire subtree or a
canonical node/asset with no additional permission beyond ordinary write access. The concept of "this
needs extra scrutiny" already exists in the codebase (`StudioCapabilityClassification`'s
`DESTRUCTIVE_WRITE` value, `apps/studio/src/core/capabilities.ts`) — it was just never wired into the
real MCP permission model for canonical-document deletes the way it was for Blender.

**Why not fixed this pass**: H10 confirmed this is not an exploitable security gap — `EDITOR` is
already a trusted role with `document.write`, and no unauthorized actor gains anything from this
inconsistency. But adding an equivalent elevated permission (e.g. a new `document.destructive`
requirement) would be a genuine, breaking product decision: every existing `EDITOR` currently can
delete nodes/pages/assets today, and requiring a new permission would revoke that ability unless the
role-to-permission mapping is also changed to grant it — a call about who should be trusted with
destructive canonical operations, which is the user's call to make, not something to silently change
mid-audit.

---

## Is the annotated poster image editable?

**No — the annotated PNG sent in this conversation is a static diagnostic visualization only.**
It was generated by drawing colored bounding-box overlays over the original poster with `sharp`,
purely so the detected regions could be seen at a glance. It is not a Studio document, not a set of
canonical nodes, and has no editable state of its own.

What **is** editable is the canonical document `reconstruction.import_reference` actually produces
(demonstrated in STEP 7/11 above) — real `DesignNode` objects a user can select, move, resize,
rename, retype (for TEXT), undo/redo, save, and reload in Studio, using the same infrastructure any
other canonical node uses. Within that, by node type:

- **TEXT nodes** — fully editable, including retyping the actual recognized string.
- **SHAPE nodes** — position/size/fill color are real and editable; corner radius and ellipse vs.
  rectangle are both really detected from pixels (Block C3) and — as of Block G's forensic-audit
  fixes — really rendered by `packages/renderer-2d` too, not just Studio's own canvas (see
  `packages/renderer-2d/src/styles.ts`'s `geometryCornerRadii`/`geometryStrokeWidth` fallback); no
  arbitrary vector path is ever detected, so non-rectangular/non-elliptical shapes still fall back to
  a bounding rectangle.
- **IMAGE nodes** — position, size, and crop window are real and editable in every case. For
  regions in a sane size/area range, the pixels are now also a real, independently extracted and
  stored derived asset (`extracted: true`, with real DERIVED lineage back to the source); for
  regions outside that range (too small, or nearly the whole source image), the pixels remain a
  crop of the one original source asset (`extracted: false`) — editable in position/size/crop
  window, but not independently replaceable or exportable in isolation from the source photo.
