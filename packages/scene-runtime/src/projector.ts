import {
  CanonicalDesignDocumentSchema,
  CURRENT_SCHEMA_VERSION,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import {
  BoundedSceneProjectionCache,
  type SceneProjectionCache,
  type SceneProjectionCacheStatistics,
} from "./cache.js";
import { resolveRuntimeConfiguration, validateProjectionInput } from "./config.js";
import { buildDependencyGraph } from "./dependency-graph.js";
import { compareDiagnostics, hasStructuralFailure } from "./diagnostics.js";
import {
  ProjectionLimitExceededError,
  SceneProjectionError,
  StrictProjectionFailedError,
  UnsupportedSchemaVersionError,
} from "./errors.js";
import { deepFreeze, immutableMap } from "./immutable.js";
import { resolveDocumentReferences, resolveNodeReferences } from "./references.js";
import { resolveResponsiveOverrides } from "./responsive.js";
import { createProjectedInstanceId, createProjectionFingerprint } from "./stable.js";
import { composeWorldTransform, createLocalTransform } from "./transforms.js";
import {
  SCENE_PROJECTION_VERSION,
  type RuntimeComponentOrigin,
  type RuntimeDependencyEdge,
  type RuntimeDiagnostic,
  type RuntimeNode,
  type RuntimeReachability,
  type RuntimeViewport,
  type SceneProjectionResult,
  type SceneRuntimeConfiguration,
} from "./types.js";

interface TraversalFrame {
  readonly runtimeId: string;
  readonly sourceId: string;
  readonly parentRuntimeId?: string;
  readonly expectedParentSourceId?: string;
  readonly depth: number;
  readonly ancestors: ReadonlySet<string>;
  readonly componentStack: readonly string[];
  readonly componentOrigin?: RuntimeComponentOrigin;
}

interface ProjectionState {
  readonly nodes: Map<string, RuntimeNode>;
  readonly reachableSourceIds: Set<string>;
  readonly reachability: Map<string, RuntimeReachability>;
  readonly diagnostics: RuntimeDiagnostic[];
  readonly edges: RuntimeDependencyEdge[];
  maximumDepth: number;
  stoppedByLimit: boolean;
}

const threeDimensionalTypes = new Set<DesignNode["type"]>(["SCENE_3D", "MODEL_3D", "MESH_3D"]);

function diagnosticKey(diagnostic: RuntimeDiagnostic): string {
  return [diagnostic.code, diagnostic.path ?? "", diagnostic.entityId ?? "", ...(diagnostic.relatedIds ?? [])].join(
    "|",
  );
}

function finalizeDiagnostics(diagnostics: readonly RuntimeDiagnostic[]): RuntimeDiagnostic[] {
  const unique = new Map<string, RuntimeDiagnostic>();
  for (const diagnostic of diagnostics) unique.set(diagnosticKey(diagnostic), diagnostic);
  return [...unique.values()].sort(compareDiagnostics);
}

function schemaDiagnostics(input: unknown): { document?: CanonicalDesignDocument; diagnostics: RuntimeDiagnostic[] } {
  const parsed = CanonicalDesignDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "DOCUMENT_SCHEMA_INVALID",
        severity: "CRITICAL",
        message: issue.message,
        path: issue.path.join("."),
        recoverable: false,
        suggestedAction: "Migrate or repair the Canonical Design Document before projection.",
      })),
    };
  }
  if (parsed.data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      document: parsed.data,
      diagnostics: [
        {
          code: "UNSUPPORTED_SCHEMA_VERSION",
          severity: "CRITICAL",
          message: `Expected schema ${CURRENT_SCHEMA_VERSION}, received ${parsed.data.schemaVersion}.`,
          path: "schemaVersion",
          recoverable: false,
          suggestedAction: `Migrate the document to ${CURRENT_SCHEMA_VERSION}.`,
        },
      ],
    };
  }
  return { document: parsed.data, diagnostics: [] };
}

function hierarchyDiagnostic(
  state: ProjectionState,
  code: RuntimeDiagnostic["code"],
  message: string,
  entityId: string,
  relatedId: string | undefined,
  path: string,
): void {
  state.reachability.set(entityId, "INVALID_HIERARCHY");
  state.diagnostics.push({
    code,
    severity: "ERROR",
    message,
    entityId,
    entityType: "NODE",
    ...(relatedId ? { relatedIds: [relatedId] } : {}),
    path,
    recoverable: true,
    suggestedAction: "Repair the hierarchy through the Command Engine and project again.",
  });
}

function inspectCanonicalHierarchy(document: CanonicalDesignDocument, state: ProjectionState): void {
  for (const nodeId of Object.keys(document.nodes).sort()) {
    const node = document.nodes[nodeId];
    if (!node?.parentId) continue;
    const parent = document.nodes[node.parentId];
    if (!parent) {
      hierarchyDiagnostic(
        state,
        "MISSING_PARENT",
        `Node ${nodeId} references missing parent ${node.parentId}.`,
        nodeId,
        node.parentId,
        `nodes.${nodeId}.parentId`,
      );
    } else if (!parent.childIds.includes(nodeId)) {
      hierarchyDiagnostic(
        state,
        "PARENT_CHILD_MISMATCH",
        `Parent ${parent.id} does not declare child ${nodeId}.`,
        nodeId,
        parent.id,
        `nodes.${nodeId}.parentId`,
      );
    }
  }
}

function candidateChildren(
  document: CanonicalDesignDocument,
  sourceNode: DesignNode,
  frame: TraversalFrame,
  state: ProjectionState,
): TraversalFrame[] {
  const frames: TraversalFrame[] = [];
  const nextAncestors = new Set(frame.ancestors).add(sourceNode.id);
  for (const childId of sourceNode.childIds) {
    const child = document.nodes[childId];
    if (!child) {
      state.reachability.set(childId, "MISSING_REFERENCE");
      state.diagnostics.push({
        code: "MISSING_CHILD",
        severity: "ERROR",
        message: `Node ${sourceNode.id} references missing child ${childId}.`,
        entityId: sourceNode.id,
        entityType: sourceNode.type,
        relatedIds: [childId],
        path: `nodes.${sourceNode.id}.childIds`,
        recoverable: true,
        suggestedAction: "Remove the stale child reference or restore the node.",
      });
      continue;
    }
    if (nextAncestors.has(childId)) {
      hierarchyDiagnostic(
        state,
        "CYCLE_DETECTED",
        `Cycle detected from ${sourceNode.id} to ${childId}.`,
        sourceNode.id,
        childId,
        `nodes.${sourceNode.id}.childIds`,
      );
      state.reachability.set(childId, "INVALID_HIERARCHY");
      continue;
    }
    const runtimeId = frame.componentOrigin
      ? createProjectedInstanceId(frame.componentOrigin.instanceId, frame.componentOrigin.componentId, childId)
      : childId;
    frames.push({
      runtimeId,
      sourceId: childId,
      parentRuntimeId: frame.runtimeId,
      expectedParentSourceId: sourceNode.id,
      depth: frame.depth + 1,
      ancestors: nextAncestors,
      componentStack: frame.componentStack,
      ...(frame.componentOrigin ? { componentOrigin: { ...frame.componentOrigin, sourceNodeId: childId } } : {}),
    });
  }

  if (sourceNode.type !== "COMPONENT_INSTANCE") return frames;
  const component = document.components[sourceNode.componentId];
  if (!component) return frames;
  if (frame.componentStack.includes(component.id)) {
    state.diagnostics.push({
      code: "COMPONENT_RECURSION",
      severity: "ERROR",
      message: `Component recursion detected for ${component.id}.`,
      entityId: sourceNode.id,
      entityType: sourceNode.type,
      relatedIds: [...frame.componentStack, component.id],
      path: `nodes.${sourceNode.id}.componentId`,
      recoverable: true,
      suggestedAction: "Remove the recursive component instance.",
    });
    return frames;
  }
  const componentRoot = document.nodes[component.rootNodeId];
  if (!componentRoot) {
    state.diagnostics.push({
      code: "MISSING_NODE",
      severity: "ERROR",
      message: `Component ${component.id} references missing root ${component.rootNodeId}.`,
      entityId: component.id,
      entityType: "COMPONENT",
      relatedIds: [component.rootNodeId],
      path: `components.${component.id}.rootNodeId`,
      recoverable: true,
      suggestedAction: "Restore the component root or update the component definition.",
    });
    return frames;
  }
  const origin: RuntimeComponentOrigin = {
    instanceId: frame.runtimeId,
    componentId: component.id,
    sourceNodeId: componentRoot.id,
    ...(sourceNode.variantId ? { variantId: sourceNode.variantId } : {}),
    overrides: sourceNode.overrides,
  };
  frames.push({
    runtimeId: createProjectedInstanceId(frame.runtimeId, component.id, componentRoot.id),
    sourceId: componentRoot.id,
    parentRuntimeId: frame.runtimeId,
    depth: frame.depth + 1,
    ancestors: new Set(),
    componentStack: [...frame.componentStack, component.id],
    componentOrigin: origin,
  });
  return frames;
}

function projectReachableNodes(
  document: CanonicalDesignDocument,
  viewport: RuntimeViewport,
  configuration: SceneRuntimeConfiguration,
  state: ProjectionState,
): string[] {
  const roots: string[] = [];
  const seenRoots = new Set<string>();
  const stack: TraversalFrame[] = [];
  for (let index = document.rootNodeIds.length - 1; index >= 0; index -= 1) {
    const rootId = document.rootNodeIds[index];
    if (!rootId) continue;
    if (seenRoots.has(rootId)) {
      state.diagnostics.push({
        code: "DUPLICATE_ROOT",
        severity: "WARNING",
        message: `Root ${rootId} is declared more than once.`,
        entityId: rootId,
        entityType: "NODE",
        path: "rootNodeIds",
        recoverable: true,
        suggestedAction: "Remove the duplicate root reference through the Command Engine.",
      });
      continue;
    }
    seenRoots.add(rootId);
    const root = document.nodes[rootId];
    if (!root) {
      state.reachability.set(rootId, "MISSING_REFERENCE");
      state.diagnostics.push({
        code: "MISSING_ROOT",
        severity: "ERROR",
        message: `Root ${rootId} does not exist.`,
        entityId: rootId,
        entityType: "NODE",
        path: "rootNodeIds",
        recoverable: true,
        suggestedAction: "Restore the root node or remove the stale root reference.",
      });
      continue;
    }
    roots.unshift(rootId);
    stack.push({ runtimeId: rootId, sourceId: rootId, depth: 0, ancestors: new Set(), componentStack: [] });
  }

  while (stack.length > 0 && !state.stoppedByLimit) {
    const frame = stack.pop();
    if (!frame) break;
    if (frame.depth > configuration.maxDepth) {
      state.diagnostics.push({
        code: "MAX_DEPTH_EXCEEDED",
        severity: "CRITICAL",
        message: `Projection depth ${frame.depth} exceeds limit ${configuration.maxDepth}.`,
        entityId: frame.sourceId,
        entityType: "NODE",
        path: `nodes.${frame.sourceId}`,
        recoverable: true,
        suggestedAction: "Increase the configured depth limit or simplify the hierarchy.",
      });
      state.stoppedByLimit = true;
      break;
    }
    if (state.nodes.size >= configuration.maxNodes) {
      state.diagnostics.push({
        code: "MAX_NODE_COUNT_EXCEEDED",
        severity: "CRITICAL",
        message: `Projection node count exceeds limit ${configuration.maxNodes}.`,
        entityId: frame.sourceId,
        entityType: "NODE",
        recoverable: true,
        suggestedAction: "Increase the configured node limit or project a smaller document.",
      });
      state.stoppedByLimit = true;
      break;
    }
    if (state.nodes.has(frame.runtimeId)) {
      hierarchyDiagnostic(
        state,
        "PARENT_CHILD_MISMATCH",
        `Runtime node ${frame.runtimeId} is reachable through more than one parent.`,
        frame.sourceId,
        frame.parentRuntimeId,
        `nodes.${frame.sourceId}`,
      );
      continue;
    }
    const sourceNode = document.nodes[frame.sourceId];
    if (!sourceNode) continue;
    state.reachableSourceIds.add(sourceNode.id);
    if (!state.reachability.has(sourceNode.id)) state.reachability.set(sourceNode.id, "REACHABLE");

    if (!frame.componentOrigin) {
      if (frame.expectedParentSourceId !== undefined && sourceNode.parentId !== frame.expectedParentSourceId) {
        hierarchyDiagnostic(
          state,
          "PARENT_CHILD_MISMATCH",
          `Node ${sourceNode.id} declares parent ${sourceNode.parentId ?? "null"}, expected ${frame.expectedParentSourceId}.`,
          sourceNode.id,
          frame.expectedParentSourceId,
          `nodes.${sourceNode.id}.parentId`,
        );
      } else if (frame.expectedParentSourceId === undefined && sourceNode.parentId !== null) {
        hierarchyDiagnostic(
          state,
          "PARENT_CHILD_MISMATCH",
          `Root ${sourceNode.id} declares parent ${sourceNode.parentId}.`,
          sourceNode.id,
          sourceNode.parentId,
          `nodes.${sourceNode.id}.parentId`,
        );
      }
    }

    const resolved = resolveResponsiveOverrides(sourceNode, viewport);
    const localTransform = createLocalTransform(resolved.node.transform);
    const parent = frame.parentRuntimeId ? state.nodes.get(frame.parentRuntimeId) : undefined;
    const worldTransform = composeWorldTransform(localTransform, parent?.worldTransform);
    const children = candidateChildren(document, sourceNode, frame, state);
    const childIds = children.map((child) => child.runtimeId);
    const node: RuntimeNode = {
      id: frame.runtimeId,
      type: sourceNode.type,
      name: sourceNode.name,
      ...(frame.parentRuntimeId ? { parentId: frame.parentRuntimeId } : {}),
      childIds,
      depth: frame.depth,
      traversalIndex: state.nodes.size,
      visible: resolved.node.visible && (parent?.visible ?? true),
      locked: resolved.node.locked,
      effectiveOpacity: worldTransform.opacity,
      localTransform,
      worldTransform,
      ...(resolved.node.dimensions ? { dimensions: resolved.node.dimensions } : {}),
      ...(resolved.node.constraints ? { constraints: resolved.node.constraints } : {}),
      ...(resolved.node.type === "FRAME" ? { layout: resolved.node.layout } : {}),
      responsive: resolved.data,
      resolvedReferences: resolveNodeReferences(
        document,
        resolved.node,
        frame.runtimeId,
        state.diagnostics,
        state.edges,
      ),
      ...(frame.componentOrigin ? { componentOrigin: frame.componentOrigin } : {}),
      sourceNode,
    };
    state.nodes.set(frame.runtimeId, node);
    state.maximumDepth = Math.max(state.maximumDepth, frame.depth);
    if (frame.parentRuntimeId) {
      state.edges.push({ fromId: frame.runtimeId, toId: frame.parentRuntimeId, type: "NODE_PARENT" });
      state.edges.push({ fromId: frame.parentRuntimeId, toId: frame.runtimeId, type: "NODE_CHILD" });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) stack.push(child);
    }
  }
  return roots;
}

function createProjection(
  input: unknown,
  viewportInput: RuntimeViewport,
  configurationInput: Partial<SceneRuntimeConfiguration>,
): SceneProjectionResult {
  const startedAt = performance.now();
  const configuration = resolveRuntimeConfiguration(configurationInput);
  const viewport = validateProjectionInput(viewportInput);
  const validation = schemaDiagnostics(input);
  const initialDiagnostics = finalizeDiagnostics(validation.diagnostics);
  if (!validation.document)
    throw new SceneProjectionError(
      "The projection input is not a valid Canonical Design Document.",
      initialDiagnostics,
    );
  if (initialDiagnostics.some((entry) => entry.code === "UNSUPPORTED_SCHEMA_VERSION"))
    throw new UnsupportedSchemaVersionError(initialDiagnostics);
  const document = validation.document;
  const state: ProjectionState = {
    nodes: new Map(),
    reachableSourceIds: new Set(),
    reachability: new Map(),
    diagnostics: [],
    edges: [],
    maximumDepth: 0,
    stoppedByLimit: false,
  };
  inspectCanonicalHierarchy(document, state);
  const rootIds = projectReachableNodes(document, viewport, configuration, state);
  resolveDocumentReferences(document, state.diagnostics, state.edges);

  const unreachable = Object.keys(document.nodes)
    .sort()
    .filter((id) => !state.reachableSourceIds.has(id));
  for (const id of unreachable) {
    if (!state.reachability.has(id)) state.reachability.set(id, "UNREACHABLE");
    if (configuration.diagnostics) {
      state.diagnostics.push({
        code: "UNREACHABLE_NODE",
        severity: "WARNING",
        message: `Node ${id} is not reachable from a declared root or component instance.`,
        entityId: id,
        entityType: document.nodes[id]?.type ?? "NODE",
        path: `nodes.${id}`,
        recoverable: true,
        suggestedAction: "Attach the node to a root, retain it as a component source, or archive it explicitly.",
      });
    }
  }

  const projectedIds = new Set(state.nodes.keys());
  for (const [id, node] of state.nodes) {
    const filteredChildren = node.childIds.filter((childId) => projectedIds.has(childId));
    if (filteredChildren.length !== node.childIds.length) state.nodes.set(id, { ...node, childIds: filteredChildren });
  }
  const diagnostics = finalizeDiagnostics(state.diagnostics);
  if (configuration.strictMode && hasStructuralFailure(diagnostics)) {
    if (diagnostics.some((entry) => entry.code === "MAX_DEPTH_EXCEEDED" || entry.code === "MAX_NODE_COUNT_EXCEEDED"))
      throw new ProjectionLimitExceededError(diagnostics);
    throw new StrictProjectionFailedError(diagnostics);
  }

  const runtimeNodes = [...state.nodes.values()];
  const warningCount = diagnostics.filter((entry) => entry.severity === "WARNING").length;
  const errorCount = diagnostics.filter((entry) => entry.severity === "ERROR").length;
  const criticalCount = diagnostics.filter((entry) => entry.severity === "CRITICAL").length;
  const result: SceneProjectionResult = {
    documentId: document.metadata.id,
    documentVersion: document.documentVersion,
    schemaVersion: document.schemaVersion,
    projectionVersion: SCENE_PROJECTION_VERSION,
    viewport,
    qualityMode: viewport.qualityMode ?? document.settings.qualityMode,
    rootIds,
    nodes: immutableMap([...state.nodes].map(([id, node]) => [id, deepFreeze(node)] as const)),
    reachability: immutableMap([...state.reachability].sort(([left], [right]) => left.localeCompare(right))),
    dependencyGraph: buildDependencyGraph(state.edges),
    diagnostics,
    statistics: {
      totalCanonicalNodes: Object.keys(document.nodes).length,
      reachableNodes: state.reachableSourceIds.size,
      unreachableNodes: unreachable.length,
      runtimeProjectedNodes: state.nodes.size,
      maximumDepth: state.maximumDepth,
      assetReferences: state.edges.filter((edge) => edge.type === "USES_ASSET" || edge.type === "USES_FONT").length,
      componentInstances: runtimeNodes.filter((node) => node.type === "COMPONENT_INSTANCE").length,
      timelineReferences: state.edges.filter((edge) => edge.type === "USES_TIMELINE").length,
      twoDimensionalNodes: runtimeNodes.filter((node) => !threeDimensionalTypes.has(node.type)).length,
      threeDimensionalNodes: runtimeNodes.filter((node) => threeDimensionalTypes.has(node.type)).length,
      warningCount,
      errorCount,
      criticalCount,
      projectionDurationMs: Math.round((performance.now() - startedAt) * 1_000) / 1_000,
    },
    fingerprint: createProjectionFingerprint(document, viewport, configuration),
    complete: !hasStructuralFailure(diagnostics),
  };
  return deepFreeze(result);
}

export function projectScene(
  input: unknown,
  viewport: RuntimeViewport,
  configuration: Partial<SceneRuntimeConfiguration> = {},
): SceneProjectionResult {
  return createProjection(input, viewport, configuration);
}

export interface SceneProjectorOptions {
  readonly configuration?: Partial<SceneRuntimeConfiguration>;
  readonly cache?: SceneProjectionCache;
}

export class SceneProjector {
  readonly #configuration: SceneRuntimeConfiguration;
  readonly #cache: SceneProjectionCache | undefined;

  constructor(options: SceneProjectorOptions = {}) {
    this.#configuration = resolveRuntimeConfiguration(options.configuration);
    this.#cache = this.#configuration.enableCache
      ? (options.cache ?? new BoundedSceneProjectionCache(this.#configuration.cacheSize))
      : undefined;
  }

  project(input: unknown, viewportInput: RuntimeViewport): SceneProjectionResult {
    const validation = schemaDiagnostics(input);
    if (validation.document && validation.diagnostics.length === 0) {
      const viewport = validateProjectionInput(viewportInput);
      const fingerprint = createProjectionFingerprint(validation.document, viewport, this.#configuration);
      const cached = this.#cache?.get(fingerprint);
      if (cached) return cached;
    }
    const result = createProjection(input, viewportInput, this.#configuration);
    this.#cache?.set(result.fingerprint, result);
    return result;
  }

  clearCache(): void {
    this.#cache?.clear();
  }

  cacheStatistics(): SceneProjectionCacheStatistics {
    return this.#cache?.statistics() ?? Object.freeze({ hits: 0, misses: 0, entries: 0, evictions: 0 });
  }
}

export function createSceneProjector(options: SceneProjectorOptions = {}): SceneProjector {
  return new SceneProjector(options);
}
