import {
  CorrectionReportSchema,
  CorrectionSessionSchema,
  CorrectionTransactionPlanSchema,
  type CorrectionReport,
  type CorrectionSession,
  type CorrectionTransactionPlan,
} from "./schemas.js";

function parse(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new SyntaxError(`Correction JSON is invalid: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export function serializeCorrectionSession(value: CorrectionSession, pretty = false): string {
  return JSON.stringify(CorrectionSessionSchema.parse(value), null, pretty ? 2 : undefined);
}

export function deserializeCorrectionSession(value: string): CorrectionSession {
  return CorrectionSessionSchema.parse(parse(value));
}

export function serializeCorrectionTransaction(value: CorrectionTransactionPlan, pretty = false): string {
  return JSON.stringify(CorrectionTransactionPlanSchema.parse(value), null, pretty ? 2 : undefined);
}

export function deserializeCorrectionTransaction(value: string): CorrectionTransactionPlan {
  return CorrectionTransactionPlanSchema.parse(parse(value));
}

export function serializeCorrectionReport(value: CorrectionReport, pretty = false): string {
  return JSON.stringify(CorrectionReportSchema.parse(value), null, pretty ? 2 : undefined);
}

export function deserializeCorrectionReport(value: string): CorrectionReport {
  return CorrectionReportSchema.parse(parse(value));
}
