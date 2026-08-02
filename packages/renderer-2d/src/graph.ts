import type { RuntimeNode, SceneProjectionResult } from "@aevum/scene-runtime";
import { resolveEffects } from "./effects.js";
import { deepFreeze, immutableMap } from "./immutable.js";
import { resolveRendererMetadata } from "./metadata.js";
import { resolvePaintOrder } from "./paint-order.js";
import { sha256 } from "./stable.js";
import { resolveStyle } from "./styles.js";
import {
  RENDERER_2D_VERSION,
  type ImageOperation,
  type RenderBackendHint,
  type RenderDiagnostic,
  type RenderGraph,
  type RenderGraphEdge,
  type RenderGraphNode,
  type RenderOperationKind,
  type VectorOperation,
  type VectorSource,
} from "./types.js";

function backendHint(node: RuntimeNode): RenderBackendHint {
  switch (node.type) {
    case "SVG":
    case "VECTOR":
    case "SHAPE":
      return "SVG";
    case "IMAGE":
      return "RASTER";
    case "CANVAS_LAYER":
      return "CANVAS";
    case "WEBGL_LAYER":
      return "WEBGL";
    default:
      return "DOM";
  }
}

function operationId(node: RuntimeNode, kind: RenderOperationKind): string {
  return `render:${node.id}:${kind.toLowerCase()}`;
}

function operationBase(node: RuntimeNode, kind: RenderOperationKind, order: number, parentOperationId?: string) {
  return {
    id: operationId(node, kind),
    kind,
    runtimeNodeId: node.id,
    canonicalNodeId: node.sourceNode.id,
    ...(parentOperationId ? { parentOperationId } : {}),
    order,
    depth: node.depth,
    backendHint: backendHint(node),
    opacity: node.effectiveOpacity,
    worldTransform: node.worldTransform,
    ...(node.dimensions ? { dimensions: node.dimensions } : {}),
    ...(node.constraints ? { constraints: node.constraints } : {}),
    ...(node.layout ? { layout: node.layout } : {}),
  };
}

function diagnosticKey(diagnostic: RenderDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.runtimeNodeId ?? "",
    diagnostic.path ?? "",
    ...(diagnostic.relatedIds ?? []),
  ].join("|");
}

function finalizeDiagnostics(input: readonly RenderDiagnostic[]): readonly RenderDiagnostic[] {
  const severity = { ERROR: 0, WARNING: 1, INFO: 2 } as const;
  const unique = new Map<string, RenderDiagnostic>();
  for (const diagnostic of input) unique.set(diagnosticKey(diagnostic), diagnostic);
  return [...unique.values()].sort(
    (left, right) =>
      severity[left.severity] - severity[right.severity] ||
      (left.runtimeNodeId ?? "").localeCompare(right.runtimeNodeId ?? "") ||
      left.code.localeCompare(right.code),
  );
}

function resolveMaskRuntimeIds(node: RuntimeNode, nodes: readonly RuntimeNode[]): string[] {
  return node.localTransform.maskIds.flatMap((maskId) => {
    const exact = nodes.find((candidate) => candidate.id === maskId);
    if (exact) return [exact.id];
    const component = nodes.find(
      (candidate) =>
        candidate.sourceNode.id === maskId &&
        candidate.componentOrigin?.instanceId === node.componentOrigin?.instanceId &&
        candidate.componentOrigin?.componentId === node.componentOrigin?.componentId,
    );
    return component ? [component.id] : [];
  });
}

function imageOperation(
  node: RuntimeNode,
  order: number,
  parentOperationId: string,
  diagnostics: RenderDiagnostic[],
): ImageOperation | undefined {
  if (node.sourceNode.type !== "IMAGE") return undefined;
  const source = node.sourceNode;
  const asset = node.resolvedReferences.assets.find((entry) => entry.id === source.assetId && entry.resolved)?.value;
  if (!asset) {
    diagnostics.push({
      code: "MISSING_ASSET",
      severity: "ERROR",
      message: `Image asset ${source.assetId} is unavailable to the renderer.`,
      runtimeNodeId: node.id,
      relatedIds: [source.assetId],
      path: `nodes.${source.id}.assetId`,
      recoverable: true,
    });
    return undefined;
  }
  const metadata = resolveRendererMetadata(node);
  diagnostics.push(...metadata.diagnostics);
  return {
    ...operationBase(node, "IMAGE", order, parentOperationId),
    kind: "IMAGE",
    asset: {
      id: asset.id,
      hash: asset.hash,
      mimeType: asset.mimeType,
      uri: asset.source.uri,
      ...(asset.dimensions?.width !== undefined ? { width: asset.dimensions.width } : {}),
      ...(asset.dimensions?.height !== undefined ? { height: asset.dimensions.height } : {}),
    },
    ...(source.crop ? { crop: source.crop } : {}),
    fit: source.objectFit,
    repeat: metadata.metadata.imageRepeat,
    alignment: metadata.metadata.imageAlignment,
  };
}

function vectorSource(node: RuntimeNode, diagnostics: RenderDiagnostic[]): VectorSource | undefined {
  const source = node.sourceNode;
  if (source.type === "SHAPE") return { type: "SHAPE", shapeType: source.shapeType, geometry: source.geometry };
  if (source.type === "VECTOR") return { type: "PATHS", paths: source.paths, windingRule: source.fillRule };
  if (source.type !== "SVG") return undefined;
  if (source.inlineSource) return { type: "INLINE_SVG", source: source.inlineSource, optimized: source.optimized };
  const asset = node.resolvedReferences.assets.find((entry) => entry.id === source.assetId && entry.resolved)?.value;
  if (asset) return { type: "SVG_ASSET", assetId: asset.id, hash: asset.hash, uri: asset.source.uri };
  diagnostics.push({
    code: "MISSING_ASSET",
    severity: "ERROR",
    message: `SVG node ${node.id} has no resolvable canonical asset or inline source.`,
    runtimeNodeId: node.id,
    ...(source.assetId ? { relatedIds: [source.assetId] } : {}),
    path: `nodes.${source.id}`,
    recoverable: true,
  });
  return undefined;
}

export function buildRenderGraph(projection: SceneProjectionResult): RenderGraph {
  const paintOrder = resolvePaintOrder(projection);
  const diagnostics: RenderDiagnostic[] = [...paintOrder.diagnostics];
  const operations: RenderGraphNode[] = [];
  const edges: RenderGraphEdge[] = [];
  const primaryIds = new Map<string, string>();
  let order = 0;

  for (const node of paintOrder.nodes) {
    const parentOperationId = node.parentId ? primaryIds.get(node.parentId) : undefined;
    const styleResolution = resolveStyle(node);
    diagnostics.push(...styleResolution.diagnostics);
    const paintId = operationId(node, "PAINT");
    operations.push({
      ...operationBase(node, "PAINT", order++, parentOperationId),
      kind: "PAINT",
      nodeType: node.type,
      style: styleResolution.style,
    });
    primaryIds.set(node.id, paintId);
    if (parentOperationId) edges.push({ fromId: parentOperationId, toId: paintId, type: "CONTAINS" });

    if (node.localTransform.clipping) {
      if (!node.dimensions) {
        diagnostics.push({
          code: "CLIPPING_CONFLICT",
          severity: "ERROR",
          message: `Clipping node ${node.id} has no resolved dimensions.`,
          runtimeNodeId: node.id,
          path: `nodes.${node.sourceNode.id}.dimensions`,
          recoverable: true,
        });
      } else {
        const clipId = operationId(node, "CLIP");
        operations.push({ ...operationBase(node, "CLIP", order++, paintId), kind: "CLIP", clipType: "BOUNDS" });
        edges.push({ fromId: clipId, toId: paintId, type: "CLIPS" });
      }
    }

    if (node.localTransform.maskIds.length > 0) {
      const metadata = resolveRendererMetadata(node);
      diagnostics.push(...metadata.diagnostics);
      const maskIds = resolveMaskRuntimeIds(node, paintOrder.nodes);
      if (maskIds.length > 0) {
        const maskOperationId = operationId(node, "MASK");
        operations.push({
          ...operationBase(node, "MASK", order++, paintId),
          kind: "MASK",
          maskType: metadata.metadata.maskType,
          sourceRuntimeNodeIds: maskIds,
        });
        edges.push({ fromId: maskOperationId, toId: paintId, type: "MASKS" });
      }
    }

    if (styleResolution.style.blendMode !== "NORMAL" || styleResolution.style.isolated) {
      const blendId = operationId(node, "BLEND");
      operations.push({
        ...operationBase(node, "BLEND", order++, paintId),
        kind: "BLEND",
        blendMode: styleResolution.style.blendMode,
        isolated: styleResolution.style.isolated,
      });
      edges.push({ fromId: blendId, toId: paintId, type: "BLENDS" });
    }

    if (node.sourceNode.type === "TEXT") {
      const unresolvedFonts = node.resolvedReferences.fonts.filter((entry) => !entry.resolved).map((entry) => entry.id);
      if (unresolvedFonts.length > 0) {
        diagnostics.push({
          code: "MISSING_ASSET",
          severity: "ERROR",
          message: `Text node ${node.id} references unavailable font assets.`,
          runtimeNodeId: node.id,
          relatedIds: unresolvedFonts,
          path: `nodes.${node.sourceNode.id}.runs`,
          recoverable: true,
        });
      }
      const textId = operationId(node, "TEXT");
      operations.push({
        ...operationBase(node, "TEXT", order++, paintId),
        kind: "TEXT",
        content: node.sourceNode.content,
        runs: node.sourceNode.runs,
        paragraphStyle: node.sourceNode.paragraphStyle,
        fontAssetIds: node.resolvedReferences.fonts.map((entry) => entry.id),
      });
      edges.push({ fromId: paintId, toId: textId, type: "CONTAINS" });
    }

    const image = imageOperation(node, order, paintId, diagnostics);
    if (image) {
      order += 1;
      operations.push(image);
      edges.push({ fromId: paintId, toId: image.id, type: "CONTAINS" });
    }

    const source = vectorSource(node, diagnostics);
    if (source) {
      const metadata = resolveRendererMetadata(node);
      diagnostics.push(...metadata.diagnostics);
      const vector: VectorOperation = {
        ...operationBase(node, "VECTOR", order++, paintId),
        kind: "VECTOR",
        source,
        fills: styleResolution.style.fills,
        strokes: styleResolution.style.strokes,
        ...(metadata.metadata.booleanOperation ? { booleanOperation: metadata.metadata.booleanOperation } : {}),
      };
      operations.push(vector);
      edges.push({ fromId: paintId, toId: vector.id, type: "CONTAINS" });
    }

    const effects = resolveEffects(node);
    diagnostics.push(...effects.diagnostics);
    if (effects.effects.length > 0) {
      const effectId = operationId(node, "EFFECT");
      operations.push({
        ...operationBase(node, "EFFECT", order++, paintId),
        kind: "EFFECT",
        effects: effects.effects,
      });
      edges.push({ fromId: effectId, toId: paintId, type: "APPLIES_EFFECT" });
    }
  }

  const finalizedDiagnostics = finalizeDiagnostics(diagnostics);
  const rootOperationIds = paintOrder.nodes
    .filter((node) => !node.parentId || !primaryIds.has(node.parentId))
    .map((node) => operationId(node, "PAINT"));
  const fingerprint = sha256({
    rendererVersion: RENDERER_2D_VERSION,
    projectionFingerprint: projection.fingerprint,
    viewport: projection.viewport,
    quality: projection.qualityMode,
    operations,
    edges,
    paintOrder: paintOrder.nodeIds,
    diagnostics: finalizedDiagnostics,
  });

  return deepFreeze({
    version: RENDERER_2D_VERSION,
    projectionFingerprint: projection.fingerprint,
    fingerprint,
    viewport: projection.viewport,
    quality: projection.qualityMode,
    rootOperationIds,
    operations: immutableMap(operations.map((operation) => [operation.id, deepFreeze(operation)] as const)),
    edges,
    paintOrder: paintOrder.nodeIds,
    diagnostics: finalizedDiagnostics,
  });
}
