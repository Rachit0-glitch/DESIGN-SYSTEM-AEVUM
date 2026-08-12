import type {
  AnimationActionSchema,
  AnimationEasing,
  AnimationStateMachine,
  JsonValueSchema,
  Timeline,
} from "@aevum/document-model";
import type { z } from "zod";

export const ANIMATION_CORE_VERSION = "1.0.0" as const;

export type JsonValue = z.infer<typeof JsonValueSchema>;
export type AnimationAction = z.infer<typeof AnimationActionSchema>;
export type PlaybackState = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "CANCELLED" | "REVERSED";
export type ReducedMotionPolicy = {
  readonly behavior: "PRESERVE" | "REDUCE" | "DISABLE";
  readonly durationScale: number;
};

export interface TimelineEvaluationContext {
  readonly time?: number;
  readonly progress?: number;
  readonly active?: boolean;
  readonly playbackState?: PlaybackState;
  readonly reducedMotion?: ReducedMotionPolicy;
  readonly timelineRegistry?: Readonly<Record<string, Timeline>>;
}

export interface ResolvedTimelineState {
  readonly timelineId: string;
  readonly evaluatedTimelineId: string;
  readonly timelineVersion: string;
  readonly inputTime: number;
  readonly effectiveTime: number;
  readonly progress: number;
  readonly iteration: number;
  readonly playbackState: PlaybackState;
  readonly targetValues: Readonly<Record<string, Readonly<Record<string, JsonValue>>>>;
  readonly markerIds: readonly string[];
  readonly eventIds: readonly string[];
  readonly fingerprint: string;
}

export type AnimationDiagnosticSeverity = "INFO" | "WARNING" | "ERROR";
export type AnimationDiagnosticCode =
  | "SCHEMA_INVALID"
  | "MISSING_TRACKS"
  | "INVALID_KEYFRAME"
  | "UNSORTED_KEYFRAMES"
  | "OVERLAPPING_CLIPS"
  | "INFINITE_LOOP"
  | "BROKEN_TRACK_REFERENCE"
  | "BROKEN_TRANSITION"
  | "INVALID_EASING"
  | "CIRCULAR_STATE"
  | "CIRCULAR_REDUCED_MOTION"
  | "INVALID_BONE_TRACK";

export interface AnimationDiagnostic {
  readonly code: AnimationDiagnosticCode;
  readonly severity: AnimationDiagnosticSeverity;
  readonly message: string;
  readonly path: string;
  readonly entityId?: string;
  readonly recoverable: boolean;
}

export interface AnimationValidationResult<T = Timeline> {
  readonly success: boolean;
  readonly value?: Readonly<T>;
  readonly diagnostics: readonly AnimationDiagnostic[];
}

export interface StateMachineEvaluationInput {
  readonly currentStateId?: string;
  readonly triggerId?: string;
  readonly variables?: Readonly<Record<string, JsonValue>>;
}

export interface ResolvedAnimationState {
  readonly machineId: string;
  readonly machineVersion: string;
  readonly previousStateId: string;
  readonly currentStateId: string;
  readonly transitionId?: string;
  readonly timelineId?: string;
  readonly actions: readonly AnimationAction[];
  readonly variables: Readonly<Record<string, JsonValue>>;
  readonly fingerprint: string;
}

export type { AnimationEasing, AnimationStateMachine, Timeline };
