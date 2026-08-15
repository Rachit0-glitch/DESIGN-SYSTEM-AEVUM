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

export interface StudioCommandGateway {
  execute(command: Command): Promise<void>;
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
  readonly mode: "LOCAL" | "REMOTE";
  getSnapshot(): StudioSessionSnapshot;
  subscribe(listener: () => void): () => void;
  setViewport(viewportId: string, animationTime?: number, reducedMotion?: boolean): void;
  updateNode(nodeId: string, changes: Record<string, unknown>, options?: StudioMutationOptions): void | Promise<void>;
  /**
   * Reflects a node.update that an external gateway (e.g. the AI panel's agent gateway) has
   * already committed through its own MCP round trip into the local canonical document, without
   * issuing a second remote write. Without this, agent-driven edits are invisible in the
   * canvas/layers/properties panels until an unrelated action forces a rebuild.
   */
  acknowledgeAgentNodeUpdate(nodeId: string, changes: Record<string, unknown>, options?: StudioMutationOptions): void;
  /**
   * Replaces the local canonical document with one already fetched fresh from MCP (e.g. after a
   * multi-command server-side transaction such as reconstruction.import_reference, whose exact
   * command list isn't returned to the caller for a local replay). Trusts the given document as-is
   * — callers must have obtained it from a real document.get, not derived it themselves.
   */
  resyncDocument(document: CanonicalDesignDocument): void;
  moveNode(nodeId: string, index: number, options?: StudioMutationOptions): void | Promise<void>;
  duplicateNode(nodeId: string, options?: StudioMutationOptions): string;
  deleteNode(nodeId: string, options?: StudioMutationOptions): void | Promise<void>;
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
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
  readonly commandGateway?: StudioCommandGateway;
  readonly restoreFromPersistence?: boolean;
  readonly openedAt?: string;
}): StudioSession {
  const stored = input.restoreFromPersistence === false ? null : input.persistence.load(input.project.id);
  const initial = stored ? deserialize(stored) : input.document;
  let store = createProjectStore({
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
  const remoteUndo: { forward: Command; inverse: Command }[] = [];
  const remoteRedo: { forward: Command; inverse: Command }[] = [];
  let remotePending = false;

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
      history: input.commandGateway
        ? {
            ...store.getHistory(),
            canUndo: remoteUndo.length > 0,
            canRedo: remoteRedo.length > 0,
          }
        : store.getHistory(),
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
  const executeRemote = async (command: Command): Promise<void> => {
    if (remotePending) throw new Error("Another canonical edit is still being saved.");
    remotePending = true;
    saveState = "SAVING";
    notify();
    try {
      await input.commandGateway?.execute(command);
      store.execute(command);
      persist();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Canonical remote mutation failed.";
      saveState = message.includes("version") || message.includes("VERSION") ? "CONFLICT" : "ERROR";
      lastError = message;
      notify();
      remotePending = false;
      throw error;
    }
    remotePending = false;
    notify();
  };

  rebuild();
  return Object.freeze({
    mode: input.commandGateway ? "REMOTE" : "LOCAL",
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
      const forward: Command = {
        ...commandBase(document, options),
        type: "node.update",
        payload: { nodeId, changes },
      };
      if (!input.commandGateway) return execute(forward);
      const node = document.nodes[nodeId];
      if (!node) throw new Error(`Node ${nodeId} does not exist.`);
      const inverseChanges = Object.fromEntries(
        Object.keys(changes).map((key) => [key, node[key as keyof typeof node]]),
      );
      const inverse: Command = {
        ...commandBase(document, options),
        expectedDocumentVersion: document.documentVersion + 1,
        type: "node.update",
        payload: { nodeId, changes: inverseChanges },
      };
      return executeRemote(forward).then(() => {
        remoteUndo.push({ forward, inverse });
        remoteRedo.length = 0;
        notify();
      });
    },
    acknowledgeAgentNodeUpdate(nodeId: string, changes: Record<string, unknown>, options: StudioMutationOptions = {}) {
      const document = store.getDocument();
      execute({ ...commandBase(document, options), type: "node.update", payload: { nodeId, changes } });
    },
    resyncDocument(document: CanonicalDesignDocument) {
      store = createProjectStore({ project: input.project, document, openedAt: new Date().toISOString() });
      remoteUndo.length = 0;
      remoteRedo.length = 0;
      saveState = "SAVED";
      lastError = undefined;
      persist();
      notify();
    },
    moveNode(nodeId: string, index: number, options: StudioMutationOptions = {}) {
      const document = store.getDocument();
      const command: Command = { ...commandBase(document, options), type: "node.move", payload: { nodeId, index } };
      if (input.commandGateway) return executeRemote(command);
      execute(command);
      return undefined;
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
      const command: Command = {
        ...commandBase(document, options),
        type: "node.duplicate",
        payload: {
          sourceNodeId: nodeId,
          parentId: node.parentId,
          index: parentChildren.indexOf(nodeId) + 1,
          idMap,
          name: `${node.name} copy`,
        },
      };
      if (input.commandGateway) {
        // The new node's id is already deterministic and known client-side (idMap), so it's
        // returned synchronously the same way the local path always has. The remote write still
        // happens in the background; any failure surfaces through saveState/lastError like every
        // other remote mutation (see executeRemote), so this floating promise's rejection is
        // intentionally swallowed here rather than left as a duplicate, unhandled console warning
        // for an error already reported through that reactive channel.
        executeRemote(command).catch(() => undefined);
        return targetId;
      }
      execute(command);
      return targetId;
    },
    deleteNode(nodeId: string, options: StudioMutationOptions = {}) {
      const document = store.getDocument();
      const command: Command = { ...commandBase(document, options), type: "node.delete", payload: { nodeId } };
      if (input.commandGateway) return executeRemote(command);
      execute(command);
      return undefined;
    },
    undo() {
      if (input.commandGateway) {
        const entry = remoteUndo.pop();
        if (!entry) throw new Error("There is no remote edit to undo.");
        const document = store.getDocument();
        const inverse = {
          ...entry.inverse,
          ...commandBase(document),
          expectedDocumentVersion: document.documentVersion,
        };
        return executeRemote(inverse).then(() => {
          remoteRedo.push(entry);
          notify();
        });
      }
      store.undo();
      persist();
      notify();
      return undefined;
    },
    redo() {
      if (input.commandGateway) {
        const entry = remoteRedo.pop();
        if (!entry) throw new Error("There is no remote edit to redo.");
        const document = store.getDocument();
        const forward = {
          ...entry.forward,
          ...commandBase(document),
          expectedDocumentVersion: document.documentVersion,
        };
        return executeRemote(forward).then(() => {
          remoteUndo.push(entry);
          notify();
        });
      }
      store.redo();
      persist();
      notify();
      return undefined;
    },
  });
}
