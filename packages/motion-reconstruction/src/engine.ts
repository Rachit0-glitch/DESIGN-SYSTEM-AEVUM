import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { MotionFrameProvider } from "./adapters.js";
import { analyzeMotion } from "./analysis.js";
import { detectKeyframes } from "./keyframes.js";
import { generateTimelineProposal } from "./proposal.js";
import { createMotionReport } from "./report.js";
import type { MotionTask } from "./schemas.js";
import { createMotionTask, validateMotionTask } from "./task.js";
import { validateMotion } from "./validation.js";

export interface MotionEngineOptions {
  readonly frameProvider: MotionFrameProvider;
}

export interface RunMotionEngineInput {
  readonly task: MotionTask;
  readonly document: CanonicalDesignDocument;
  readonly timestamp: string;
}

export function createMotionEngine(options: MotionEngineOptions) {
  return Object.freeze({
    frameProvider: options.frameProvider,
    createTask: createMotionTask,
    validateTask: validateMotionTask,
    analyze(task: MotionTask) {
      return analyzeMotion(task, options.frameProvider);
    },
    detectKeyframes,
    generateTimelineProposal,
    validateMotion,
    createMotionReport,
    run(input: RunMotionEngineInput) {
      const sequence = options.frameProvider.provide(input.task);
      const analysis = analyzeMotion(input.task, options.frameProvider);
      const keyframes = detectKeyframes(analysis, input.task.keyframeTolerance);
      const proposal = generateTimelineProposal({
        task: input.task,
        analysis,
        keyframes,
        document: input.document,
        timestamp: input.timestamp,
      });
      const validation = validateMotion({
        task: input.task,
        sequence,
        document: input.document,
        analysis,
        keyframes,
        proposal,
      });
      const report = createMotionReport({
        task: input.task,
        sequence,
        analysis,
        keyframes,
        proposal,
        validation,
        createdAt: input.timestamp,
      });
      return Object.freeze({ sequence, analysis, keyframes, proposal, validation, report });
    },
  });
}

export type MotionEngine = ReturnType<typeof createMotionEngine>;
