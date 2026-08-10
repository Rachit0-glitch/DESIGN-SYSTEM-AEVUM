import { stableStringify } from "./deterministic.js";
import { CandidateReconstructionSchema, ReconstructionSessionReportSchema } from "./schemas.js";

export function serializeCandidateReconstruction(input: unknown): string {
  return stableStringify(CandidateReconstructionSchema.parse(input));
}

export function deserializeCandidateReconstruction(value: string) {
  return CandidateReconstructionSchema.parse(JSON.parse(value));
}

export function serializeReconstructionSessionReport(input: unknown): string {
  return stableStringify(ReconstructionSessionReportSchema.parse(input));
}

export function deserializeReconstructionSessionReport(value: string) {
  return ReconstructionSessionReportSchema.parse(JSON.parse(value));
}
