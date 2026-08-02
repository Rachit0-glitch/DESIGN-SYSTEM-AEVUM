import type { RuntimeNode, SceneProjectionResult } from "@aevum/scene-runtime";
import { deepFreeze } from "./immutable.js";
import { resolveRendererMetadata } from "./metadata.js";
import type { PaintOrderResult, RenderDiagnostic } from "./types.js";

const supportedTypes = new Set<RuntimeNode["type"]>([
  "PAGE",
  "FRAME",
  "GROUP",
  "COMPONENT",
  "COMPONENT_INSTANCE",
  "TEXT",
  "IMAGE",
  "SHAPE",
  "SVG",
  "VECTOR",
  "CANVAS_LAYER",
  "WEBGL_LAYER",
]);

function isEffectivelyVisible(node: RuntimeNode, projection: SceneProjectionResult): boolean {
  let current: RuntimeNode | undefined = node;
  const visited = new Set<string>();
  while (current) {
    if (!current.visible || visited.has(current.id)) return false;
    visited.add(current.id);
    current = current.parentId ? projection.nodes.get(current.parentId) : undefined;
  }
  return true;
}

function maskRuntimeId(
  node: RuntimeNode,
  maskId: string,
  candidates: ReadonlyMap<string, RuntimeNode>,
): string | undefined {
  if (candidates.has(maskId)) return maskId;
  if (!node.componentOrigin) return undefined;
  for (const candidate of candidates.values()) {
    if (
      candidate.sourceNode.id === maskId &&
      candidate.componentOrigin?.instanceId === node.componentOrigin.instanceId &&
      candidate.componentOrigin.componentId === node.componentOrigin.componentId
    ) {
      return candidate.id;
    }
  }
  return undefined;
}

export function resolvePaintOrder(projection: SceneProjectionResult): PaintOrderResult {
  const diagnostics: RenderDiagnostic[] = [];
  const candidates = new Map<string, RuntimeNode>();
  const zIndexes = new Map<string, number>();

  for (const node of [...projection.nodes.values()].sort((left, right) => left.traversalIndex - right.traversalIndex)) {
    if (!isEffectivelyVisible(node, projection)) continue;
    if (!supportedTypes.has(node.type)) {
      diagnostics.push({
        code: "UNSUPPORTED_NODE",
        severity: "WARNING",
        message: `Node type ${node.type} is outside the Hybrid 2D Renderer contract.`,
        runtimeNodeId: node.id,
        path: `nodes.${node.sourceNode.id}.type`,
        recoverable: true,
      });
      continue;
    }
    const metadata = resolveRendererMetadata(node);
    diagnostics.push(...metadata.diagnostics);
    candidates.set(node.id, node);
    zIndexes.set(node.id, metadata.metadata.zIndex);
  }

  const byHierarchy: RuntimeNode[] = [];
  const visited = new Set<string>();
  const compare = (left: RuntimeNode, right: RuntimeNode): number =>
    (zIndexes.get(left.id) ?? 0) - (zIndexes.get(right.id) ?? 0) ||
    left.traversalIndex - right.traversalIndex ||
    left.id.localeCompare(right.id);

  const visit = (node: RuntimeNode): void => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    byHierarchy.push(node);
    const children: RuntimeNode[] = [];
    for (const childId of node.childIds) {
      const child = candidates.get(childId);
      if (!child) continue;
      if (child.parentId !== node.id) {
        diagnostics.push({
          code: "INVALID_PAINT_ORDER",
          severity: "ERROR",
          message: `Child ${child.id} does not identify ${node.id} as its runtime parent.`,
          runtimeNodeId: node.id,
          relatedIds: [child.id],
          recoverable: true,
        });
        continue;
      }
      children.push(child);
    }
    for (const child of children.sort(compare)) visit(child);
  };

  const roots = [...candidates.values()]
    .filter((node) => !node.parentId || !candidates.has(node.parentId))
    .sort(compare);
  for (const root of roots) visit(root);
  for (const node of [...candidates.values()].sort(compare)) {
    if (visited.has(node.id)) continue;
    diagnostics.push({
      code: "INVALID_PAINT_ORDER",
      severity: "ERROR",
      message: `Node ${node.id} was detached from deterministic hierarchy traversal.`,
      runtimeNodeId: node.id,
      recoverable: true,
    });
    visit(node);
  }

  const baseIndex = new Map(byHierarchy.map((node, index) => [node.id, index]));
  const outgoing = new Map<string, Set<string>>([...candidates.keys()].map((id) => [id, new Set()]));
  const indegree = new Map<string, number>([...candidates.keys()].map((id) => [id, 0]));
  const addDependency = (before: string, after: string): void => {
    if (before === after || outgoing.get(before)?.has(after)) return;
    outgoing.get(before)?.add(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  };

  for (const node of candidates.values()) {
    if (node.parentId && candidates.has(node.parentId)) addDependency(node.parentId, node.id);
    for (const sourceId of node.localTransform.maskIds) {
      const runtimeMaskId = maskRuntimeId(node, sourceId, candidates);
      if (!runtimeMaskId) {
        diagnostics.push({
          code: "CLIPPING_CONFLICT",
          severity: "ERROR",
          message: `Mask ${sourceId} is unavailable in the visible 2D projection.`,
          runtimeNodeId: node.id,
          relatedIds: [sourceId],
          path: `nodes.${node.sourceNode.id}.transform.maskIds`,
          recoverable: true,
        });
        continue;
      }
      addDependency(runtimeMaskId, node.id);
    }
  }

  const ready = [...candidates.keys()].filter((id) => indegree.get(id) === 0);
  const orderedIds: string[] = [];
  const sortReady = (): void => {
    ready.sort((left, right) => (baseIndex.get(left) ?? 0) - (baseIndex.get(right) ?? 0) || left.localeCompare(right));
  };
  sortReady();
  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) break;
    orderedIds.push(current);
    for (const target of outgoing.get(current) ?? []) {
      const next = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        sortReady();
      }
    }
  }

  if (orderedIds.length !== candidates.size) {
    diagnostics.push({
      code: "INVALID_PAINT_ORDER",
      severity: "ERROR",
      message: "Parent and mask dependencies contain a paint-order cycle; hierarchy order was retained.",
      relatedIds: [...candidates.keys()].filter((id) => !orderedIds.includes(id)).sort(),
      recoverable: true,
    });
    for (const node of byHierarchy) if (!orderedIds.includes(node.id)) orderedIds.push(node.id);
  }

  return deepFreeze({
    nodeIds: orderedIds,
    nodes: orderedIds.flatMap((id) => (candidates.get(id) ? [candidates.get(id) as RuntimeNode] : [])),
    diagnostics,
  });
}
