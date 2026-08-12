import type { PackageContract } from "@aevum/shared";

export { createAnimationEngine } from "./engine.js";
export { evaluateEasing } from "./easing.js";
export { evaluateAnimationState, createStateMachine } from "./state-machine.js";
export { createTimeline, evaluateTimeline } from "./timeline.js";
export { validateBoneTracks, validateStateMachine, validateTimeline } from "./validation.js";
export type * from "./types.js";

export const packageContract: PackageContract = {
  name: "@aevum/animation-core",
  kind: "package",
  responsibility: "Canonical timeline and state-machine creation, validation, and deterministic fixed-time evaluation.",
  owns: "Animation evaluation, easing, interpolation, reduced-motion selection, and animation diagnostics.",
  mustNotOwn: "Canonical document mutation, playback loops, browser APIs, renderer state, or exporter adapters.",
  status: "IMPLEMENTED",
};

export const ANIMATION_CORE_STATUS = packageContract.status;
