import type { DesignNode, ResponsiveOverrideSchema } from "@aevum/document-model";
import type { z } from "zod";
import type { RuntimeResponsiveData, RuntimeViewport } from "./types.js";

type ResponsiveOverride = z.infer<typeof ResponsiveOverrideSchema>;

function mergeOverride(node: DesignNode, override: ResponsiveOverride): DesignNode {
  const next = {
    ...node,
    ...(override.visible === undefined ? {} : { visible: override.visible }),
    ...(override.transform ? { transform: { ...node.transform, ...override.transform } } : {}),
    ...(override.dimensions ? { dimensions: { ...node.dimensions, ...override.dimensions } } : {}),
    ...(override.constraints ? { constraints: { ...node.constraints, ...override.constraints } } : {}),
    ...(override.childOrder ? { childIds: override.childOrder } : {}),
    ...("layout" in node && override.layout ? { layout: override.layout } : {}),
    ...("assetId" in node && override.assetId ? { assetId: override.assetId } : {}),
    ...((node.type === "IMAGE" || node.type === "VIDEO") && override.crop ? { crop: override.crop } : {}),
    ...((node.type === "IMAGE" || node.type === "VIDEO") && override.objectFit
      ? { objectFit: override.objectFit }
      : {}),
    ...(node.type === "TEXT" && override.textStyle
      ? { runs: node.runs.map((run) => ({ ...run, style: { ...run.style, ...override.textStyle } })) }
      : {}),
    ...(node.type === "TEXT" && override.paragraphStyle
      ? { paragraphStyle: { ...node.paragraphStyle, ...override.paragraphStyle } }
      : {}),
    ...(node.type === "SCENE_3D" && override.activeCameraId ? { activeCameraId: override.activeCameraId } : {}),
    ...(override.customData
      ? { metadata: { ...node.metadata, customData: { ...node.metadata.customData, ...override.customData } } }
      : {}),
  };
  return next as DesignNode;
}

function changedPaths(before: DesignNode, after: DesignNode): string[] {
  const candidates = [
    "visible",
    "transform",
    "dimensions",
    "constraints",
    "childIds",
    "layout",
    "assetId",
    "crop",
    "objectFit",
    "runs",
    "paragraphStyle",
    "activeCameraId",
    "metadata.customData",
  ];
  const getValue = (node: DesignNode, path: string): unknown =>
    path
      .split(".")
      .reduce<unknown>(
        (value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined),
        node,
      );
  return candidates.filter((path) => JSON.stringify(getValue(before, path)) !== JSON.stringify(getValue(after, path)));
}

export function resolveResponsiveOverrides(
  sourceNode: DesignNode,
  viewport: RuntimeViewport,
): { readonly node: DesignNode; readonly data: RuntimeResponsiveData } {
  if (!sourceNode.responsive) {
    return { node: sourceNode, data: { appliedOverrideKeys: [], skippedOverrideKeys: [], changedPaths: [] } };
  }

  let node = sourceNode;
  let motion: RuntimeResponsiveData["motion"];
  const applied: string[] = [];
  const apply = (key: string, override: ResponsiveOverride | undefined): void => {
    if (!override) return;
    node = mergeOverride(node, override);
    if (override.motion) motion = override.motion;
    applied.push(key);
  };

  const breakpointCandidates = [
    ...new Set([viewport.category, viewport.id, viewport.breakpointId].filter(Boolean)),
  ] as string[];
  for (const key of breakpointCandidates) apply(`breakpoint:${key}`, sourceNode.responsive.breakpoints[key]);
  for (const key of viewport.containerQueryIds ?? []) {
    apply(`container:${key}`, sourceNode.responsive.containerQueries?.[key]);
  }
  apply(`orientation:${viewport.orientation}`, sourceNode.responsive.orientations?.[viewport.orientation]);
  if (viewport.reducedMotion) apply("reduced-motion", sourceNode.responsive.reducedMotionOverride);
  if (viewport.qualityMode) {
    apply(`quality:${viewport.qualityMode}`, sourceNode.responsive.qualityProfileOverrides?.[viewport.qualityMode]);
  }

  const declared = [
    ...Object.keys(sourceNode.responsive.breakpoints).map((key) => `breakpoint:${key}`),
    ...Object.keys(sourceNode.responsive.containerQueries ?? {}).map((key) => `container:${key}`),
    ...Object.keys(sourceNode.responsive.orientations ?? {}).map((key) => `orientation:${key}`),
    ...(sourceNode.responsive.reducedMotionOverride ? ["reduced-motion"] : []),
    ...Object.keys(sourceNode.responsive.qualityProfileOverrides ?? {}).map((key) => `quality:${key}`),
  ].sort();
  return {
    node,
    data: {
      appliedOverrideKeys: applied,
      skippedOverrideKeys: declared.filter((key) => !applied.includes(key)),
      changedPaths: changedPaths(sourceNode, node),
      ...(motion ? { motion } : {}),
    },
  };
}
