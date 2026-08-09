import {
  CURRENT_COMMAND_VERSION,
  dryRunCommand,
  executeCommand,
  type Command,
  type TransactionCommitResult,
} from "@aevum/command-engine";
import type { CanonicalDesignDocument } from "@aevum/document-model";
import { ThreeFoundationError } from "./errors.js";
import { validate3DImportProposal } from "./proposal.js";
import { deterministicEntityId } from "./stable.js";
import type { ThreeImportProposal } from "./types.js";

export interface Compile3DImportTransactionInput {
  readonly proposal: ThreeImportProposal;
  readonly document: CanonicalDesignDocument;
  readonly actor: Command["actor"];
  readonly timestamp: string;
  readonly correlationId: string;
}

export function compile3DImportTransaction(input: Compile3DImportTransactionInput): Command {
  const validation = validate3DImportProposal(input.proposal, input.document);
  if (!validation.valid) {
    throw new ThreeFoundationError(
      "IMPORT_PROPOSAL_INVALID",
      "Cannot compile an invalid 3D import proposal.",
      validation.diagnostics,
    );
  }
  const scope = {
    proposalFingerprint: input.proposal.fingerprint,
    documentId: input.document.metadata.id,
    documentVersion: input.document.documentVersion,
    correlationId: input.correlationId,
  };
  return {
    id: deterministicEntityId("cmd", scope),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: input.document.metadata.id,
    expectedDocumentVersion: input.document.documentVersion,
    timestamp: input.timestamp,
    actor: input.actor,
    correlationId: input.correlationId,
    transactionId: deterministicEntityId("tx", scope),
    type: "scene3d.import",
    payload: {
      sourceAssetId: input.proposal.sourceAssetId,
      rootNodeIds: [...input.proposal.rootNodeIds],
      nodes: [...input.proposal.nodes],
      assets: [...input.proposal.assets],
      materials: [...input.proposal.materials],
      cameras: [...input.proposal.cameras],
      lights: [...input.proposal.lights],
    },
  };
}

export function dryRun3DImportProposal(input: Compile3DImportTransactionInput): TransactionCommitResult {
  return dryRunCommand(input.document, compile3DImportTransaction(input));
}

export function apply3DImportProposal(input: Compile3DImportTransactionInput): TransactionCommitResult {
  return executeCommand(input.document, compile3DImportTransaction(input));
}
