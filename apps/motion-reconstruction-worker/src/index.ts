import { CanonicalDesignDocumentSchema } from "@aevum/document-model";
import {
  MotionFrameSequenceSchema,
  MotionTaskSchema,
  createDeterministicFrameProvider,
  createMotionEngine,
} from "@aevum/motion-reconstruction";
import type { PackageContract } from "@aevum/shared";
import { z } from "zod";

export const MotionReconstructionWorkerJobSchema = z.strictObject({
  id: z.string().min(1),
  task: MotionTaskSchema,
  document: CanonicalDesignDocumentSchema,
  frameSequence: MotionFrameSequenceSchema,
  timestamp: z.iso.datetime({ offset: true }),
});

export function createMotionReconstructionWorker() {
  return Object.freeze({
    execute(input: unknown) {
      const job = MotionReconstructionWorkerJobSchema.parse(input);
      const frameProvider = createDeterministicFrameProvider(job.frameSequence);
      const engine = createMotionEngine({ frameProvider });
      return Object.freeze({ success: true as const, jobId: job.id, result: engine.run(job) });
    },
  });
}

export type MotionReconstructionWorker = ReturnType<typeof createMotionReconstructionWorker>;

export const packageContract: PackageContract = {
  name: "@aevum/motion-reconstruction-worker",
  kind: "app",
  responsibility: "Validated in-memory execution of deterministic motion reconstruction jobs.",
  owns: "Job payload validation and composition of the Phase 11 motion engine.",
  mustNotOwn: "Canonical state, media decoding, queues, networking, persistence, rendering, or deployment activation.",
  status: "IMPLEMENTED",
};

export const MOTION_RECONSTRUCTION_WORKER_STATUS = packageContract.status;
