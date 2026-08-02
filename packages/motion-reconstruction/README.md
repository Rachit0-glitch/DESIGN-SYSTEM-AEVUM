# @aevum/motion-reconstruction

The Phase 11 Motion Reconstruction Engine converts deterministic video or image-sequence frame evidence into editable
Phase 10 timelines. Replaceable frame providers supply validated observations; the core detects property tracks,
camera movement, timing changes, and editable keyframes, then produces reviewable `timeline.create`,
`timeline.update`, or `timeline.delete` Command Engine plans.

The package never decodes video, plays animation, mutates a document, renders video, generates motion, or calls
provider-specific runtimes. FFmpeg, OpenCV, MediaPipe, and Blender remain future adapters. The current deterministic
provider is fixture and metadata driven.

## Public API

- `createMotionTask()` creates an immutable, versioned analysis request.
- `analyzeMotion()` converts frame observations into traceable object and camera tracks.
- `detectKeyframes()` preserves starts, ends, stops, direction changes, easing changes, and visibility changes.
- `generateTimelineProposal()` creates one canonical timeline and one reviewable Command Engine plan.
- `validateMotion()` reports missing frames, invalid timing, targets, paths, tracks, interpolation, and timelines.
- `createMotionReport()` records confidence, evidence, diagnostics, command intent, and Animation Core samples.
- `createMotionEngine()` composes the deterministic pipeline without executing its command plan.

## Architecture

`MotionFrameProvider` is the only frame-source contract used by analysis. The Phase 11 provider consumes validated
frame metadata; later FFmpeg, OpenCV, MediaPipe, or Blender adapters can implement the same contract without changing
analysis or proposal code. Every detected track carries confidence, source-frame indexes, evidence strings, and
diagnostics.

Timeline proposals use the Phase 10 Canonical Timeline schema. Persistence is represented only as a single
`timeline.create`, `timeline.update`, or `timeline.delete` command in a deterministic transaction plan. Callers must
review, dry-run, and execute that command with the Command Engine. The inactive worker is an in-memory composition
boundary and has no listener, queue, upload, persistence, or deployment entrypoint.

## Current Limits

The deterministic provider does not decode media or infer pixels. Scene cuts, optical flow, object discovery,
occlusion recovery, audio synchronization, real heatmaps, and rendered-video comparison require future adapters.
Character landmarks, contacts, retargeting, foot locking, and generated motion remain later character-animation work.
