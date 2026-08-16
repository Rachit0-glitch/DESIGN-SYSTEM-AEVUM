import { beginTransaction, type ChangeSet, type Command, type TransactionCommitResult } from "@aevum/command-engine";
import {
  CanonicalDesignDocumentSchema,
  CURRENT_MIGRATION_VERSION,
  CURRENT_SCHEMA_VERSION,
  validateDocument,
  type CanonicalDesignDocument,
} from "@aevum/document-model";
import { diagnostic } from "./diagnostics.js";
import { deterministicCommandId, deterministicTransactionId, fingerprint } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  ProposedCommandPlanSchema,
  type ProposedCommandPlan,
  type ReconstructionDiagnostic,
  type ReconstructionProposal,
  type ReconstructionTask,
} from "./schemas.js";

export interface CommandPlanDraft {
  readonly proposalId: string;
  readonly task: ReconstructionTask;
  readonly documentId: string;
  readonly viewportId: string;
  readonly documentName: string;
  readonly viewport: ReconstructionProposal["proposedDocumentMetadata"]["viewport"];
  readonly proposedNodes: ReconstructionProposal["proposedNodes"];
  readonly proposedAssets: ReconstructionProposal["proposedAssets"];
  // Only real, applied components (a confident, real repeated-structure candidate) are registered
  // here — a merely suggested component (applied: false) stays advisory and produces no command, the
  // same pattern already used for proposedTokens above.
  readonly proposedComponents: ReconstructionProposal["proposedComponents"];
  // Only real, applied tokens (e.g. sampled color tokens referenced by a node's fillTokenId) are
  // registered here — merely suggested tokens (applied: false) stay advisory and are never
  // committed, so a node can never end up referencing a token that doesn't exist in the document.
  readonly proposedTokens: ReconstructionProposal["proposedTokens"];
  readonly reference: ReconstructionProposal["proposedDocumentMetadata"]["reference"];
  readonly existingDocument?: CanonicalDesignDocument;
}

function createInitialDocument(draft: CommandPlanDraft): CanonicalDesignDocument {
  const viewport = draft.viewport;
  return CanonicalDesignDocumentSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    migrationVersion: CURRENT_MIGRATION_VERSION,
    documentVersion: 1,
    parentVersionId: null,
    metadata: {
      id: draft.documentId,
      projectId: draft.task.projectId,
      name: draft.documentName,
      createdAt: draft.task.createdAt,
      updatedAt: draft.task.createdAt,
      createdBy: draft.task.createdBy,
      updatedBy: draft.task.createdBy,
      version: 1,
      projectVersion: 1,
      tags: ["reconstructed", "phase-6-mvp"],
      description: `Deterministic reconstruction from ${draft.task.sourceAssetId}.`,
    },
    rootNodeIds: [],
    pages: [],
    nodes: {},
    assets: {},
    components: {},
    tokens: {},
    typography: {},
    timelines: {},
    stateMachines: {},
    cameras: {},
    lights: {},
    materials: {},
    references: {},
    validations: {},
    exports: {},
    settings: {
      qualityMode: draft.task.qualityMode,
      defaultViewportId: draft.viewportId,
      viewports: {
        [draft.viewportId]: {
          id: draft.viewportId,
          name: "Source viewport",
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: viewport.deviceScaleFactor,
          orientation: viewport.orientation,
          category: viewport.category,
        },
      },
      defaultColorSpace: "SRGB",
      defaultUnit: "PX",
      frameRate: 60,
      deterministicSeed: draft.task.deterministicSeed,
      reducedMotion: "PRESERVE",
    },
  });
}

function commandWithoutIdentity(command: Command): unknown {
  return {
    type: command.type,
    documentId: command.documentId,
    expectedDocumentVersion: command.expectedDocumentVersion,
    payload: command.payload,
  };
}

export function buildCommandPlan(draft: CommandPlanDraft): ProposedCommandPlan {
  const expectedDocumentVersion = draft.existingDocument?.documentVersion ?? 0;
  const transactionId = deterministicTransactionId({ proposalId: draft.proposalId, expectedDocumentVersion });
  const base = {
    commandVersion: "1.0.0" as const,
    documentId: draft.documentId,
    expectedDocumentVersion,
    timestamp: draft.task.createdAt,
    actor: draft.task.createdBy,
    correlationId: draft.task.id,
    transactionId,
  };
  const commandDrafts: Array<Omit<Command, "id">> = [];

  if (!draft.existingDocument) {
    commandDrafts.push({
      ...base,
      type: "document.create",
      payload: { document: createInitialDocument(draft) },
    });
  }
  for (const proposed of draft.proposedAssets) {
    const alreadyRegistered = draft.existingDocument?.assets[proposed.asset.id];
    if (!alreadyRegistered) {
      commandDrafts.push({ ...base, type: "asset.register", payload: { asset: proposed.asset } });
    }
  }
  for (const proposed of draft.proposedTokens) {
    if (!proposed.applied) continue;
    const alreadyRegistered = draft.existingDocument?.tokens[proposed.token.id];
    if (!alreadyRegistered) {
      commandDrafts.push({ ...base, type: "token.register", payload: { token: proposed.token } });
    }
  }
  if (!draft.existingDocument?.references[draft.reference.id]) {
    commandDrafts.push({ ...base, type: "reference.register", payload: { reference: draft.reference } } as Omit<
      Command,
      "id"
    >);
  }

  // Component instances must be created strictly after component.register, which itself must run
  // strictly after the real node that becomes the definition's root — both node.create's own
  // canExecute (componentId must resolve) and the full-document validator (component.rootNodeId must
  // resolve to a real node) would otherwise reject the transaction. Every other node — including each
  // applied component's own real definition root and its real children — keeps its original creation
  // order, so this only reorders instance nodes relative to everything else.
  const nonInstanceProposedNodes = draft.proposedNodes.filter(
    (proposed) => proposed.node.type !== "COMPONENT_INSTANCE",
  );
  const instanceProposedNodes = draft.proposedNodes.filter((proposed) => proposed.node.type === "COMPONENT_INSTANCE");

  for (const proposed of nonInstanceProposedNodes) {
    if (proposed.node.type === "PAGE") {
      commandDrafts.push({
        ...base,
        type: "page.create",
        payload: { page: proposed.node, index: proposed.childOrder },
      });
    } else {
      commandDrafts.push({
        ...base,
        type: "node.create",
        payload: { node: proposed.node, index: proposed.childOrder },
      });
    }
  }
  for (const proposed of draft.proposedComponents) {
    if (!proposed.applied) continue;
    const alreadyRegistered = draft.existingDocument?.components[proposed.component.id];
    if (!alreadyRegistered) {
      commandDrafts.push({ ...base, type: "component.register", payload: { component: proposed.component } });
    }
  }
  for (const proposed of instanceProposedNodes) {
    commandDrafts.push({
      ...base,
      type: "node.create",
      payload: { node: proposed.node, index: proposed.childOrder },
    });
  }

  const commands = commandDrafts.map(
    (command, index) =>
      ({
        ...command,
        id: deterministicCommandId({
          proposalId: draft.proposalId,
          expectedDocumentVersion,
          index,
          type: command.type,
          payload: command.payload,
        }),
      }) as Command,
  );
  const commandPlanFingerprint = fingerprint({
    proposalId: draft.proposalId,
    transactionId,
    commands: commands.map(commandWithoutIdentity),
  });
  return deepFreeze(
    ProposedCommandPlanSchema.parse({
      id: `command-plan:${commandPlanFingerprint.slice("sha256:".length, "sha256:".length + 32)}`,
      transactionId,
      expectedDocumentVersion,
      commands,
      createdEntityIds: [
        ...(!draft.existingDocument ? [draft.documentId] : []),
        ...draft.proposedAssets
          .filter((entry) => !draft.existingDocument?.assets[entry.asset.id])
          .map((entry) => entry.asset.id),
        ...draft.proposedTokens
          .filter((entry) => entry.applied && !draft.existingDocument?.tokens[entry.token.id])
          .map((entry) => entry.token.id),
        ...(!draft.existingDocument?.references[draft.reference.id] ? [draft.reference.id] : []),
        ...draft.proposedComponents
          .filter((entry) => entry.applied && !draft.existingDocument?.components[entry.component.id])
          .map((entry) => entry.component.id),
        ...draft.proposedNodes.map((entry) => entry.node.id),
      ],
      commandPlanFingerprint,
    }),
  );
}

export function generateReconstructionCommandPlan(proposal: ReconstructionProposal): ProposedCommandPlan {
  return proposal.commandPlan;
}

export interface ReconstructionDryRunResult {
  readonly success: boolean;
  readonly proposalId: string;
  readonly resultingDocument?: CanonicalDesignDocument;
  readonly changeSet?: ChangeSet;
  readonly diagnostics: readonly ReconstructionDiagnostic[];
}

export interface ReconstructionApplicationResult {
  readonly proposalId: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly previousDocumentVersion?: number;
  readonly resultingDocumentVersion: number;
  readonly transactionId: string;
  readonly commandIds: readonly string[];
  readonly changeSet: ChangeSet;
  readonly createdEntityIds: readonly string[];
  readonly warnings: readonly ReconstructionDiagnostic[];
  readonly resultingDocument: CanonicalDesignDocument;
}

export type ReconstructionApplicationOutcome =
  | { readonly success: true; readonly result: ReconstructionApplicationResult }
  | { readonly success: false; readonly diagnostics: readonly ReconstructionDiagnostic[] };

function executePlan(
  proposal: ReconstructionProposal,
  document: CanonicalDesignDocument | null,
): TransactionCommitResult {
  const transaction = beginTransaction(document, { transactionId: proposal.commandPlan.transactionId });
  try {
    for (const command of proposal.commandPlan.commands) transaction.execute(command);
    return transaction.commit();
  } catch (error) {
    if (transaction.state !== "COMMITTED") transaction.rollback();
    throw error;
  }
}

function failure(code: "DRY_RUN_FAILED" | "TRANSACTION_FAILED", stage: string, error: unknown) {
  return diagnostic({
    code,
    severity: "CRITICAL",
    message: error instanceof Error ? error.message : "Command transaction failed.",
    stage,
    recoverable: true,
  });
}

export function dryRunReconstructionProposal(
  proposal: ReconstructionProposal,
  document: CanonicalDesignDocument | null = null,
): ReconstructionDryRunResult {
  try {
    const commit = executePlan(proposal, document);
    const validation = validateDocument(commit.newDocument);
    if (!validation.success) {
      return deepFreeze({
        success: false,
        proposalId: proposal.id,
        diagnostics: [
          diagnostic({
            code: "RESULT_DOCUMENT_INVALID",
            severity: "CRITICAL",
            message: "Dry-run result is not a valid Canonical Design Document.",
            stage: "DRY_RUN",
            recoverable: true,
            details: { issues: validation.issues.map((issue) => issue.message) },
          }),
        ],
      });
    }
    return deepFreeze({
      success: true,
      proposalId: proposal.id,
      resultingDocument: commit.newDocument,
      changeSet: commit.changeSet,
      diagnostics: [],
    });
  } catch (error) {
    return deepFreeze({
      success: false,
      proposalId: proposal.id,
      diagnostics: [failure("DRY_RUN_FAILED", "DRY_RUN", error)],
    });
  }
}

export function applyReconstructionProposal(
  proposal: ReconstructionProposal,
  task: ReconstructionTask,
  document: CanonicalDesignDocument | null = null,
): ReconstructionApplicationOutcome {
  try {
    const commit = executePlan(proposal, document);
    const validation = validateDocument(commit.newDocument);
    if (!validation.success) throw new Error("Resulting Canonical Design Document failed validation.");
    return deepFreeze({
      success: true,
      result: {
        proposalId: proposal.id,
        taskId: task.id,
        projectId: task.projectId,
        documentId: commit.newDocument.metadata.id,
        ...(document ? { previousDocumentVersion: document.documentVersion } : {}),
        resultingDocumentVersion: commit.newDocument.documentVersion,
        transactionId: commit.auditRecord.transactionId,
        commandIds: commit.commands.map((command) => command.id),
        changeSet: commit.changeSet,
        createdEntityIds: proposal.commandPlan.createdEntityIds,
        warnings: proposal.diagnostics.filter((entry) => entry.severity === "WARNING" || entry.severity === "INFO"),
        resultingDocument: commit.newDocument,
      },
    });
  } catch (error) {
    return deepFreeze({
      success: false,
      diagnostics: [failure("TRANSACTION_FAILED", "APPLY_TRANSACTION", error)],
    });
  }
}
