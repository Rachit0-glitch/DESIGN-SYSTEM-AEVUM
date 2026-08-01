import { CURRENT_COMMAND_VERSION, createCommandId, createTransactionId, type Command } from "@aevum/command-engine";
import {
  createDocument,
  createFrame,
  createPage,
  fixtures as documentFixtures,
  type CanonicalDesignDocument,
} from "@aevum/document-model";
import { createWorkspaceId } from "./ids.js";
import type { ProjectMetadata } from "./schemas.js";

const FIXTURE_TIME = "2026-08-01T00:00:00.000Z";
const actor = { id: "fixture-builder", type: "SYSTEM" as const, displayName: "AEVUM fixtures" };

export interface ProjectFixture {
  readonly project: ProjectMetadata;
  readonly document: CanonicalDesignDocument;
  readonly commands: readonly Command[];
}

function projectFor(document: CanonicalDesignDocument, name: string): ProjectMetadata {
  return {
    id: document.metadata.projectId,
    workspaceId: createWorkspaceId(),
    name,
    description: `${name} Phase 2 fixture`,
    tags: ["fixture", "phase2"],
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
}

function commandBase(document: CanonicalDesignDocument, transactionId: string) {
  return {
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    timestamp: FIXTURE_TIME,
    actor,
    correlationId: "corr_phase2_fixture",
    transactionId,
  } as const;
}

export function createEmptyProjectFixture(): ProjectFixture {
  const document = createDocument({ name: "Empty project", now: FIXTURE_TIME, actorId: actor.id });
  return { project: projectFor(document, "Empty project"), document, commands: [] };
}

export function createHistoryProjectFixture(): ProjectFixture {
  const document = documentFixtures.landingPage();
  const transactionId = createTransactionId();
  const command: Command = {
    ...commandBase(document, transactionId),
    id: createCommandId(),
    type: "document.rename",
    payload: { name: "Renamed through history" },
  };
  return { project: projectFor(document, "History project"), document, commands: [command] };
}

export function createTransactionProjectFixture(): ProjectFixture {
  const document = createDocument({ name: "Transaction project", now: FIXTURE_TIME, actorId: actor.id });
  const page = createPage("Home");
  const frame = createFrame(page.id, "Hero");
  const transactionId = createTransactionId();
  const base = commandBase(document, transactionId);
  const commands: Command[] = [
    { ...base, id: createCommandId(), type: "page.create", payload: { page } },
    { ...base, id: createCommandId(), type: "node.create", payload: { node: frame } },
  ];
  return { project: projectFor(document, "Transaction project"), document, commands };
}

export function createRollbackProjectFixture(): ProjectFixture {
  const document = documentFixtures.landingPage();
  const pageId = document.pages[0];
  if (!pageId) throw new Error("Rollback fixture requires a page.");
  const frame = createFrame(pageId, "Temporary frame");
  const transactionId = createTransactionId();
  const base = commandBase(document, transactionId);
  const commands: Command[] = [
    { ...base, id: createCommandId(), type: "node.create", payload: { node: frame } },
    { ...base, id: createCommandId(), type: "node.create", payload: { node: frame } },
  ];
  return { project: projectFor(document, "Rollback project"), document, commands };
}

export const projectFixtures = {
  empty: createEmptyProjectFixture,
  history: createHistoryProjectFixture,
  transaction: createTransactionProjectFixture,
  rollback: createRollbackProjectFixture,
} as const;
