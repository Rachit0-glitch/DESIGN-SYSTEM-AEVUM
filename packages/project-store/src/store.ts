import {
  beginTransaction,
  commandError,
  deepFreeze,
  dryRunCommand,
  executeCommand,
  replayHistory,
  type CommandEventPublisher,
  type TransactionCommitResult,
} from "@aevum/command-engine";
import { deserialize, serialize, validateDocument, type CanonicalDesignDocument } from "@aevum/document-model";
import {
  OpenDocumentSchema,
  ProjectLockSchema,
  ProjectMetadataSchema,
  SnapshotSchema,
  WorkspaceSchema,
  type OpenDocument,
  type ProjectHistory,
  type ProjectHistoryEntry,
  type ProjectLock,
  type ProjectMetadata,
  type Project,
  type ProjectSnapshot,
  type Workspace,
} from "./schemas.js";

export interface CreateProjectStoreOptions {
  readonly project: ProjectMetadata;
  readonly document: CanonicalDesignDocument;
  readonly openedAt: string;
  readonly publisher?: CommandEventPublisher;
}

export interface SnapshotInput {
  readonly id: string;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface ProjectStore {
  readonly project: Project;
  readonly openDocument: OpenDocument;
  getDocument(): CanonicalDesignDocument;
  getHistory(): ProjectHistory;
  dryRun(command: unknown): TransactionCommitResult;
  execute(command: unknown): TransactionCommitResult;
  transact(commands: readonly unknown[]): TransactionCommitResult;
  undo(): CanonicalDesignDocument;
  redo(): CanonicalDesignDocument;
  createSnapshot(input: SnapshotInput): ProjectSnapshot;
  listSnapshots(): readonly ProjectSnapshot[];
  readSnapshot(snapshotId: string): CanonicalDesignDocument;
  acquireLock(lock: ProjectLock, now: string): ProjectLock;
  releaseLock(token: string): void;
  getLock(now: string): ProjectLock | null;
}

function assertValidSource(document: CanonicalDesignDocument): void {
  const result = validateDocument(document);
  if (!result.success) {
    throw commandError("INVALID_RESULT", "Project Store received an invalid Canonical Design Document.", {
      issues: result.issues,
    });
  }
}

function isExpired(lock: ProjectLock, now: string): boolean {
  return Date.parse(lock.expiresAt) <= Date.parse(now);
}

export function createProjectStore(options: CreateProjectStoreOptions): ProjectStore {
  let project = deepFreeze(ProjectMetadataSchema.parse(options.project));
  assertValidSource(options.document);
  if (project.id !== options.document.metadata.projectId) {
    throw commandError("CONFLICT_ERROR", "Project metadata does not match the document projectId.");
  }

  const baseline = options.document;
  let current = baseline;
  let entries: ProjectHistoryEntry[] = [];
  let cursor = 0;
  let snapshots: ProjectSnapshot[] = [];
  let lock: ProjectLock | null = null;

  const record = (result: TransactionCommitResult): TransactionCommitResult => {
    if (cursor < entries.length) entries = entries.slice(0, cursor);
    const entry: ProjectHistoryEntry = Object.freeze({
      commands: result.commands,
      documentVersion: result.newDocument.documentVersion,
      changeSet: result.changeSet,
      auditRecord: result.auditRecord,
      events: result.events,
    });
    entries = [...entries, entry];
    cursor = entries.length;
    current = result.newDocument;
    project = deepFreeze({ ...project, updatedAt: result.auditRecord.timestamp });
    return result;
  };

  const replayToCursor = (): CanonicalDesignDocument => {
    current = replayHistory(
      baseline,
      entries.slice(0, cursor).map((entry) => ({ commands: entry.commands })),
    ).document;
    return current;
  };

  return {
    get project() {
      return deepFreeze({
        metadata: project,
        currentDocumentId: current.metadata.id,
        currentDocumentVersion: current.documentVersion,
      });
    },
    get openDocument() {
      return OpenDocumentSchema.parse({
        projectId: project.id,
        documentId: current.metadata.id,
        documentVersion: current.documentVersion,
        openedAt: options.openedAt,
        dirty: cursor > 0,
      });
    },
    getDocument: () => current,
    getHistory: () => ({
      entries: Object.freeze([...entries]),
      cursor,
      canUndo: cursor > 0,
      canRedo: cursor < entries.length,
    }),
    dryRun(command) {
      return dryRunCommand(current, command);
    },
    execute(command) {
      return record(executeCommand(current, command, options.publisher));
    },
    transact(commands) {
      const first = commands[0];
      if (
        !first ||
        typeof first !== "object" ||
        !("transactionId" in first) ||
        typeof first.transactionId !== "string"
      ) {
        throw commandError("TRANSACTION_ERROR", "A transaction requires at least one command with a transactionId.");
      }
      const transaction = beginTransaction(current, {
        transactionId: first.transactionId,
        ...(options.publisher ? { publisher: options.publisher } : {}),
      });
      for (const command of commands) transaction.execute(command);
      return record(transaction.commit());
    },
    undo() {
      if (cursor === 0) throw commandError("CONFLICT_ERROR", "There is no transaction to undo.");
      cursor -= 1;
      return replayToCursor();
    },
    redo() {
      if (cursor >= entries.length) throw commandError("CONFLICT_ERROR", "There is no transaction to redo.");
      cursor += 1;
      return replayToCursor();
    },
    createSnapshot(input) {
      const snapshot = deepFreeze(
        SnapshotSchema.parse({
          id: input.id,
          projectId: project.id,
          documentId: current.metadata.id,
          documentVersion: current.documentVersion,
          schemaVersion: current.schemaVersion,
          historyCursor: cursor,
          createdAt: input.createdAt,
          createdBy: input.createdBy,
          serializedDocument: serialize(current),
        }),
      );
      snapshots = [...snapshots, snapshot];
      return snapshot;
    },
    listSnapshots: () => Object.freeze([...snapshots]),
    readSnapshot(snapshotId) {
      const snapshot = snapshots.find((entry) => entry.id === snapshotId);
      if (!snapshot) throw commandError("REFERENCE_MISSING", `Snapshot ${snapshotId} does not exist.`);
      const document = deserialize(snapshot.serializedDocument);
      if (document.documentVersion !== snapshot.documentVersion || document.metadata.id !== snapshot.documentId) {
        throw commandError("INVALID_RESULT", `Snapshot ${snapshotId} metadata does not match its document.`);
      }
      return document;
    },
    acquireLock(input, now) {
      if (Number.isNaN(Date.parse(now)))
        throw commandError("COMMAND_VALIDATION_ERROR", "Lock comparison time is invalid.");
      const candidate = ProjectLockSchema.parse(input);
      if (lock && !isExpired(lock, now) && lock.token !== candidate.token) {
        throw commandError("CONFLICT_ERROR", `Project ${project.id} is locked by ${lock.ownerId}.`, {
          ownerId: lock.ownerId,
          expiresAt: lock.expiresAt,
        });
      }
      lock = deepFreeze(candidate);
      return lock;
    },
    releaseLock(token) {
      if (lock && lock.token !== token)
        throw commandError("CONFLICT_ERROR", "Lock token does not match the active lock.");
      lock = null;
    },
    getLock(now) {
      if (lock && isExpired(lock, now)) lock = null;
      return lock;
    },
  };
}

export interface CreateWorkspaceOptions {
  readonly workspace: Workspace;
}

export function createWorkspace(options: CreateWorkspaceOptions): Workspace {
  return deepFreeze(WorkspaceSchema.parse(options.workspace));
}
