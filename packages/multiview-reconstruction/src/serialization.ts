import { stableStringify } from "./deterministic.js";
import { MultiViewAnalysisReportSchema, MultiViewReferenceSetSchema, MultiViewTaskSchema } from "./schemas.js";

export function serializeMultiViewTask(input: unknown): string {
  return stableStringify(MultiViewTaskSchema.parse(input));
}

export function deserializeMultiViewTask(value: string) {
  return MultiViewTaskSchema.parse(JSON.parse(value));
}

export function serializeMultiViewReferenceSet(input: unknown): string {
  return stableStringify(MultiViewReferenceSetSchema.parse(input));
}

export function deserializeMultiViewReferenceSet(value: string) {
  return MultiViewReferenceSetSchema.parse(JSON.parse(value));
}

export function serializeMultiViewAnalysisReport(input: unknown): string {
  return stableStringify(MultiViewAnalysisReportSchema.parse(input));
}

export function deserializeMultiViewAnalysisReport(value: string) {
  return MultiViewAnalysisReportSchema.parse(JSON.parse(value));
}
