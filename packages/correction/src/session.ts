import type { CanonicalDesignDocument } from "@aevum/document-model";
import { ValidationReportSchema, type ValidationReport } from "@aevum/validation";
import { deepFreeze } from "./immutable.js";
import {
  CORRECTION_SESSION_VERSION,
  CorrectionConfigurationSchema,
  CorrectionSessionSchema,
  type CorrectionConfiguration,
  type CorrectionFinalResult,
  type CorrectionPass,
  type CorrectionSession,
} from "./schemas.js";
import { deterministicId, fingerprint } from "./stable.js";

export interface CreateCorrectionSessionInput {
  readonly document: CanonicalDesignDocument;
  readonly baselineReport: ValidationReport;
  readonly configuration?: Partial<CorrectionConfiguration>;
  readonly createdAt: string;
  readonly createdBy: CorrectionSession["createdBy"];
}

function sessionFingerprint(value: Omit<CorrectionSession, "fingerprint">): string {
  return fingerprint(value);
}

export function createCorrectionSession(input: CreateCorrectionSessionInput): CorrectionSession {
  const report = ValidationReportSchema.parse(input.baselineReport);
  if (
    report.documentId !== input.document.metadata.id ||
    report.documentVersion !== input.document.documentVersion ||
    report.projectId !== input.document.metadata.projectId
  ) {
    throw new Error("Baseline validation report does not match the correction document identity or version.");
  }
  const configuration = CorrectionConfigurationSchema.parse(input.configuration ?? {});
  const identity = {
    projectId: report.projectId,
    documentId: report.documentId,
    documentVersion: report.documentVersion,
    reportId: report.id,
    configuration,
    createdBy: input.createdBy,
  };
  const draft = {
    id: deterministicId("correction-session", identity),
    sessionVersion: CORRECTION_SESSION_VERSION,
    projectId: report.projectId,
    documentId: report.documentId,
    referenceId: report.referenceId,
    sourceAssetId: report.sourceAssetId,
    initialDocumentVersion: report.documentVersion,
    baselineValidationReportId: report.id,
    status: "CREATED" as const,
    configuration,
    passes: [],
    createdAt: input.createdAt,
    createdBy: input.createdBy,
  };
  return deepFreeze(CorrectionSessionSchema.parse({ ...draft, fingerprint: sessionFingerprint(draft) }));
}

export function updateCorrectionSession(
  session: CorrectionSession,
  input: {
    readonly status: CorrectionSession["status"];
    readonly passes: readonly CorrectionPass[];
    readonly finalResult?: CorrectionFinalResult;
  },
): CorrectionSession {
  const draft = {
    ...session,
    status: input.status,
    passes: [...input.passes],
    ...(input.finalResult ? { finalResult: input.finalResult } : {}),
  };
  const { fingerprint: _ignored, ...withoutFingerprint } = draft;
  return deepFreeze(
    CorrectionSessionSchema.parse({ ...withoutFingerprint, fingerprint: sessionFingerprint(withoutFingerprint) }),
  );
}

export function validateCorrectionSession(input: unknown): ReturnType<typeof CorrectionSessionSchema.safeParse> {
  return CorrectionSessionSchema.safeParse(input);
}
