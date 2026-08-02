import type { PackageContract } from "@aevum/shared";

export * from "./candidates.js";
export * from "./engine.js";
export * from "./evaluation.js";
export * from "./report.js";
export * from "./schemas.js";
export * from "./serialization.js";
export * from "./session.js";
export * from "./transaction.js";

export const packageContract: PackageContract = {
  name: "@aevum/correction",
  kind: "package",
  responsibility: "Bounded, deterministic, command-driven Autonomous 2D Correction Loop orchestration.",
  owns: "Correction sessions, candidates, protections, atomic transaction plans, regression evaluation, passes, and reports.",
  mustNotOwn:
    "Canonical state, direct mutation, rendering backends, creative redesign, unbounded loops, networking, or worker deployment.",
  status: "IMPLEMENTED",
};

export const CORRECTION_STATUS = packageContract.status;
