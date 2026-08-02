import { deepFreeze } from "./immutable.js";
import { MotionFrameSequenceSchema, type MotionFrameSequence, type MotionTask } from "./schemas.js";

export interface MotionFrameProvider {
  readonly id: string;
  readonly version: string;
  provide(task: MotionTask): MotionFrameSequence;
}

export function createDeterministicFrameProvider(sequenceInput: unknown): MotionFrameProvider {
  const sequence = deepFreeze(MotionFrameSequenceSchema.parse(sequenceInput));
  return Object.freeze({
    id: sequence.adapterId,
    version: sequence.adapterVersion,
    provide(task: MotionTask): MotionFrameSequence {
      if (task.sourceFormat !== sequence.format) {
        throw new Error(`Frame sequence format ${sequence.format} does not match task format ${task.sourceFormat}.`);
      }
      if (
        task.sourceAssetIds.length !== sequence.sourceAssetIds.length ||
        [...task.sourceAssetIds].sort().some((id, index) => id !== [...sequence.sourceAssetIds].sort()[index])
      ) {
        throw new Error("Frame sequence source assets do not match the motion task.");
      }
      return sequence;
    },
  });
}
