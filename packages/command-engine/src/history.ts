import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { Command } from "./schemas.js";
import { beginTransaction, type TransactionCommitResult } from "./transaction.js";

export interface HistoryTransaction {
  readonly commands: readonly Command[];
}

export interface ReplayResult {
  readonly document: CanonicalDesignDocument;
  readonly commits: readonly TransactionCommitResult[];
}

export function replayHistory(
  initialDocument: CanonicalDesignDocument,
  history: readonly HistoryTransaction[],
): ReplayResult {
  let document = initialDocument;
  const commits: TransactionCommitResult[] = [];
  for (const entry of history) {
    const first = entry.commands[0];
    if (!first) continue;
    const transaction = beginTransaction(document, { transactionId: first.transactionId });
    for (const command of entry.commands) {
      transaction.execute({ ...command, expectedDocumentVersion: document.documentVersion });
    }
    const commit = transaction.commit();
    document = commit.newDocument;
    commits.push(commit);
  }
  return { document, commits };
}
