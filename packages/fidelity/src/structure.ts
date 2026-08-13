import type { RenderGraph, RenderGraphNode } from "@aevum/renderer-2d";
import type { FidelityProfile } from "./profiles.js";
import type { FidelityIssue } from "./schemas.js";
import { compareVisibleCrop } from "./pixels.js";
import { fidelityId } from "./stable.js";

export interface StructuralExpectation {
  readonly nodeId: string;
  readonly property: "BOUNDS" | "CROP" | "GRADIENT" | "PAINT_ORDER" | "LINE_BREAKS";
  readonly expected: unknown;
  readonly confidence: number;
}

function issue(input: Omit<FidelityIssue, "id">): FidelityIssue {
  return { ...input, id: fidelityId("fidelity-issue", input) };
}

function operationFor(graph: RenderGraph, nodeId: string, kind?: RenderGraphNode["kind"]): RenderGraphNode | undefined {
  return [...graph.operations.values()].find(
    (operation) => operation.canonicalNodeId === nodeId && (!kind || operation.kind === kind),
  );
}

export function compareStructuralFidelity(input: {
  readonly graph: RenderGraph;
  readonly expectations: readonly StructuralExpectation[];
  readonly profile: FidelityProfile;
  readonly typography?: readonly {
    nodeId: string;
    lineCount: number;
    lineWidths: readonly number[];
    baselines: readonly number[];
  }[];
}): readonly FidelityIssue[] {
  const issues: FidelityIssue[] = [];
  for (const expectation of input.expectations) {
    const operation = operationFor(
      input.graph,
      expectation.nodeId,
      expectation.property === "CROP" ? "IMAGE" : expectation.property === "LINE_BREAKS" ? "TEXT" : undefined,
    );
    if (!operation) {
      issues.push(
        issue({
          domain: expectation.property === "CROP" ? "ASSET" : "LAYOUT",
          code: "STRUCTURAL_NODE_MISSING",
          severity: "BLOCKING",
          nodeId: expectation.nodeId,
          property: expectation.property,
          expected: expectation.expected,
          actual: null,
          measurement: 1,
          confidence: expectation.confidence,
          supported: true,
          message: "Expected canonical node has no render operation.",
        }),
      );
      continue;
    }
    if (expectation.property === "BOUNDS") {
      const expected = expectation.expected as { x: number; y: number; width: number; height: number };
      const actual = {
        x: operation.worldTransform.position.x,
        y: operation.worldTransform.position.y,
        width: operation.dimensions?.width.value ?? 0,
        height: operation.dimensions?.height.value ?? 0,
      };
      const deltas = {
        x: actual.x - expected.x,
        y: actual.y - expected.y,
        width: actual.width - expected.width,
        height: actual.height - expected.height,
      };
      const maximum = Math.max(...Object.values(deltas).map(Math.abs));
      if (maximum > input.profile.layoutTolerancePx)
        issues.push(
          issue({
            domain: "LAYOUT",
            code: "LAYOUT_BOUNDS_MISMATCH",
            severity: maximum > 8 ? "ERROR" : "WARNING",
            nodeId: expectation.nodeId,
            region: expected,
            property: "bounds",
            expected,
            actual,
            measurement: Math.min(1, maximum / Math.max(1, expected.width, expected.height)),
            confidence: expectation.confidence,
            supported: true,
            message: `Canonical bounds differ by up to ${maximum.toFixed(3)} px without integer rounding.`,
          }),
        );
    } else if (expectation.property === "CROP" && operation.kind === "IMAGE") {
      const expected = expectation.expected as { x: number; y: number; width: number; height: number };
      const actual = operation.crop ?? { x: 0, y: 0, width: 1, height: 1 };
      const delta = compareVisibleCrop(expected, actual);
      if (delta > 0.001)
        issues.push(
          issue({
            domain: "CROP",
            code: "IMAGE_CROP_MISMATCH",
            severity: delta > 0.1 ? "ERROR" : "WARNING",
            nodeId: expectation.nodeId,
            property: "crop",
            expected,
            actual,
            measurement: Math.min(1, delta),
            confidence: expectation.confidence,
            supported: true,
            message: "The correct image asset exposes a different source region.",
          }),
        );
    } else if (expectation.property === "GRADIENT" && operation.kind === "PAINT") {
      const actual = operation.style.fills.filter((paint) => paint.type !== "SOLID");
      if (JSON.stringify(actual) !== JSON.stringify(expectation.expected))
        issues.push(
          issue({
            domain: "COLOR",
            code: "GRADIENT_STRUCTURE_MISMATCH",
            severity: "ERROR",
            nodeId: expectation.nodeId,
            property: "fills.gradient",
            expected: expectation.expected,
            actual,
            measurement: 1,
            confidence: expectation.confidence,
            supported: true,
            message: "Gradient type, stops, angle, center, or radius differs canonically.",
          }),
        );
    } else if (expectation.property === "PAINT_ORDER") {
      const expected = expectation.expected as number;
      if (operation.order !== expected)
        issues.push(
          issue({
            domain: "LAYOUT",
            code: "PAINT_ORDER_MISMATCH",
            severity: "ERROR",
            nodeId: expectation.nodeId,
            property: "paintOrder",
            expected,
            actual: operation.order,
            measurement: Math.min(1, Math.abs(operation.order - expected) / Math.max(1, input.graph.operations.size)),
            confidence: expectation.confidence,
            supported: true,
            message: "Layer compositing order differs.",
          }),
        );
    } else if (expectation.property === "LINE_BREAKS") {
      const actual = input.typography?.find((entry) => entry.nodeId === expectation.nodeId);
      const expected = expectation.expected as {
        lineCount: number;
        lineWidths: readonly number[];
        baselines: readonly number[];
      };
      const differs =
        !actual ||
        actual.lineCount !== expected.lineCount ||
        actual.lineWidths.length !== expected.lineWidths.length ||
        actual.baselines.length !== expected.baselines.length ||
        actual.lineWidths.some(
          (width, index) => Math.abs(width - (expected.lineWidths[index] ?? 0)) > input.profile.layoutTolerancePx,
        ) ||
        actual.baselines.some(
          (baseline, index) => Math.abs(baseline - (expected.baselines[index] ?? 0)) > input.profile.layoutTolerancePx,
        );
      if (differs)
        issues.push(
          issue({
            domain: "TYPOGRAPHY",
            code: "LINE_BREAK_MISMATCH",
            severity: "ERROR",
            nodeId: expectation.nodeId,
            property: "lineBreaks",
            expected,
            actual: actual ?? null,
            measurement: 1,
            confidence: expectation.confidence,
            supported: true,
            message: "Shaped line count, widths, or baseline positions differ.",
          }),
        );
    }
  }
  return issues.sort((left, right) => left.id.localeCompare(right.id));
}
