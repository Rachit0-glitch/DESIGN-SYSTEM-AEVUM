import {
  CURRENT_COMMAND_VERSION,
  beginTransaction,
  type AuditRecord,
  type ChangeSet,
  type Command,
} from "@aevum/command-engine";
import {
  ResponsiveSchema,
  validateDocument,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import { deepFreeze } from "./immutable.js";
import {
  RESPONSIVE_TRANSACTION_VERSION,
  ResponsiveProposalSchema,
  ResponsiveTransactionPlanSchema,
  ResponsiveValidationResultSchema,
  type ResponsiveNodeProposal,
  type ResponsiveProposal,
  type ResponsiveTransactionPlan,
  type ResponsiveValidationResult,
} from "./schemas.js";
import { deterministicCommandId, deterministicId, deterministicTransactionId, fingerprint } from "./stable.js";

type Responsive = NonNullable<DesignNode["responsive"]>;
type Override = Responsive["breakpoints"][string];

function mergeObjects(left: unknown, right: unknown): unknown {
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const result: Record<string, unknown> = { ...(left as Record<string, unknown>) };
    for (const [key, value] of Object.entries(right as Record<string, unknown>)) {
      result[key] = mergeObjects(result[key], value);
    }
    return result;
  }
  return right;
}

function mergeOverride(left: Override | undefined, right: Override): Override {
  return mergeObjects(left ?? {}, right) as Override;
}

function applyChange(responsive: Responsive, change: ResponsiveNodeProposal): Responsive {
  switch (change.target.kind) {
    case "BREAKPOINT":
      return {
        ...responsive,
        breakpoints: {
          ...responsive.breakpoints,
          [change.target.key]: mergeOverride(responsive.breakpoints[change.target.key], change.override),
        },
      };
    case "ORIENTATION": {
      if (change.target.key !== "PORTRAIT" && change.target.key !== "LANDSCAPE")
        throw new Error(`Invalid orientation target ${change.target.key}.`);
      return {
        ...responsive,
        orientations: {
          ...responsive.orientations,
          [change.target.key]: mergeOverride(responsive.orientations?.[change.target.key], change.override),
        },
      };
    }
    case "CONTAINER_QUERY":
      return {
        ...responsive,
        containerQueries: {
          ...responsive.containerQueries,
          [change.target.key]: mergeOverride(responsive.containerQueries?.[change.target.key], change.override),
        },
      };
    case "REDUCED_MOTION":
      return { ...responsive, reducedMotionOverride: mergeOverride(responsive.reducedMotionOverride, change.override) };
    case "QUALITY_PROFILE": {
      if (!["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"].includes(change.target.key))
        throw new Error(`Invalid quality target ${change.target.key}.`);
      const key = change.target.key as "DRAFT" | "HIGH_QUALITY" | "MAXIMUM_FIDELITY";
      return {
        ...responsive,
        qualityProfileOverrides: {
          ...responsive.qualityProfileOverrides,
          [key]: mergeOverride(responsive.qualityProfileOverrides?.[key], change.override),
        },
      };
    }
  }
}

export interface CompileResponsiveTransactionInput {
  readonly proposal: ResponsiveProposal;
  readonly document: CanonicalDesignDocument;
  readonly timestamp: string;
  readonly correlationId?: string;
}

export function compileResponsiveTransaction(input: CompileResponsiveTransactionInput): ResponsiveTransactionPlan {
  const proposal = ResponsiveProposalSchema.parse(input.proposal);
  if (proposal.changes.length === 0) throw new Error("Cannot compile an empty responsive proposal.");
  if (
    input.document.metadata.id !== proposal.documentId ||
    input.document.documentVersion !== proposal.expectedDocumentVersion ||
    fingerprint(input.document) !== proposal.sourceDocumentFingerprint
  ) {
    throw new Error("Responsive proposal is not bound to this canonical document version.");
  }
  const grouped = new Map<string, ResponsiveNodeProposal[]>();
  for (const change of proposal.changes) {
    if (!input.document.nodes[change.nodeId])
      throw new Error(`Responsive change targets missing node ${change.nodeId}.`);
    grouped.set(change.nodeId, [...(grouped.get(change.nodeId) ?? []), change]);
  }
  const responsiveByNode: Record<string, Responsive> = {};
  for (const [nodeId, changes] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const node = input.document.nodes[nodeId] as DesignNode;
    let responsive: Responsive = node.responsive ?? { breakpoints: {} };
    for (const change of [...changes].sort((left, right) => left.id.localeCompare(right.id))) {
      responsive = applyChange(responsive, change);
    }
    responsiveByNode[nodeId] = ResponsiveSchema.parse(responsive);
  }
  const identity = {
    proposalId: proposal.id,
    documentVersion: input.document.documentVersion,
    changeFingerprints: proposal.changes.map((entry) => entry.fingerprint).sort(),
  };
  const transactionId = deterministicTransactionId(identity);
  const correlationId = input.correlationId ?? `responsive:${proposal.id}`;
  const commands: Command[] = Object.entries(responsiveByNode)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([nodeId, responsive], index) => ({
      id: deterministicCommandId({ identity, nodeId, responsive, index }),
      commandVersion: CURRENT_COMMAND_VERSION,
      documentId: input.document.metadata.id,
      expectedDocumentVersion: input.document.documentVersion,
      timestamp: input.timestamp,
      actor: input.document.metadata.updatedBy,
      correlationId,
      transactionId,
      type: "node.update" as const,
      payload: { nodeId, changes: { responsive } },
    }));
  const draft = {
    transactionVersion: RESPONSIVE_TRANSACTION_VERSION,
    proposalId: proposal.id,
    documentId: input.document.metadata.id,
    expectedDocumentVersion: input.document.documentVersion,
    transactionId,
    changeIds: proposal.changes.map((entry) => entry.id).sort(),
    responsiveByNode,
    commands,
  };
  const planFingerprint = fingerprint(draft);
  return deepFreeze(
    ResponsiveTransactionPlanSchema.parse({
      ...draft,
      id: deterministicId("responsive-transaction", { planFingerprint }),
      fingerprint: planFingerprint,
    }),
  );
}

function executePlan(plan: ResponsiveTransactionPlan, document: CanonicalDesignDocument) {
  const transaction = beginTransaction(document, { transactionId: plan.transactionId });
  try {
    for (const command of plan.commands) transaction.execute(command);
    return transaction.commit();
  } catch (error) {
    if (transaction.state !== "COMMITTED" && transaction.state !== "ROLLED_BACK") transaction.rollback();
    throw error;
  }
}

export type ResponsiveDryRunResult =
  | {
      readonly success: true;
      readonly transactionPlanId: string;
      readonly resultingDocument: CanonicalDesignDocument;
      readonly changeSet: ChangeSet;
    }
  | { readonly success: false; readonly transactionPlanId: string; readonly message: string };

export function dryRunResponsiveProposal(
  planInput: ResponsiveTransactionPlan,
  document: CanonicalDesignDocument,
): ResponsiveDryRunResult {
  const plan = ResponsiveTransactionPlanSchema.parse(planInput);
  try {
    const commit = executePlan(plan, document);
    if (!validateDocument(commit.newDocument).success)
      throw new Error("Responsive dry-run document failed canonical validation.");
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
      message: error instanceof Error ? error.message : "Responsive dry run failed.",
    });
  }
}

export type ResponsiveApplicationResult =
  | {
      readonly success: true;
      readonly transactionPlanId: string;
      readonly resultingDocument: CanonicalDesignDocument;
      readonly changeSet: ChangeSet;
      readonly auditRecord: AuditRecord;
      readonly commands: readonly Command[];
    }
  | { readonly success: false; readonly transactionPlanId: string; readonly message: string };

export function applyResponsiveProposal(
  planInput: ResponsiveTransactionPlan,
  document: CanonicalDesignDocument,
  validationInput: ResponsiveValidationResult,
): ResponsiveApplicationResult {
  const plan = ResponsiveTransactionPlanSchema.parse(planInput);
  const validation = ResponsiveValidationResultSchema.parse(validationInput);
  if (!validation.passed)
    return deepFreeze({
      success: false as const,
      transactionPlanId: plan.id,
      message: "Unvalidated responsive proposal cannot be applied.",
    });
  const dryRun = dryRunResponsiveProposal(plan, document);
  if (!dryRun.success) return dryRun;
  if (
    validation.documentId !== dryRun.resultingDocument.metadata.id ||
    validation.documentVersion !== dryRun.resultingDocument.documentVersion ||
    validation.documentFingerprint !== fingerprint(dryRun.resultingDocument)
  ) {
    return deepFreeze({
      success: false as const,
      transactionPlanId: plan.id,
      message: "Responsive validation is not bound to this transaction dry run.",
    });
  }
  try {
    const commit = executePlan(plan, document);
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
      message: error instanceof Error ? error.message : "Responsive transaction failed.",
    });
  }
}
