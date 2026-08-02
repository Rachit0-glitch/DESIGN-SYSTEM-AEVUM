import {
  ValidationCorrectionPlanSchema,
  ValidationReferenceSnapshotSchema,
  ValidationReportSchema,
  ValidationTaskSchema,
  type ValidationCorrectionPlan,
  type ValidationReferenceSnapshot,
  type ValidationReport,
  type ValidationTask,
} from "./schemas.js";

function parse(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new SyntaxError(`Validation JSON is invalid: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export function serializeValidationTask(value: ValidationTask, pretty = false): string {
  return JSON.stringify(ValidationTaskSchema.parse(value), null, pretty ? 2 : undefined);
}
export function deserializeValidationTask(value: string): ValidationTask {
  return ValidationTaskSchema.parse(parse(value));
}
export function serializeValidationReference(value: ValidationReferenceSnapshot, pretty = false): string {
  return JSON.stringify(ValidationReferenceSnapshotSchema.parse(value), null, pretty ? 2 : undefined);
}
export function deserializeValidationReference(value: string): ValidationReferenceSnapshot {
  return ValidationReferenceSnapshotSchema.parse(parse(value));
}
export function serializeValidationReport(value: ValidationReport, pretty = false): string {
  return JSON.stringify(ValidationReportSchema.parse(value), null, pretty ? 2 : undefined);
}
export function deserializeValidationReport(value: string): ValidationReport {
  return ValidationReportSchema.parse(parse(value));
}
export function serializeCorrectionPlan(value: ValidationCorrectionPlan, pretty = false): string {
  return JSON.stringify(ValidationCorrectionPlanSchema.parse(value), null, pretty ? 2 : undefined);
}
export function deserializeCorrectionPlan(value: string): ValidationCorrectionPlan {
  return ValidationCorrectionPlanSchema.parse(parse(value));
}
