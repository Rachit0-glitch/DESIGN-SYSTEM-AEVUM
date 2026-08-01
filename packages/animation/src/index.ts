import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/animation",
  kind: "package",
  responsibility: "Canonical timelines, tracks, keyframes, easing, triggers, state machines, and animation semantics.",
  owns: "Shared 2D and 3D animation contracts.",
  mustNotOwn: "Own renderer-specific animation implementations as canonical truth.",
  status: "PHASE_0_SHELL",
};

export const ANIMATION_STATUS = packageContract.status;
