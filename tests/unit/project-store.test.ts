import {
  CURRENT_COMMAND_VERSION,
  createCommandId,
  createTransactionId,
  replayHistory,
  type Command,
} from "@aevum/command-engine";
import { serialize, type CanonicalDesignDocument } from "@aevum/document-model";
import { createLockToken, createProjectStore, createSnapshotId, projectFixtures } from "@aevum/project-store";
import { describe, expect, it } from "vitest";

const TIME = "2026-08-01T03:00:00.000Z";
const LATER = "2026-08-01T04:00:00.000Z";

function renameCommand(document: CanonicalDesignDocument, name: string): Command {
  return {
    id: createCommandId(),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    timestamp: TIME,
    actor: { id: "store_tester", type: "USER" },
    correlationId: "corr_store_test",
    transactionId: createTransactionId(),
    type: "document.rename",
    payload: { name },
  };
}

function storeFromFixture(kind: "empty" | "history" | "transaction" | "rollback" = "history") {
  const fixture = projectFixtures[kind]();
  const store = createProjectStore({ project: fixture.project, document: fixture.document, openedAt: TIME });
  return { fixture, store };
}

describe("Project Store", () => {
  it("undoes and redoes by deterministic command replay", () => {
    const { fixture, store } = storeFromFixture();
    store.execute(fixture.commands[0]);
    const committed = serialize(store.getDocument());

    expect(store.getDocument().metadata.name).toBe("Renamed through history");
    expect(serialize(store.undo())).toBe(serialize(fixture.document));
    expect(serialize(store.redo())).toBe(committed);
    expect(store.getHistory()).toMatchObject({ cursor: 1, canUndo: true, canRedo: false });
  });

  it("drops the redo branch after a new commit", () => {
    const { fixture, store } = storeFromFixture();
    store.execute(fixture.commands[0]);
    store.undo();
    store.execute(renameCommand(store.getDocument(), "Alternate branch"));

    expect(store.getHistory().entries).toHaveLength(1);
    expect(store.getHistory().canRedo).toBe(false);
    expect(store.getDocument().metadata.name).toBe("Alternate branch");
  });

  it("dry-runs commands without changing current state or history", () => {
    const { store } = storeFromFixture("empty");
    const original = store.getDocument();
    const result = store.dryRun(renameCommand(original, "Proposed name"));

    expect(result.newDocument.metadata.name).toBe("Proposed name");
    expect(store.getDocument()).toBe(original);
    expect(store.getHistory().entries).toHaveLength(0);
  });

  it("replays stored history to the same document", () => {
    const { fixture, store } = storeFromFixture();
    const result = store.execute(fixture.commands[0]);
    const replayed = replayHistory(fixture.document, [{ commands: result.commands }]);
    expect(serialize(replayed.document)).toBe(serialize(result.newDocument));
  });

  it("creates immutable, serializable snapshots", () => {
    const { fixture, store } = storeFromFixture();
    store.execute(fixture.commands[0]);
    const snapshot = store.createSnapshot({ id: createSnapshotId(), createdAt: LATER, createdBy: "store_tester" });

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(store.listSnapshots()).toHaveLength(1);
    expect(serialize(store.readSnapshot(snapshot.id))).toBe(serialize(store.getDocument()));
  });

  it("enforces project lock ownership and expiry", () => {
    const { store } = storeFromFixture("empty");
    const first = { token: createLockToken(), ownerId: "worker-a", acquiredAt: TIME, expiresAt: LATER };
    store.acquireLock(first, TIME);
    expect(() =>
      store.acquireLock({ token: createLockToken(), ownerId: "worker-b", acquiredAt: TIME, expiresAt: LATER }, TIME),
    ).toThrow("locked by worker-a");
    expect(() => store.releaseLock(createLockToken())).toThrow("Lock token");
    store.releaseLock(first.token);
    expect(store.getLock(TIME)).toBeNull();
  });

  it("commits fixture transactions and leaves failed transactions untouched", () => {
    const transaction = storeFromFixture("transaction");
    const committed = transaction.store.transact(transaction.fixture.commands);
    expect(committed.newDocument.documentVersion).toBe(2);
    expect(committed.changeSet.added).toHaveLength(2);

    const rollback = storeFromFixture("rollback");
    const original = serialize(rollback.store.getDocument());
    expect(() => rollback.store.transact(rollback.fixture.commands)).toThrow();
    expect(serialize(rollback.store.getDocument())).toBe(original);
    expect(rollback.store.getHistory().entries).toHaveLength(0);
  });
});
