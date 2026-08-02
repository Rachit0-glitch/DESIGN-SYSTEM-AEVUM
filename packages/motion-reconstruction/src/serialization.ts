import { MotionReportSchema, MotionTaskSchema, TimelineProposalSchema } from "./schemas.js";
import { stableStringify } from "./stable.js";

export function serializeMotionTask(input: unknown): string {
  return stableStringify(MotionTaskSchema.parse(input));
}

export function deserializeMotionTask(value: string) {
  return MotionTaskSchema.parse(JSON.parse(value));
}

export function serializeTimelineProposal(input: unknown): string {
  return stableStringify(TimelineProposalSchema.parse(input));
}

export function deserializeTimelineProposal(value: string) {
  return TimelineProposalSchema.parse(JSON.parse(value));
}

export function serializeMotionReport(input: unknown): string {
  return stableStringify(MotionReportSchema.parse(input));
}

export function deserializeMotionReport(value: string) {
  return MotionReportSchema.parse(JSON.parse(value));
}
