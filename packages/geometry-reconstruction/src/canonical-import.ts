import { CURRENT_COMMAND_VERSION, type Command } from "@aevum/command-engine";
import type { AssetRecord, CanonicalDesignDocument } from "@aevum/document-model";
import { compile3DImportTransaction, create3DImportProposal } from "@aevum/renderer-3d";
import { deterministicCommandId, deterministicTransactionId } from "./deterministic.js";

export interface BuildCanonicalImportPlanInput {
  readonly document: CanonicalDesignDocument;
  readonly asset: AssetRecord;
  readonly bytes: Uint8Array;
  readonly actor: Command["actor"];
  readonly timestamp: string;
  readonly correlationId: string;
}

export interface CanonicalImportPlan {
  readonly registerAssetCommand: Command;
  readonly importCommand: Command;
}

/**
 * Builds — but never executes — the two already-existing Command Engine commands needed to bring
 * a registered candidate GLB into the canonical document: `asset.register`, then `scene3d.import`
 * (reusing Phase 14's `create3DImportProposal`/`compile3DImportTransaction` unchanged). No new
 * command type is introduced; the caller (Agent, MCP tool, or test) executes both in order.
 */
export async function buildCanonicalImportPlan(input: BuildCanonicalImportPlanInput): Promise<CanonicalImportPlan> {
  const scope = { documentId: input.document.metadata.id, assetId: input.asset.id, correlationId: input.correlationId };

  const registerAssetCommand: Command = {
    id: deterministicCommandId({ ...scope, type: "asset.register" }),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: input.document.metadata.id,
    expectedDocumentVersion: input.document.documentVersion,
    timestamp: input.timestamp,
    actor: input.actor,
    correlationId: input.correlationId,
    transactionId: deterministicTransactionId({ ...scope, type: "asset.register" }),
    type: "asset.register",
    payload: { asset: input.asset },
  };

  // The import command targets the document version asset.register will have produced, so both
  // commands can be executed back-to-back by the caller without a stale-version conflict.
  const workingDocument: CanonicalDesignDocument = {
    ...input.document,
    documentVersion: input.document.documentVersion + 1,
    assets: { ...input.document.assets, [input.asset.id]: input.asset },
  };

  const proposal = await create3DImportProposal({
    canonicalDocument: workingDocument,
    asset: input.asset,
    bytes: input.bytes,
  });

  const importCommand = compile3DImportTransaction({
    proposal,
    document: workingDocument,
    actor: input.actor,
    timestamp: input.timestamp,
    correlationId: input.correlationId,
  });

  return { registerAssetCommand, importCommand };
}
