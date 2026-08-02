import type { CanonicalDesignDocument, DesignNode } from "@aevum/document-model";
import type { RenderGraph, RenderGraphNode } from "@aevum/renderer-2d";
import type { RuntimeNode, SceneProjectionResult } from "@aevum/scene-runtime";
import { deepFreeze } from "./immutable.js";
import {
  StructuralValidationResultSchema,
  ValidationDifferenceSchema,
  ValidationRegionResultSchema,
  type StructuralValidationResult,
  type ValidationCorrectionKind,
  type ValidationDifference,
  type ValidationMetric,
  type ValidationReferenceRegion,
  type ValidationReferenceSnapshot,
  type ValidationRegionResult,
  type ValidationThresholdProfile,
} from "./schemas.js";
import { deterministicId, stableStringify } from "./stable.js";

interface Check {
  readonly metric: ValidationMetric;
  readonly score: number;
  readonly difference?: ValidationDifference;
}

export interface RegionComparisonResult {
  readonly regions: readonly ValidationRegionResult[];
  readonly differences: readonly ValidationDifference[];
}

export interface StructuralComparisonResult {
  readonly summary: StructuralValidationResult;
  readonly differences: readonly ValidationDifference[];
}

function json(value: unknown): unknown {
  if (value === undefined) return null;
  return JSON.parse(stableStringify(value)) as unknown;
}

function lengthValue(length: { readonly value: number } | undefined): number | null {
  return length?.value ?? null;
}

function scoreForDelta(delta: number, expectedMagnitude: number, tolerance: number): number {
  if (delta === 0) return 1;
  const scale = Math.max(1, expectedMagnitude, tolerance * 4);
  return Math.max(0, Math.min(1, 1 - delta / scale));
}

function severity(score: number, priority: boolean): ValidationDifference["severity"] {
  if (priority && score < 0.5) return "CRITICAL";
  if (score < 0.5) return "ERROR";
  if (score < 0.85) return "WARNING";
  return "INFO";
}

function difference(input: {
  readonly region: ValidationReferenceRegion;
  readonly metric: ValidationMetric;
  readonly property: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly score: number;
  readonly threshold: number;
  readonly correctionKind: ValidationCorrectionKind;
}): ValidationDifference {
  const draft = {
    metric: input.metric,
    sourceNodeId: input.region.sourceNodeId,
    regionId: input.region.id,
    property: input.property,
    expectedValue: json(input.expected),
    actualValue: json(input.actual),
    severity: severity(input.score, input.region.priority),
    confidence: input.region.confidence,
    score: input.score,
    threshold: input.threshold,
    correctionKind: input.correctionKind,
    message: `${input.metric.toLowerCase()} mismatch at ${input.property} for node ${input.region.sourceNodeId}.`,
  };
  return ValidationDifferenceSchema.parse({ ...draft, id: deterministicId("difference", draft) });
}

function numericCheck(
  region: ValidationReferenceRegion,
  metric: ValidationMetric,
  property: string,
  expected: number,
  actual: number | null,
  tolerance: number,
  correctionKind: ValidationCorrectionKind,
): Check {
  const delta = actual === null ? Number.POSITIVE_INFINITY : Math.abs(expected - actual);
  const score = Number.isFinite(delta) ? scoreForDelta(delta, Math.abs(expected), tolerance) : 0;
  return {
    metric,
    score,
    ...(delta > tolerance
      ? {
          difference: difference({
            region,
            metric,
            property,
            expected,
            actual,
            score,
            threshold: tolerance,
            correctionKind,
          }),
        }
      : {}),
  };
}

function equalityCheck(
  region: ValidationReferenceRegion,
  metric: ValidationMetric,
  property: string,
  expected: unknown,
  actual: unknown,
  correctionKind: ValidationCorrectionKind,
): Check {
  const equal = stableStringify(expected) === stableStringify(actual);
  return {
    metric,
    score: equal ? 1 : 0,
    ...(!equal
      ? {
          difference: difference({
            region,
            metric,
            property,
            expected,
            actual,
            score: 0,
            threshold: 1,
            correctionKind,
          }),
        }
      : {}),
  };
}

function colorChannels(value: unknown): readonly number[] | undefined {
  if (typeof value === "string") {
    const compact = value.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
    if (!compact) return undefined;
    const expanded = compact.length <= 4 ? [...compact].map((channel) => `${channel}${channel}`).join("") : compact;
    const channels = expanded.match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255);
    return channels?.length === 3 ? [...channels, 1] : channels;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const color = value as Record<string, unknown>;
  if (![color.r, color.g, color.b].every((channel) => typeof channel === "number")) return undefined;
  const channels = [color.r, color.g, color.b, color.a ?? 1] as number[];
  return channels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1) ? channels : undefined;
}

function colorCheck(
  region: ValidationReferenceRegion,
  property: string,
  expected: unknown,
  actual: unknown,
  tolerance: number,
): Check {
  const expectedChannels = colorChannels(expected);
  const actualChannels = colorChannels(actual);
  if (!expectedChannels || !actualChannels || expectedChannels.length !== actualChannels.length) {
    return equalityCheck(region, "COLOR", property, expected, actual, "ADJUST_COLOR");
  }
  const delta =
    expectedChannels.reduce((sum, channel, index) => sum + Math.abs(channel - (actualChannels[index] ?? channel)), 0) /
    expectedChannels.length;
  const score = 1 - delta;
  return {
    metric: "COLOR",
    score,
    ...(delta > tolerance
      ? {
          difference: difference({
            region,
            metric: "COLOR",
            property,
            expected,
            actual,
            score,
            threshold: tolerance,
            correctionKind: "ADJUST_COLOR",
          }),
        }
      : {}),
  };
}

function runtimeNodeFor(region: ValidationReferenceRegion, projection: SceneProjectionResult): RuntimeNode | undefined {
  return (
    projection.nodes.get(region.sourceNodeId) ??
    [...projection.nodes.values()].find((node) => node.sourceNode.id === region.sourceNodeId)
  );
}

function operationFor(nodeId: string, graph: RenderGraph, kind: RenderGraphNode["kind"]): RenderGraphNode | undefined {
  return [...graph.operations.values()].find(
    (operation) => operation.canonicalNodeId === nodeId && operation.kind === kind,
  );
}

function metadataVisual(node: DesignNode): Record<string, unknown> {
  const reconstruction = node.metadata.customData["aevum.reconstruction"];
  if (!reconstruction || typeof reconstruction !== "object" || Array.isArray(reconstruction)) return {};
  const styles = (reconstruction as Record<string, unknown>).styleCandidates;
  return styles && typeof styles === "object" && !Array.isArray(styles) ? (styles as Record<string, unknown>) : {};
}

function visualChecks(
  region: ValidationReferenceRegion,
  actualNode: DesignNode,
  graph: RenderGraph,
  profile: ValidationThresholdProfile,
): Check[] {
  const checks: Check[] = [];
  const expected = region.expectedVisual;
  const metadata = metadataVisual(actualNode);
  const paint = operationFor(actualNode.id, graph, "PAINT");
  const effect = operationFor(actualNode.id, graph, "EFFECT");
  const actualVisual: Record<string, unknown> = {
    ...metadata,
    ...(paint?.kind === "PAINT"
      ? { fills: paint.style.fills, strokes: paint.style.strokes, cornerRadii: paint.style.cornerRadii }
      : {}),
    ...(effect?.kind === "EFFECT" ? { effects: effect.effects } : {}),
  };
  const mappings: ReadonlyArray<readonly [string, ValidationMetric, ValidationCorrectionKind]> = [
    ["color", "COLOR", "ADJUST_COLOR"],
    ["fill", "COLOR", "ADJUST_COLOR"],
    ["border", "BORDER", "ADJUST_BORDER"],
    ["stroke", "BORDER", "ADJUST_BORDER"],
    ["radius", "RADIUS", "ADJUST_RADIUS"],
    ["cornerRadius", "RADIUS", "ADJUST_RADIUS"],
    ["shadow", "SHADOW", "ADJUST_SHADOW"],
    ["gradient", "GRADIENT", "ADJUST_GRADIENT"],
  ];
  for (const [property, metric, correctionKind] of mappings) {
    if (expected[property] === undefined) continue;
    checks.push(
      metric === "COLOR"
        ? colorCheck(
            region,
            `visual.${property}`,
            expected[property],
            actualVisual[property],
            profile.tolerances.colorDelta,
          )
        : equalityCheck(
            region,
            metric,
            `visual.${property}`,
            expected[property],
            actualVisual[property],
            correctionKind,
          ),
    );
  }
  checks.push(
    numericCheck(
      region,
      "OPACITY",
      "transform.opacity",
      region.expectedNode.transform.opacity,
      actualNode.transform.opacity,
      profile.tolerances.opacityDelta,
      "ADJUST_OPACITY",
    ),
  );
  checks.push(
    equalityCheck(
      region,
      "VISIBILITY",
      "visible",
      region.expectedNode.visible,
      actualNode.visible,
      "ADJUST_VISIBILITY",
    ),
  );
  return checks;
}

function typographyChecks(
  region: ValidationReferenceRegion,
  actual: DesignNode,
  profile: ValidationThresholdProfile,
): Check[] {
  const expected = region.expectedNode;
  if (expected.type !== "TEXT") return [];
  if (actual.type !== "TEXT")
    return [equalityCheck(region, "TYPOGRAPHY", "node.type", "TEXT", actual.type, "ADJUST_TYPOGRAPHY")];
  const checks: Check[] = [
    equalityCheck(region, "TYPOGRAPHY", "text.content", expected.content, actual.content, "ADJUST_TYPOGRAPHY"),
  ];
  const expectedRun = expected.runs[0];
  const actualRun = actual.runs[0];
  if (!expectedRun || !actualRun)
    return [
      ...checks,
      equalityCheck(region, "TYPOGRAPHY", "text.runs", expected.runs, actual.runs, "ADJUST_TYPOGRAPHY"),
    ];
  checks.push(
    equalityCheck(
      region,
      "TYPOGRAPHY",
      "text.fontFamily",
      expectedRun.style.fontFamily,
      actualRun.style.fontFamily,
      "ADJUST_TYPOGRAPHY",
    ),
  );
  checks.push(
    numericCheck(
      region,
      "TYPOGRAPHY",
      "text.fontSize",
      expectedRun.style.size.value,
      actualRun.style.size.value,
      profile.tolerances.fontSizePx,
      "ADJUST_TYPOGRAPHY",
    ),
  );
  checks.push(
    equalityCheck(
      region,
      "TYPOGRAPHY",
      "text.fontWeight",
      expectedRun.style.weight,
      actualRun.style.weight,
      "ADJUST_TYPOGRAPHY",
    ),
  );
  checks.push(
    equalityCheck(
      region,
      "TYPOGRAPHY",
      "text.lineHeight",
      expectedRun.style.lineHeight,
      actualRun.style.lineHeight,
      "ADJUST_TYPOGRAPHY",
    ),
  );
  checks.push(
    numericCheck(
      region,
      "TYPOGRAPHY",
      "text.letterSpacing",
      expectedRun.style.letterSpacing.value,
      actualRun.style.letterSpacing.value,
      profile.tolerances.spacingPx,
      "ADJUST_TYPOGRAPHY",
    ),
  );
  return checks;
}

function assetChecks(
  region: ValidationReferenceRegion,
  actual: DesignNode,
  document: CanonicalDesignDocument,
): Check[] {
  const expected = region.expectedNode;
  if (expected.type !== "IMAGE" && expected.type !== "VIDEO") return [];
  if (actual.type !== expected.type)
    return [equalityCheck(region, "IMAGE", "node.type", expected.type, actual.type, "REPLACE_ASSET")];
  const expectedAsset = document.assets[expected.assetId];
  const actualAsset = document.assets[actual.assetId];
  return [
    equalityCheck(region, "ASSET", "asset.id", expected.assetId, actual.assetId, "REPLACE_ASSET"),
    equalityCheck(
      region,
      "ASSET",
      "asset.hash",
      expectedAsset?.hash ?? null,
      actualAsset?.hash ?? null,
      "REPLACE_ASSET",
    ),
    equalityCheck(region, "IMAGE", "asset.crop", expected.crop ?? null, actual.crop ?? null, "REPLACE_ASSET"),
  ];
}

function metricThreshold(metric: ValidationMetric, profile: ValidationThresholdProfile): number {
  if (metric === "TYPOGRAPHY") return profile.minimumScores.typography;
  if (metric === "ASSET" || metric === "IMAGE") return profile.minimumScores.asset;
  if (["LAYOUT", "POSITION", "SIZE", "CONSTRAINT"].includes(metric)) return profile.minimumScores.layout;
  return profile.minimumScores.region;
}

export function compareRegions(
  reference: ValidationReferenceSnapshot,
  document: CanonicalDesignDocument,
  projection: SceneProjectionResult,
  graph: RenderGraph,
  profile: ValidationThresholdProfile,
  requestedMetrics?: readonly ValidationMetric[],
): RegionComparisonResult {
  const requested = requestedMetrics ? new Set(requestedMetrics) : undefined;
  const results: ValidationRegionResult[] = [];
  const differences: ValidationDifference[] = [];
  for (const region of reference.regions) {
    const runtime = runtimeNodeFor(region, projection);
    const checks: Check[] = [];
    if (!runtime) {
      const missing = difference({
        region,
        metric: "HIERARCHY",
        property: "node.exists",
        expected: true,
        actual: false,
        score: 0,
        threshold: 1,
        correctionKind: "REPAIR_HIERARCHY",
      });
      checks.push({ metric: "HIERARCHY", score: 0, difference: missing });
    } else {
      checks.push(
        numericCheck(
          region,
          "POSITION",
          "bounds.x",
          region.bounds.x,
          runtime.worldTransform.position.x,
          profile.tolerances.positionPx,
          "ADJUST_POSITION",
        ),
      );
      checks.push(
        numericCheck(
          region,
          "POSITION",
          "bounds.y",
          region.bounds.y,
          runtime.worldTransform.position.y,
          profile.tolerances.positionPx,
          "ADJUST_POSITION",
        ),
      );
      checks.push(
        numericCheck(
          region,
          "SIZE",
          "bounds.width",
          region.bounds.width,
          lengthValue(runtime.dimensions?.width),
          profile.tolerances.sizePx,
          "ADJUST_SIZE",
        ),
      );
      checks.push(
        numericCheck(
          region,
          "SIZE",
          "bounds.height",
          region.bounds.height,
          lengthValue(runtime.dimensions?.height),
          profile.tolerances.sizePx,
          "ADJUST_SIZE",
        ),
      );
      checks.push(
        equalityCheck(
          region,
          "LAYOUT",
          "layout",
          region.expectedNode.type === "FRAME" ? region.expectedNode.layout : null,
          runtime.layout ?? null,
          "ADJUST_POSITION",
        ),
      );
      checks.push(...typographyChecks(region, runtime.sourceNode, profile));
      checks.push(...assetChecks(region, runtime.sourceNode, document));
      checks.push(...visualChecks(region, runtime.sourceNode, graph, profile));
    }
    const grouped = new Map<ValidationMetric, number[]>();
    for (const check of checks) {
      if (requested && !requested.has(check.metric)) continue;
      grouped.set(check.metric, [...(grouped.get(check.metric) ?? []), check.score]);
      if (check.difference) differences.push(check.difference);
    }
    const metrics = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([metric, scores]) => {
        const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
        const threshold = metricThreshold(metric, profile);
        return { metric, score, threshold, applicable: true, passed: score >= threshold };
      });
    const score = metrics.length === 0 ? 1 : metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length;
    const regionDifferences = differences.filter((entry) => entry.regionId === region.id);
    const status = score < profile.minimumScores.region ? "FAIL" : regionDifferences.length > 0 ? "WARN" : "PASS";
    results.push(
      ValidationRegionResultSchema.parse({
        regionId: region.id,
        sourceNodeId: region.sourceNodeId,
        score,
        status,
        metrics,
        differenceIds: regionDifferences.map((entry) => entry.id),
      }),
    );
  }
  return deepFreeze({
    regions: results,
    differences: differences.sort((left, right) => left.id.localeCompare(right.id)),
  });
}

function structuralDifference(
  region: ValidationReferenceRegion,
  metric: ValidationMetric,
  property: string,
  expected: unknown,
  actual: unknown,
  kind: ValidationCorrectionKind,
): ValidationDifference | undefined {
  return stableStringify(expected) === stableStringify(actual)
    ? undefined
    : difference({ region, metric, property, expected, actual, score: 0, threshold: 1, correctionKind: kind });
}

export function compareStructure(
  reference: ValidationReferenceSnapshot,
  document: CanonicalDesignDocument,
  projection: SceneProjectionResult,
  graph: RenderGraph,
  requestedMetrics?: readonly ValidationMetric[],
): StructuralComparisonResult {
  const requested = new Set(
    requestedMetrics ?? ["HIERARCHY", "COMPONENT", "TOKEN", "CONSTRAINT", "PAINT_ORDER", "RENDER_GRAPH"],
  );
  const differences: ValidationDifference[] = [];
  const firstRegion = reference.regions[0];
  if (!firstRegion) throw new Error("Structural validation requires at least one reference region.");
  let hierarchyMatches = 0;
  let constraintMatches = 0;
  let graphMatches = 0;
  for (const region of reference.regions) {
    const runtime = runtimeNodeFor(region, projection);
    if (requested.has("HIERARCHY")) {
      const hierarchy = structuralDifference(
        region,
        "HIERARCHY",
        "parentId",
        region.expectedNode.parentId ?? null,
        runtime?.sourceNode.parentId ?? null,
        "REPAIR_HIERARCHY",
      );
      if (hierarchy) differences.push(hierarchy);
      else hierarchyMatches += 1;
    }
    if (requested.has("CONSTRAINT")) {
      const constraint = structuralDifference(
        region,
        "CONSTRAINT",
        "constraints",
        region.expectedNode.constraints ?? null,
        runtime?.constraints ?? null,
        "REPAIR_CONSTRAINT",
      );
      if (constraint) differences.push(constraint);
      else constraintMatches += 1;
    }
    if (requested.has("RENDER_GRAPH")) {
      const hasOperation = [...graph.operations.values()].some(
        (operation) => operation.canonicalNodeId === region.sourceNodeId,
      );
      const graphDifference = structuralDifference(
        region,
        "RENDER_GRAPH",
        "renderGraph.operation",
        true,
        hasOperation,
        "HUMAN_REVIEW",
      );
      if (graphDifference) differences.push(graphDifference);
      else graphMatches += 1;
    }
  }
  const componentMissing = requested.has("COMPONENT")
    ? reference.expectedComponentIds.filter((id) => !document.components[id])
    : [];
  for (const id of componentMissing) {
    const entry = structuralDifference(firstRegion, "COMPONENT", `components.${id}`, true, false, "HUMAN_REVIEW");
    if (entry) differences.push(entry);
  }
  const tokenMissing = requested.has("TOKEN") ? reference.expectedTokenIds.filter((id) => !document.tokens[id]) : [];
  for (const id of tokenMissing) {
    const entry = structuralDifference(firstRegion, "TOKEN", `tokens.${id}`, true, false, "HUMAN_REVIEW");
    if (entry) differences.push(entry);
  }
  const actualPaintOrder = requested.has("PAINT_ORDER")
    ? graph.paintOrder.filter((nodeId) => reference.expectedPaintOrderNodeIds.includes(nodeId))
    : reference.expectedPaintOrderNodeIds;
  const paintDifference = requested.has("PAINT_ORDER")
    ? structuralDifference(
        firstRegion,
        "PAINT_ORDER",
        "paintOrder",
        reference.expectedPaintOrderNodeIds,
        actualPaintOrder,
        "REORDER_NODE",
      )
    : undefined;
  if (paintDifference) differences.push(paintDifference);
  const count = reference.regions.length;
  const hierarchyScore = requested.has("HIERARCHY") ? hierarchyMatches / count : 1;
  const constraintScore = requested.has("CONSTRAINT") ? constraintMatches / count : 1;
  const renderGraphScore = requested.has("RENDER_GRAPH") ? graphMatches / count : 1;
  const componentScore =
    !requested.has("COMPONENT") || reference.expectedComponentIds.length === 0
      ? 1
      : 1 - componentMissing.length / reference.expectedComponentIds.length;
  const tokenScore =
    !requested.has("TOKEN") || reference.expectedTokenIds.length === 0
      ? 1
      : 1 - tokenMissing.length / reference.expectedTokenIds.length;
  const paintOrderScore = paintDifference ? 0 : 1;
  const score =
    (hierarchyScore + componentScore + tokenScore + constraintScore + paintOrderScore + renderGraphScore) / 6;
  return deepFreeze({
    summary: StructuralValidationResultSchema.parse({
      score,
      hierarchyScore,
      componentScore,
      tokenScore,
      constraintScore,
      paintOrderScore,
      renderGraphScore,
      differenceIds: differences.map((entry) => entry.id),
    }),
    differences: differences.sort((left, right) => left.id.localeCompare(right.id)),
  });
}
