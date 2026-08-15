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
- 🟡 **Only 4 command types are mapped**: `node.create`, `node.update`, `node.delete`,
  `document.rename`. Every other Command Engine type Studio's local session can construct
  (`node.move`, `node.duplicate`, `material.update`, `light.update`, `page.*`, `lighting.*`,
  `camera.*`, `scene3d.import`, …) is honestly rejected with "no MCP tool mapping exists for it
  yet" — not silently dropped, but also not usable remotely. `session.ts`'s `moveNode`/
  `duplicateNode` already throw explicitly in REMOTE mode for this reason (pre-existing, not new).
- 🟡 **Capability check is a single snapshot at session bootstrap.** `client.discoverCapabilities()`
  is called once when `loadProductionStudioProject()` runs. If an admin changes the signed-in
  user's role mid-session, Studio's local allow/deny check won't reflect it until next reload —
  the *server* still independently re-checks every write (this is not a security gap), but the
  client-side pre-check can be stale for the rest of that session.
- 🔴 **No client-side capability re-fetch / invalidation mechanism** exists at all.

---

## STEP 4 — Studio AI panel → real Agent Planner

**What it is:** `apps/studio/src/main.tsx`'s `AiPanel` now builds a real `AgentGoal`/`AgentSession`
and drives them through `createAgentEngine()` (`@aevum/agent-runtime`) with
`createDeterministicReasoningProvider()`, a real MCP client from `agentContext.createMcpClient()`,
and real capability/permission gating inside the engine itself. This is not a second, parallel
agent architecture — it's the same one `packages/agent-planner`/`packages/agent-runtime` already
implement, previously only exercised by tests.

**Limitations:**
- 🟡 **No natural-language understanding anywhere.** `deriveChangesFromPrompt()` is deliberate
  keyword matching (`rename to "..."`, `center`, `bigger`/`smaller`, `left`/`right`/`up`/`down`
  with optional `NNpx`) that produces a structured `parameters.changes` object before the real
  engine ever runs. A prompt it can't map returns `undefined` and the panel says so honestly
  ("Could not map ... to a supported edit") rather than guessing. This was a deliberate,
  documented decision (research confirmed zero NLP exists anywhere in this codebase), not an
  oversight — but it means the AI panel cannot act on open-ended instructions.
- 🟡 **Only ever edits one already-selected node.** `run()` operates on `selected[0]` (or the first
  root node); there is no multi-node selection support, no node creation or deletion via the AI
  panel, no cross-node instructions ("make all headings bold").
- 🔴 **The approval adapter is a stub that fails closed, with no real UI.**
  `createDeterministicApprovalAdapter()` is called with no arguments, so its `approvedStepIds`/
  `approvedTools` sets are always empty — **every** plan step that requires approval is
  automatically *rejected*, not auto-approved. Today this doesn't bite because `node.update` isn't
  a `DESTRUCTIVE_WRITE` step, but the moment AI-panel capability grows to include anything that
  requires approval (e.g. delete), those runs will fail outright with no way for a user to approve
  them, because there is no approval UI anywhere in Studio yet.
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
- 🟡 **IMAGE regions are never independently extracted.** Every IMAGE-category node is
  `image: { fit: "COVER", extracted: false }` — a crop-window into the *original* single source
  asset, not its own standalone image file. See STEP 7 below for what this means for editability.
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
- 🟡 **Every import creates a brand-new PAGE, not a merge into the current layout.**
  `createReconstructionProposal()` always builds a new `page`/`frame` pair (reusing the *document*
  if one exists, via `existingDocument`, so it doesn't wipe other pages — but it never intelligently
  merges reconstructed content into an already-open page/frame). Importing a reference into a
  project with existing work adds a new page alongside it, it does not overlay/replace content on
  the page you're looking at.
- 🟡 **IMAGE nodes reference a crop of the single original source asset, not an extracted file**
  (same root cause as STEP 5's `extracted: false`). This is real and editable at the *node* level
  (you can move, resize, or change the crop window), but you cannot independently replace or paint
  over just that region's pixels without it still reading from the one shared source image. See the
  direct answer on "is the image editable" below.
- 🟡 **No response streaming / progress feedback during the import itself.** Studio's References
  panel shows coarse stages (Uploading… / Analyzing… / Creating editable layers…) driven by which
  MCP call is in flight, not real per-region progress from the engine (the engine call itself is
  a single synchronous request-response, consistent with STEP 4's engine also being non-streaming).
- 🟡 **Reconstructed nodes carry no automatic “fidelity” evaluation.** They land in the document
  exactly like any other node — nothing computes or stores a `ValidationRecord` for them (see
  STEP 8 below); "how close is this to the source" is not measured.
- 🟢 **Undo/redo/save/reload work correctly for reconstructed content** because reconstructed nodes
  are ordinary canonical nodes — this relies on already-existing, already-tested Command Engine /
  `ProjectStore` machinery, not anything new built in this block.

---

## STEP 8 — "Real" Fidelity workspace data

**What it is:** `FidelityWorkspace` now reads `document.validations` and shows real per-domain
scores when a `ValidationRecord` exists, and an honest "Not evaluated" empty state when it doesn't.

**Limitations:**
- 🔴 **Nothing in this codebase ever writes a `ValidationRecord`.** No Command Engine command,
  worker, or MCP tool populates `document.validations` — `fidelity.validate_report`/
  `fidelity.propose_corrections` are stateless validators that take an externally-supplied report
  as *input*, they don't compute or persist one. In practice, `FidelityWorkspace` will show "Not
  evaluated" for every real document today, because there is currently no path that ever produces
  a real fidelity report to display. This is the honest, correct behavior per the explicit
  instruction ("show 'Not available' rather than inventing scores") — but it also means this UI is
  not yet backed by any live capability, only by the *possibility* of one if a report is ever
  written.
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
- 🟡 **"Replace reference" is not wired.** Only the new "Import reference" (adds a reference) path
  works; there is no replace/delete-reference flow.

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
- 🟡 **The tab-return fix is verified by code-level analysis of the mechanism, not by reproducing
  the delay against the real production deployment** — local dev-fixture mode has no real Supabase
  auth session to trigger a genuine background refresh against, so this couldn't be timed
  end-to-end locally. The causal mechanism (new session object → effect re-run → full reload) is
  unambiguous in the code as written, which is why this is still reported as a real fix, not a
  guess — but production confirmation is still open.

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
- **IMAGE nodes** — position, size, and crop window are real and editable; the underlying pixels
  are **not** an independently extracted image file, they're a crop of the one original source
  asset (`extracted: false`), so you can move/resize/recrop the window but not edit that region's
  pixel content in isolation from the source photo.
