import type { DesignNode } from "@aevum/document-model";
import type { RuntimeResponsiveData, RuntimeViewport } from "./types.js";

type ResponsiveOverride = NonNullable<DesignNode["responsive"]>["breakpoints"][string];

function mergeOverride(node: DesignNode, override: ResponsiveOverride): DesignNode {
  return {
    ...node,
    ...(override.visible === undefined ? {} : { visible: override.visible }),
    ...(override.transform ? { transform: { ...node.transform, ...override.transform } } : {}),
    ...(override.dimensions ? { dimensions: { ...node.dimensions, ...override.dimensions } } : {}),
    ...("layout" in node && override.layout ? { layout: override.layout } : {}),
    ...("assetId" in node && override.assetId ? { assetId: override.assetId } : {}),
    ...(override.customData
      ? { metadata: { ...node.metadata, customData: { ...node.metadata.customData, ...override.customData } } }
      : {}),
  } as DesignNode;
}

function changedPaths(before: DesignNode, after: DesignNode): string[] {
  const candidates = ["visible", "transform", "dimensions", "layout", "assetId", "metadata.customData"];
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
  const applied: string[] = [];
  const breakpointCandidates = [
    ...new Set([viewport.category, viewport.id, viewport.breakpointId].filter(Boolean)),
  ] as string[];
  for (const key of breakpointCandidates) {
    const override = sourceNode.responsive.breakpoints[key];
    if (!override) continue;
    node = mergeOverride(node, override);
    applied.push(`breakpoint:${key}`);
  }

  const orientationOverride = sourceNode.responsive.orientations?.[viewport.orientation];
  if (orientationOverride) {
    node = mergeOverride(node, orientationOverride);
    applied.push(`orientation:${viewport.orientation}`);
  }

  const allKeys = Object.keys(sourceNode.responsive.breakpoints)
    .sort()
    .map((key) => `breakpoint:${key}`);
  const orientationKeys = Object.keys(sourceNode.responsive.orientations ?? {})
    .sort()
    .map((key) => `orientation:${key}`);
  return {
    node,
    data: {
      appliedOverrideKeys: applied,
      skippedOverrideKeys: [...allKeys, ...orientationKeys].filter((key) => !applied.includes(key)),
      changedPaths: changedPaths(sourceNode, node),
    },
  };
}
