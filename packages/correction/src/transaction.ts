import {
  CURRENT_COMMAND_VERSION,
  beginTransaction,
  type AuditRecord,
  type ChangeSet,
  type Command,
} from "@aevum/command-engine";
import { validateDocument, type CanonicalDesignDocument } from "@aevum/document-model";
import { deepFreeze } from "./immutable.js";
import {
  CORRECTION_TRANSACTION_VERSION,
  CorrectionCandidateSchema,
  CorrectionEvaluationSchema,
  CorrectionSessionSchema,
  CorrectionTransactionPlanSchema,
  type CorrectionCandidate,
  type CorrectionEvaluation,
  type CorrectionSession,
  type CorrectionTransactionPlan,
} from "./schemas.js";
import {
  deterministicCommandId,
  deterministicId,
  deterministicTransactionId,
  fingerprint,
  stableStringify,
} from "./stable.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeChanges(
  target: Record<string, unknown>,
  source: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    if (isObject(existing) && isObject(value)) {
      result[key] = mergeChanges(existing, value);
    } else if (existing !== undefined && stableStringify(existing) !== stableStringify(value)) {
      throw new Error(`Correction candidates contain conflicting changes for ${key}.`);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export interface CompileCorrectionTransactionInput {
  readonly session: CorrectionSession;
  readonly passNumber: number;
  readonly candidates: readonly CorrectionCandidate[];
  readonly document: CanonicalDesignDocument;
  readonly timestamp: string;
  readonly correlationId?: string;
}

export function compileCorrectionTransaction(input: CompileCorrectionTransactionInput): CorrectionTransactionPlan {
  const session = CorrectionSessionSchema.parse(input.session);
  if (input.document.metadata.id !== session.documentId)
    throw new Error("Correction session targets a different document.");
  if (input.candidates.length === 0) throw new Error("Cannot compile an empty correction transaction.");
  const candidates = input.candidates.map((entry) => CorrectionCandidateSchema.parse(entry));
  if (candidates.some((entry) => entry.sessionId !== session.id || entry.passNumber !== input.passNumber)) {
    throw new Error("Correction candidate session or pass identity does not match.");
  }
  const transactionIdentity = {
    sessionId: session.id,
    passNumber: input.passNumber,
    documentVersion: input.document.documentVersion,
    candidateFingerprints: candidates.map((entry) => entry.fingerprint).sort(),
  };
  const transactionId = deterministicTransactionId(transactionIdentity);
  const grouped = new Map<string, { changes: Record<string, unknown>; candidateIds: string[] }>();
  for (const candidate of [...candidates].sort((left, right) => left.id.localeCompare(right.id))) {
    const current = grouped.get(candidate.nodeId) ?? { changes: {}, candidateIds: [] };
    current.changes = mergeChanges(current.changes, candidate.changes);
    current.candidateIds.push(candidate.id);
    grouped.set(candidate.nodeId, current);
  }
  const correlationId = input.correlationId ?? `correction:${session.id}:pass:${input.passNumber}`;
  const commands: Command[] = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, group], index) => ({
      id: deterministicCommandId({ transactionIdentity, nodeId, index, changes: group.changes }),
      commandVersion: CURRENT_COMMAND_VERSION,
      documentId: input.document.metadata.id,
      expectedDocumentVersion: input.document.documentVersion,
      timestamp: input.timestamp,
      actor: session.createdBy,
      correlationId,
      transactionId,
      type: "node.update" as const,
      payload: { nodeId, changes: group.changes },
    }));
  const draft = {
    transactionVersion: CORRECTION_TRANSACTION_VERSION,
    sessionId: session.id,
    passNumber: input.passNumber,
    documentId: input.document.metadata.id,
    expectedDocumentVersion: input.document.documentVersion,
    transactionId,
    candidateIds: candidates.map((entry) => entry.id).sort(),
    commands,
  };
  const planFingerprint = fingerprint(draft);
  return deepFreeze(
    CorrectionTransactionPlanSchema.parse({
      ...draft,
      id: deterministicId("correction-transaction", { planFingerprint }),
      fingerprint: planFingerprint,
    }),
  );
}

function executePlan(plan: CorrectionTransactionPlan, document: CanonicalDesignDocument) {
  const transaction = beginTransaction(document, { transactionId: plan.transactionId });
  try {
    for (const command of plan.commands) transaction.execute(command);
    return transaction.commit();
  } catch (error) {
    if (transaction.state !== "COMMITTED" && transaction.state !== "ROLLED_BACK") transaction.rollback();
    throw error;
  }
}

export type CorrectionDryRunResult =
  | {
      readonly success: true;
      readonly transactionPlanId: string;
      readonly resultingDocument: CanonicalDesignDocument;
      readonly changeSet: ChangeSet;
    }
  | { readonly success: false; readonly transactionPlanId: string; readonly message: string };

export function dryRunCorrection(
  inputPlan: CorrectionTransactionPlan,
  document: CanonicalDesignDocument,
): CorrectionDryRunResult {
  const plan = CorrectionTransactionPlanSchema.parse(inputPlan);
  try {
    const commit = executePlan(plan, document);
    if (!validateDocument(commit.newDocument).success) throw new Error("Dry-run document failed canonical validation.");
    return deepFreeze({
      success: true as const,
      transactionPlanId: plan.id,
      resultingDocument: commit.newDocument,
      changeSet: commit.changeSet,
    });
  } catch (error) {
    return deepFreeze({
      success: false as const,
      transactionPlanId: plan.id,
      message: error instanceof Error ? error.message : "Correction dry run failed.",
    });
  }
}

export type CorrectionApplicationResult =
  | {
      readonly success: true;
      readonly transactionPlanId: string;
      readonly resultingDocument: CanonicalDesignDocument;
      readonly changeSet: ChangeSet;
      readonly auditRecord: AuditRecord;
      readonly commands: readonly Command[];
    }
  | { readonly success: false; readonly transactionPlanId: string; readonly message: string };

export function applyCorrection(
  inputPlan: CorrectionTransactionPlan,
  document: CanonicalDesignDocument,
  inputEvaluation: CorrectionEvaluation,
): CorrectionApplicationResult {
  const plan = CorrectionTransactionPlanSchema.parse(inputPlan);
  const evaluation = CorrectionEvaluationSchema.parse(inputEvaluation);
  if (!evaluation.accepted) {
    return deepFreeze({
      success: false as const,
      transactionPlanId: plan.id,
      message: "Rejected correction evaluation cannot be applied.",
    });
  }
  const dryRun = dryRunCorrection(plan, document);
  if (!dryRun.success) return dryRun;
  if (
    evaluation.transactionPlanId !== plan.id ||
    evaluation.candidateDocumentVersion !== dryRun.resultingDocument.documentVersion ||
    evaluation.candidateDocumentFingerprint !== fingerprint(dryRun.resultingDocument)
  ) {
    return deepFreeze({
      success: false as const,
      transactionPlanId: plan.id,
      message: "Accepted correction evaluation is not bound to this transaction dry run.",
    });
  }
  try {
    const commit = executePlan(plan, document);
    if (!validateDocument(commit.newDocument).success)
      throw new Error("Applied correction failed canonical validation.");
    return deepFreeze({
      success: true as const,
      transactionPlanId: plan.id,
      resultingDocument: commit.newDocument,
      changeSet: commit.changeSet,
      auditRecord: commit.auditRecord,
      commands: commit.commands,
    });
  } catch (error) {
    return deepFreeze({
      success: false as const,
      transactionPlanId: plan.id,
      message: error instanceof Error ? error.message : "Correction transaction failed.",
    });
  }
}
