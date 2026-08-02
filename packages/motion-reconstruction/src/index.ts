import type { PackageContract } from "@aevum/shared";

export { createDeterministicFrameProvider } from "./adapters.js";
export type { MotionFrameProvider } from "./adapters.js";
export { analyzeMotion } from "./analysis.js";
export { createMotionEngine } from "./engine.js";
export type { MotionEngine, MotionEngineOptions, RunMotionEngineInput } from "./engine.js";
export { detectKeyframes } from "./keyframes.js";
export { generateTimelineProposal } from "./proposal.js";
export type { GenerateTimelineProposalInput } from "./proposal.js";
export { createMotionReport } from "./report.js";
export type { CreateMotionReportInput } from "./report.js";
export * from "./schemas.js";
export {
  deserializeMotionReport,
  deserializeMotionTask,
  deserializeTimelineProposal,
  serializeMotionReport,
  serializeMotionTask,
  serializeTimelineProposal,
} from "./serialization.js";
export { createMotionTask } from "./task.js";
export { validateMotion } from "./validation.js";
export type { ValidateMotionInput } from "./validation.js";

export const packageContract: PackageContract = {
  name: "@aevum/motion-reconstruction",
  kind: "package",
  responsibility: "Deterministic reference-motion analysis and editable canonical timeline proposals.",
  owns: "Motion tasks, frame-provider contracts, motion evidence, keyframe detection, proposals, and reports.",
  mustNotOwn: "Video decoding, animation playback, canonical mutation, browser APIs, rendering, or motion generation.",
  status: "IMPLEMENTED",
};

export const MOTION_RECONSTRUCTION_STATUS = packageContract.status;
