# @aevum/animation-core

The Phase 10 Animation Core is the deterministic, renderer-independent animation authority for AEVUM. Canonical
timelines and state machines live in the Canonical Design Document; this package creates, validates, and evaluates
those records without browser, CSS, GSAP, Framer Motion, or Three.js runtime objects.

`evaluateTimeline()` accepts fixed time or normalized progress and returns immutable target/property values. Scene
Runtime applies node-targeted values after responsive resolution and before Render Graph construction. Reduced-motion
policies select a canonical alternate timeline when present, otherwise they deterministically shorten or disable the
base timeline.

The package does not mutate documents. Persisting a timeline uses the Command Engine's `timeline.create` command.
The animation worker is in-memory only and has no listener, start command, or active Railway service.
