import { validateDocument, type CanonicalDesignDocument } from "@aevum/document-model";
import "./builtins.js";
import { type ChangeSet, mergeChanges } from "./changes.js";
import { commandError } from "./errors.js";
import type { CommandEvent, CommandEventDraft, CommandEventPublisher } from "./events.js";
import { deepFreeze } from "./freeze.js";
import { getCommand, parseRegisteredCommand } from "./registry.js";
import type { Command } from "./schemas.js";

export type TransactionState = "OPEN" | "COMMITTED" | "ROLLED_BACK" | "FAILED";

export interface AuditRecord {
  readonly id: string;
  readonly transactionId: string;
  readonly commandIds: readonly string[];
  readonly commandTypes: readonly string[];
  readonly documentId: string;
  readonly actor: Command["actor"];
  readonly timestamp: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly affectedEntityIds: readonly string[];
  readonly result: "SUCCEEDED";
}

export interface TransactionCommitResult {
  readonly oldDocument: CanonicalDesignDocument | null;
  readonly newDocument: CanonicalDesignDocument;
  readonly commands: readonly Command[];
  readonly changeSet: ChangeSet;
  readonly events: readonly CommandEvent[];
  readonly auditRecord: AuditRecord;
}

export interface BeginTransactionOptions {
  readonly transactionId: string;
  readonly publisher?: CommandEventPublisher;
}

export interface CommandTransaction {
  readonly id: string;
  readonly state: TransactionState;
  readonly document: CanonicalDesignDocument | null;
  execute(command: unknown): CommandTransaction;
  commit(): TransactionCommitResult;
  rollback(): CanonicalDesignDocument | null;
  beginNested(): never;
}

function assertDocumentValid(document: CanonicalDesignDocument, stage: string): void {
  const validation = validateDocument(document);
  if (!validation.success) {
    throw commandError("INVALID_RESULT", `Canonical Design Document validation failed ${stage}.`, {
      issues: validation.issues,
    });
  }
}

function finalizeDocument(
  initial: CanonicalDesignDocument | null,
  working: CanonicalDesignDocument,
  lastCommand: Command,
): CanonicalDesignDocument {
  const fromVersion = initial?.documentVersion ?? 0;
  const toVersion = fromVersion + 1;
  const next: CanonicalDesignDocument = {
    ...working,
    documentVersion: toVersion,
    parentVersionId: initial ? `${initial.metadata.id}@v${fromVersion}` : null,
    metadata: {
      ...working.metadata,
      updatedAt: lastCommand.timestamp,
      updatedBy: lastCommand.actor,
      version: toVersion,
      projectVersion: initial ? initial.metadata.projectVersion + 1 : working.metadata.projectVersion,
    },
  };
  assertDocumentValid(next, "after commit");
  return next;
}

function createEvents(
  drafts: readonly { readonly draft: CommandEventDraft; readonly command: Command }[],
  document: CanonicalDesignDocument,
): readonly CommandEvent[] {
  return drafts.map(({ draft, command }, index) => ({
    ...draft,
    id: `${command.transactionId}:event:${index}`,
    documentId: document.metadata.id,
    documentVersion: document.documentVersion,
    transactionId: command.transactionId,
    correlationId: command.correlationId,
    timestamp: command.timestamp,
  }));
}

class TransactionController implements CommandTransaction {
  #state: TransactionState = "OPEN";
  #working: CanonicalDesignDocument | null;
  readonly #initial: CanonicalDesignDocument | null;
  readonly #options: BeginTransactionOptions;
  readonly #commands: Command[] = [];
  readonly #applications: Array<ReturnType<ReturnType<typeof getCommand>["apply"]>> = [];
  readonly #eventDrafts: Array<{ readonly draft: CommandEventDraft; readonly command: Command }> = [];

  public constructor(initial: CanonicalDesignDocument | null, options: BeginTransactionOptions) {
    this.#initial = initial;
    this.#options = options;
    if (this.#initial) assertDocumentValid(this.#initial, "before transaction");
    this.#working = this.#initial;
  }

  public get id(): string {
    return this.#options.transactionId;
  }

  public get state(): TransactionState {
    return this.#state;
  }

  public get document(): CanonicalDesignDocument | null {
    return this.#working;
  }

  public execute(input: unknown): CommandTransaction {
    if (this.#state !== "OPEN") throw commandError("TRANSACTION_ERROR", `Transaction ${this.id} is ${this.#state}.`);
    try {
      const command = deepFreeze(parseRegisteredCommand(input));
      if (command.transactionId !== this.id) {
        throw commandError(
          "TRANSACTION_ERROR",
          `Command ${command.id} belongs to transaction ${command.transactionId}.`,
        );
      }
      const firstCommand = this.#commands[0];
      const previousCommand = this.#commands.at(-1);
      if (
        firstCommand &&
        (command.correlationId !== firstCommand.correlationId ||
          command.actor.id !== firstCommand.actor.id ||
          command.actor.type !== firstCommand.actor.type)
      ) {
        throw commandError(
          "TRANSACTION_ERROR",
          "All commands in a transaction must share actor and correlation context.",
        );
      }
      if (previousCommand && Date.parse(command.timestamp) < Date.parse(previousCommand.timestamp)) {
        throw commandError("TRANSACTION_ERROR", "Command timestamps must be nondecreasing within a transaction.");
      }
      const baseVersion = this.#initial?.documentVersion ?? 0;
      if (command.expectedDocumentVersion !== baseVersion) {
        throw commandError(
          "VERSION_MISMATCH",
          `Expected document version ${command.expectedDocumentVersion}, current version is ${baseVersion}.`,
          {
            expected: command.expectedDocumentVersion,
            actual: baseVersion,
          },
        );
      }
      if (this.#working && command.documentId !== this.#working.metadata.id) {
        throw commandError("CONFLICT_ERROR", `Command ${command.id} targets a different document.`, {
          expectedDocumentId: this.#working.metadata.id,
          actualDocumentId: command.documentId,
        });
      }
      if (this.#working && Date.parse(command.timestamp) < Date.parse(this.#working.metadata.updatedAt)) {
        throw commandError("CONFLICT_ERROR", "Command timestamp predates the current document update time.");
      }
      const definition = getCommand(command.type);
      definition.canExecute(this.#working, command);
      const application = definition.apply(this.#working, command);
      assertDocumentValid(application.document, `after ${command.type}`);
      this.#working = application.document;
      this.#commands.push(command);
      this.#applications.push(application);
      this.#eventDrafts.push({ draft: application.event, command });
      return this;
    } catch (error) {
      this.#working = this.#initial;
      this.#state = "FAILED";
      throw error;
    }
  }

  public commit(): TransactionCommitResult {
    if (this.#state !== "OPEN") throw commandError("TRANSACTION_ERROR", `Transaction ${this.id} is ${this.#state}.`);
    const working = this.#working;
    const lastCommand = this.#commands.at(-1);
    if (!working || !lastCommand) throw commandError("TRANSACTION_ERROR", "Cannot commit an empty transaction.");

    // finalizeDocument's post-commit validation can throw (e.g. a command's individual writes were
    // each valid but leave the document invalid as a whole). Without this guard the transaction was
    // left stuck in "OPEN" holding the fully-mutated #working document — indistinguishable from a
    // live transaction, so a caller that didn't separately catch and call rollback() could keep
    // executing further commands against already-corrupted state. Mirrors execute()'s own
    // fail-fast/reset-to-#initial behavior so commit() failures are never weaker than execute() ones.
    try {
      const newDocument = finalizeDocument(this.#initial, working, lastCommand);
      const merged = mergeChanges(this.#applications.map((application) => application.changes));
      const changeSet: ChangeSet = deepFreeze({
        ...merged,
        metadata: {
          commandIds: this.#commands.map((command) => command.id),
          transactionId: this.id,
          fromVersion: this.#initial?.documentVersion ?? 0,
          toVersion: newDocument.documentVersion,
        },
      });
      const affectedEntityIds = [...new Set([...merged.added, ...merged.removed, ...merged.updated, ...merged.moved])];
      const events = deepFreeze(createEvents(this.#eventDrafts, newDocument));
      const auditRecord: AuditRecord = deepFreeze({
        id: `${this.id}:audit`,
        transactionId: this.id,
        commandIds: this.#commands.map((command) => command.id),
        commandTypes: this.#commands.map((command) => command.type),
        documentId: newDocument.metadata.id,
        actor: lastCommand.actor,
        timestamp: lastCommand.timestamp,
        fromVersion: this.#initial?.documentVersion ?? 0,
        toVersion: newDocument.documentVersion,
        affectedEntityIds,
        result: "SUCCEEDED",
      });
      this.#working = newDocument;
      this.#state = "COMMITTED";
      this.#options.publisher?.publish(events);
      return Object.freeze({
        oldDocument: this.#initial,
        newDocument,
        commands: deepFreeze([...this.#commands]),
        changeSet,
        events,
        auditRecord,
      });
    } catch (error) {
      this.#working = this.#initial;
      this.#state = "FAILED";
      throw error;
    }
  }

  public rollback(): CanonicalDesignDocument | null {
    if (this.#state === "COMMITTED")
      throw commandError("TRANSACTION_ERROR", "A committed transaction cannot be rolled back.");
    this.#working = this.#initial;
    this.#state = "ROLLED_BACK";
    return this.#initial;
  }

  public beginNested(): never {
    throw commandError(
      "TRANSACTION_ERROR",
      "Nested transactions are reserved by the Phase 2 interface but not implemented.",
    );
  }
}

export function beginTransaction(
  document: CanonicalDesignDocument | null,
  options: BeginTransactionOptions,
): CommandTransaction {
  return new TransactionController(document, options);
}

export const begin = beginTransaction;

export function executeCommand(
  document: CanonicalDesignDocument | null,
  input: unknown,
  publisher?: CommandEventPublisher,
): TransactionCommitResult {
  const command = parseRegisteredCommand(input);
  return beginTransaction(document, { transactionId: command.transactionId, ...(publisher ? { publisher } : {}) })
    .execute(command)
    .commit();
}

export function dryRunCommand(document: CanonicalDesignDocument | null, input: unknown): TransactionCommitResult {
  return executeCommand(document, input);
}
