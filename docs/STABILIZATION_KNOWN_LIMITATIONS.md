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
- **SHAPE nodes** — position/size/fill color are real and editable; shape is always a plain
  rectangle (no corner radius or vector path is ever detected).
- **IMAGE nodes** — position, size, and crop window are real and editable in every case. For
  regions in a sane size/area range, the pixels are now also a real, independently extracted and
  stored derived asset (`extracted: true`, with real DERIVED lineage back to the source); for
  regions outside that range (too small, or nearly the whole source image), the pixels remain a
  crop of the one original source asset (`extracted: false`) — editable in position/size/crop
  window, but not independently replaceable or exportable in isolation from the source photo.
