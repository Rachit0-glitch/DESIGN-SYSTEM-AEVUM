import { evaluateTimeline, validateTimeline } from "@aevum/animation-core";
import { TimelineSchema } from "@aevum/document-model";
import type { PackageContract } from "@aevum/shared";
import { z } from "zod";

export const AnimationWorkerJobSchema = z.strictObject({
  id: z.string().min(1),
  timeline: TimelineSchema,
  time: z.number().finite().nonnegative(),
  progress: z.number().finite().min(0).max(1).optional(),
  reducedMotion: z
    .strictObject({
      behavior: z.enum(["PRESERVE", "REDUCE", "DISABLE"]),
      durationScale: z.number().finite().min(0).max(1),
    })
    .optional(),
});

export function createAnimationWorker() {
  return Object.freeze({
    execute(input: unknown) {
      const job = AnimationWorkerJobSchema.parse(input);
      const validation = validateTimeline(job.timeline);
      if (!validation.success) return Object.freeze({ success: false as const, jobId: job.id, validation });
      const evaluation = evaluateTimeline(job.timeline, {
        time: job.time,
        ...(job.progress !== undefined ? { progress: job.progress } : {}),
        ...(job.reducedMotion ? { reducedMotion: job.reducedMotion } : {}),
      });
      return Object.freeze({ success: true as const, jobId: job.id, validation, evaluation });
    },
  });
}

export type AnimationWorker = ReturnType<typeof createAnimationWorker>;

export const packageContract: PackageContract = {
  name: "@aevum/animation-worker",
  kind: "app",
  responsibility: "In-memory canonical timeline validation and deterministic fixed-time evaluation jobs.",
  owns: "Job input validation and animation evaluation result assembly.",
  mustNotOwn: "Canonical state, playback, queue infrastructure, networking, or deployment activation.",
  status: "IMPLEMENTED",
};

export const ANIMATION_WORKER_STATUS = packageContract.status;
