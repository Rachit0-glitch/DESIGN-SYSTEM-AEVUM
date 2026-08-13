import { CURRENT_COMMAND_VERSION, type Command } from "@aevum/command-engine";
import { deserialize, serialize, type CanonicalDesignDocument } from "@aevum/document-model";
import { createProjectStore, type ProjectMetadata, type ProjectStore } from "@aevum/project-store";
import { render, type RendererOutput } from "@aevum/renderer-2d";
import { createSceneProjector, type RuntimeViewport, type SceneProjectionResult } from "@aevum/scene-runtime";

export type StudioSaveState = "SAVED" | "SAVING" | "CONFLICT" | "ERROR";

export interface StudioPersistenceAdapter {
  load(projectId: string): string | null;
  save(projectId: string, serializedDocument: string): void;
}

export interface StudioSessionSnapshot {
  readonly document: CanonicalDesignDocument;
  readonly projection: SceneProjectionResult;
  readonly renderer: RendererOutput;
  readonly viewportId: string;
  readonly saveState: StudioSaveState;
  readonly history: ProjectStore["getHistory"] extends () => infer T ? T : never;
  readonly lastError?: string;
}

export interface StudioMutationOptions {
  readonly actor?: Command["actor"];
  readonly expectedDocumentVersion?: number;
  readonly correlationId?: string;
}

export interface StudioSession {
  getSnapshot(): StudioSessionSnapshot;
  subscribe(listener: () => void): () => void;
  setViewport(viewportId: string, animationTime?: number, reducedMotion?: boolean): void;
  updateNode(nodeId: string, changes: Record<string, unknown>, options?: StudioMutationOptions): void;
  moveNode(nodeId: string, index: number, options?: StudioMutationOptions): void;
  duplicateNode(nodeId: string, options?: StudioMutationOptions): string;
  deleteNode(nodeId: string, options?: StudioMutationOptions): void;
  undo(): void;
  redo(): void;
}

const humanActor = Object.freeze({ id: "studio-user", type: "USER" as const, displayName: "You" });
const uuid = (): string => globalThis.crypto.randomUUID();

function runtimeViewport(
  document: CanonicalDesignDocument,
  viewportId: string,
  time = 0,
  reducedMotion = false,
): RuntimeViewport {
  const viewport = document.settings.viewports[viewportId];
  if (!viewport) throw new Error(`Viewport ${viewportId} does not exist.`);
  return {
    id: viewport.id,
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor,
    orientation: viewport.orientation,
    category: viewport.category,
    reducedMotion,
    breakpointId: viewport.category.toLowerCase(),
    qualityMode: document.settings.qualityMode,
    ...(time > 0
      ? {
          animation: {
            time,
            active: true,
            playbackState: "PAUSED" as const,
            timelineIds: Object.keys(document.timelines),
          },
        }
      : {}),
  };
}

function commandBase(document: CanonicalDesignDocument, options: StudioMutationOptions = {}) {
  const transactionId = `tx_${uuid()}`;
  return {
    id: `cmd_${uuid()}`,
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: document.metadata.id,
    expectedDocumentVersion: options.expectedDocumentVersion ?? document.documentVersion,
    timestamp: new Date().toISOString(),
    actor: options.actor ?? humanActor,
    correlationId: options.correlationId ?? `studio_${uuid()}`,
    transactionId,
  } as const;
}

function subtree(document: CanonicalDesignDocument, rootId: string): string[] {
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const node = document.nodes[current];
    if (!node) continue;
    result.push(current);
    stack.push(...node.childIds);
  }
  return result;
}

export function createMemoryPersistence(): StudioPersistenceAdapter {
  const values = new Map<string, string>();
  return Object.freeze({
    load: (projectId: string) => values.get(projectId) ?? null,
    save: (projectId: string, value: string) => values.set(projectId, value),
  });
}

export function createStudioSession(input: {
  readonly project: ProjectMetadata;
  readonly document: CanonicalDesignDocument;
  readonly persistence: StudioPersistenceAdapter;
  readonly openedAt?: string;
}): StudioSession {
  const stored = input.persistence.load(input.project.id);
  const initial = stored ? deserialize(stored) : input.document;
  const store = createProjectStore({
    project: input.project,
    document: initial,
    openedAt: input.openedAt ?? new Date().toISOString(),
  });
  const projector = createSceneProjector({ configuration: { strictMode: true, enableCache: true } });
  const listeners = new Set<() => void>();
  let viewportId = initial.settings.defaultViewportId;
  let animationTime = 1.1;
  let reducedMotion = false;
  let saveState: StudioSaveState = "SAVED";
  let lastError: string | undefined;
  let snapshot: StudioSessionSnapshot;

  const rebuild = (): void => {
    const document = store.getDocument();
    const projection = projector.project(document, runtimeViewport(document, viewportId, animationTime, reducedMotion));
    const renderer = render(projection);
    snapshot = Object.freeze({
      document,
      projection,
      renderer,
      viewportId,
      saveState,
      history: store.getHistory(),
      ...(lastError ? { lastError } : {}),
    });
  };
  const notify = (): void => {
    rebuild();
    for (const listener of listeners) listener();
  };
  const persist = (): void => {
    saveState = "SAVING";
    try {
      input.persistence.save(input.project.id, serialize(store.getDocument()));
      saveState = "SAVED";
      lastError = undefined;
    } catch (error) {
      saveState = "ERROR";
      lastError = error instanceof Error ? error.message : "Project persistence failed.";
    }
  };
  const execute = (command: Command): void => {
    try {
      store.execute(command);
      persist();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Canonical mutation failed.";
      saveState = message.includes("version") || message.includes("VERSION") ? "CONFLICT" : "ERROR";
      lastError = message;
      notify();
      throw error;
    }
    notify();
  };

  rebuild();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setViewport(nextViewportId: string, time = animationTime, motion = reducedMotion) {
      viewportId = nextViewportId;
      animationTime = Math.max(0, time);
      reducedMotion = motion;
      notify();
    },
    updateNode(nodeId: string, changes: Record<string, unknown>, options: StudioMutationOptions = {}) {
      const document = store.getDocument();
      execute({ ...commandBase(document, options), type: "node.update", payload: { nodeId, changes } });
    },
    moveNode(nodeId: string, index: number, options: StudioMutationOptions = {}) {
      const document = store.getDocument();
      execute({ ...commandBase(document, options), type: "node.move", payload: { nodeId, index } });
    },
    duplicateNode(nodeId: string, options: StudioMutationOptions = {}) {
      const document = store.getDocument();
      const node = document.nodes[nodeId];
      if (!node) throw new Error(`Node ${nodeId} does not exist.`);
      const ids = subtree(document, nodeId);
      const idMap = Object.fromEntries(
        ids.map((sourceId) => [sourceId, `${document.nodes[sourceId]?.type.toLowerCase() ?? "node"}_${uuid()}`]),
      );
      const parentChildren = node.parentId ? (document.nodes[node.parentId]?.childIds ?? []) : document.rootNodeIds;
      const targetId = idMap[nodeId];
      if (!targetId) throw new Error("Duplicate identity allocation failed.");
      execute({
        ...commandBase(document, options),
        type: "node.duplicate",
        payload: {
          sourceNodeId: nodeId,
          parentId: node.parentId,
          index: parentChildren.indexOf(nodeId) + 1,
          idMap,
          name: `${node.name} copy`,
        },
      });
      return targetId;
    },
    deleteNode(nodeId: string, options: StudioMutationOptions = {}) {
      const document = store.getDocument();
      execute({ ...commandBase(document, options), type: "node.delete", payload: { nodeId } });
    },
    undo() {
      store.undo();
      persist();
      notify();
    },
    redo() {
      store.redo();
      persist();
      notify();
    },
  });
}
