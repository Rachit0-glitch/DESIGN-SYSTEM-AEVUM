import type { AnimationStateMachine, Timeline } from "@aevum/document-model";
import { evaluateAnimationState } from "./state-machine.js";
import { evaluateTimeline } from "./timeline.js";
import type { StateMachineEvaluationInput, TimelineEvaluationContext } from "./types.js";
import { validateStateMachine, validateTimeline } from "./validation.js";

export function createAnimationEngine() {
  return Object.freeze({
    evaluateTimeline(timeline: Timeline, context: number | TimelineEvaluationContext) {
      return evaluateTimeline(timeline, context);
    },
    evaluateAnimationState(machine: AnimationStateMachine, input?: StateMachineEvaluationInput) {
      return evaluateAnimationState(machine, input);
    },
    validateTimeline,
    validateStateMachine,
  });
}

export type AnimationEngine = ReturnType<typeof createAnimationEngine>;
