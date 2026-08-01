import {
  CURRENT_COMMAND_VERSION,
  CommandEngineError,
  beginTransaction,
  createCommandId,
  createEventPublisher,
  createTransactionId,
  executeCommand,
  type Command,
} from "@aevum/command-engine";
import { createEntityId, createFrame, fixtures, type CanonicalDesignDocument } from "@aevum/document-model";
import { projectFixtures } from "@aevum/project-store";
import { describe, expect, it } from "vitest";

const TIME = "2026-08-01T02:00:00.000Z";
const actor = { id: "agent_phase2", type: "MCP_AGENT" as const };

function base(document: CanonicalDesignDocument, transactionId: string) {
  return {
    id: createCommandId(),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    timestamp: TIME,
    actor,
    correlationId: "corr_transaction_test",
    transactionId,
  } as const;
}

describe("Command transactions", () => {
  it("commits multiple commands atomically with one version increment", () => {
    const fixture = projectFixtures.transaction();
    const transaction = beginTransaction(fixture.document, { transactionId: fixture.commands[0]?.transactionId ?? "" });
    for (const command of fixture.commands) transaction.execute(command);
    const result = transaction.commit();

    expect(result.newDocument.documentVersion).toBe(2);
    expect(result.changeSet.added).toHaveLength(2);
    expect(result.commands).toHaveLength(2);
    expect(result.auditRecord.commandIds).toHaveLength(2);
    expect(transaction.state).toBe("COMMITTED");
  });

  it("resets all staged work when any command fails", () => {
    const fixture = projectFixtures.rollback();
    const transaction = beginTransaction(fixture.document, { transactionId: fixture.commands[0]?.transactionId ?? "" });
    transaction.execute(fixture.commands[0]);
    expect(() => transaction.execute(fixture.commands[1])).toThrow(CommandEngineError);

    expect(transaction.state).toBe("FAILED");
    expect(transaction.document).toBe(fixture.document);
    expect(transaction.rollback()).toBe(fixture.document);
    expect(transaction.state).toBe("ROLLED_BACK");
    expect(fixture.document.documentVersion).toBe(1);
  });

  it("supports explicit rollback without publishing events", () => {
    const document = fixtures.landingPage();
    const transactionId = createTransactionId();
    const publisher = createEventPublisher();
    const events: unknown[] = [];
    publisher.subscribe((event) => events.push(event));
    const command: Command = { ...base(document, transactionId), type: "document.rename", payload: { name: "Staged" } };
    const transaction = beginTransaction(document, { transactionId, publisher });
    transaction.execute(command);

    expect(events).toHaveLength(0);
    expect(transaction.rollback()).toBe(document);
    expect(events).toHaveLength(0);
  });

  it("publishes events only after a successful commit", () => {
    const document = fixtures.landingPage();
    const transactionId = createTransactionId();
    const publisher = createEventPublisher();
    const events: string[] = [];
    publisher.subscribe((event) => events.push(event.type));
    const transaction = beginTransaction(document, { transactionId, publisher });
    transaction.execute({ ...base(document, transactionId), type: "document.rename", payload: { name: "Committed" } });
    expect(events).toEqual([]);
    transaction.commit();
    expect(events).toEqual(["DocumentRenamed"]);
  });

  it("rejects hierarchy cycles before applying reparent operations", () => {
    const document = fixtures.landingPage();
    const frame = Object.values(document.nodes).find((node) => node.type === "FRAME");
    const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!frame || !text) throw new Error("Landing fixture requires frame and text nodes.");
    const command = {
      ...base(document, createTransactionId()),
      type: "node.reparent",
      payload: { nodeId: frame.id, parentId: text.id, index: 0 },
    };

    try {
      executeCommand(document, command);
      throw new Error("Expected cycle detection.");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandEngineError);
      expect((error as CommandEngineError).code).toBe("CYCLE_DETECTED");
    }
  });

  it("duplicates a complete subtree using caller-supplied stable IDs", () => {
    const document = fixtures.landingPage();
    const pageId = document.pages[0];
    const frame = Object.values(document.nodes).find((node) => node.type === "FRAME");
    const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!pageId || !frame || !text) throw new Error("Landing fixture is incomplete.");
    const duplicateFrameId = createEntityId("frame");
    const duplicateTextId = createEntityId("text");
    const result = executeCommand(document, {
      ...base(document, createTransactionId()),
      type: "node.duplicate",
      payload: {
        sourceNodeId: frame.id,
        parentId: pageId,
        index: 1,
        idMap: { [frame.id]: duplicateFrameId, [text.id]: duplicateTextId },
        name: "Hero copy",
      },
    });

    expect(result.newDocument.nodes[duplicateFrameId]?.childIds).toEqual([duplicateTextId]);
    expect(result.newDocument.nodes[duplicateTextId]?.parentId).toBe(duplicateFrameId);
    expect(result.changeSet.added).toEqual(expect.arrayContaining([duplicateFrameId, duplicateTextId]));
  });

  it("rejects structural fields in generic node updates", () => {
    const document = fixtures.landingPage();
    const nodeId = document.pages[0];
    if (!nodeId) throw new Error("Landing fixture requires a page.");
    expect(() =>
      executeCommand(document, {
        ...base(document, createTransactionId()),
        type: "node.update",
        payload: { nodeId, changes: { id: createEntityId("page") } },
      }),
    ).toThrow(CommandEngineError);
  });

  it("moves nodes deterministically within their parent", () => {
    const document = fixtures.landingPage();
    const pageId = document.pages[0];
    const existingFrame = Object.values(document.nodes).find((node) => node.type === "FRAME");
    if (!pageId || !existingFrame) throw new Error("Landing fixture is incomplete.");
    const addedFrame = createFrame(pageId, "Second frame");
    const transactionId = createTransactionId();
    const transaction = beginTransaction(document, { transactionId });
    transaction.execute({ ...base(document, transactionId), type: "node.create", payload: { node: addedFrame } });
    transaction.execute({
      ...base(document, transactionId),
      id: createCommandId(),
      type: "node.move",
      payload: { nodeId: addedFrame.id, index: 0 },
    });
    const result = transaction.commit();

    expect(result.newDocument.nodes[pageId]?.childIds).toEqual([addedFrame.id, existingFrame.id]);
    expect(result.changeSet.moved).toContain(addedFrame.id);
  });
});
