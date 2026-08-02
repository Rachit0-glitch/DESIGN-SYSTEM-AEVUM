import type { CanonicalDesignDocument } from "@aevum/document-model";
import { buildRenderGraph, RENDERER_2D_VERSION } from "@aevum/renderer-2d";
import { projectScene, type RuntimeNode } from "@aevum/scene-runtime";
import { createValidationTask, validateDesign, type ValidationReferenceSnapshot } from "@aevum/validation";
import { deepFreeze } from "./immutable.js";
import {
  RESPONSIVE_VALIDATION_VERSION,
  ResponsiveDiagnosticSchema,
  ResponsiveReconstructionTaskSchema,
  ResponsiveValidationResultSchema,
  ResponsiveVariantValidationSchema,
  type ResponsiveDiagnostic,
  type ResponsiveReconstructionTask,
  type ResponsiveValidationResult,
  type ResponsiveVariant,
  type ResponsiveVariantValidation,
} from "./schemas.js";
import { fingerprint } from "./stable.js";

function diagnostic(input: Parameters<typeof ResponsiveDiagnosticSchema.parse>[0]): ResponsiveDiagnostic {
  return ResponsiveDiagnosticSchema.parse(input);
}

function textReadable(nodes: readonly RuntimeNode[], minimum: number, viewportId: string): ResponsiveDiagnostic[] {
  const diagnostics: ResponsiveDiagnostic[] = [];
  for (const node of nodes) {
    if (!node.visible || node.resolvedNode.type !== "TEXT") continue;
    for (const run of node.resolvedNode.runs) {
      if (run.style.size.unit === "PX" && run.style.size.value < minimum) {
        diagnostics.push(
          diagnostic({
            code: "TEXT_UNREADABLE",
            severity: "ERROR",
            message: `Text node ${node.sourceNode.id} resolves below ${minimum}px.`,
            recoverable: true,
            nodeId: node.sourceNode.id,
            viewportId,
            property: "TYPOGRAPHY",
          }),
        );
      }
    }
  }
  return diagnostics;
}

interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function bounds(node: RuntimeNode): Bounds | undefined {
  const width = node.dimensions?.width;
  const height = node.dimensions?.height;
  if (!width || !height || width.unit !== "PX" || height.unit !== "PX") return undefined;
  return {
    x: node.worldTransform.position.x,
    y: node.worldTransform.position.y,
    width: width.value,
    height: height.value,
  };
}

function overlaps(left: Bounds, right: Bounds): boolean {
  const width = Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const height = Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return width > 0.5 && height > 0.5;
}

function overlapDiagnostics(nodes: readonly RuntimeNode[], viewportId: string): ResponsiveDiagnostic[] {
  const diagnostics: ResponsiveDiagnostic[] = [];
  const byParent = new Map<string, RuntimeNode[]>();
  for (const node of nodes) {
    if (!node.visible || !node.parentId) continue;
    byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  for (const [parentId, children] of byParent) {
    const parent = nodeMap.get(parentId);
    if (parent?.layout && parent.layout.type !== "ABSOLUTE") continue;
    for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
      const left = children[leftIndex];
      if (!left || left.resolvedNode.metadata.customData["aevum.allowOverlap"] === true) continue;
      const leftBounds = bounds(left);
      if (!leftBounds) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
        const right = children[rightIndex];
        if (!right || right.resolvedNode.metadata.customData["aevum.allowOverlap"] === true) continue;
        const rightBounds = bounds(right);
        if (!rightBounds || !overlaps(leftBounds, rightBounds)) continue;
        diagnostics.push(
          diagnostic({
            code: "OVERLAP_DETECTED",
            severity: "ERROR",
            message: `Nodes ${left.sourceNode.id} and ${right.sourceNode.id} overlap unexpectedly.`,
            recoverable: true,
            nodeId: right.sourceNode.id,
            viewportId,
            property: "LAYOUT",
          }),
        );
      }
    }
  }
  return diagnostics;
}

function focalPointDiagnostics(nodes: readonly RuntimeNode[], viewportId: string): ResponsiveDiagnostic[] {
  const diagnostics: ResponsiveDiagnostic[] = [];
  for (const node of nodes) {
    if (node.resolvedNode.type !== "IMAGE" && node.resolvedNode.type !== "VIDEO") continue;
    const raw = node.sourceNode.metadata.customData["aevum.responsive"];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const focal = (raw as Record<string, unknown>).focalPoint;
    if (!focal || typeof focal !== "object" || Array.isArray(focal)) continue;
    const x = (focal as Record<string, unknown>).x;
    const y = (focal as Record<string, unknown>).y;
    const crop = node.resolvedNode.crop;
    if (typeof x !== "number" || typeof y !== "number" || !crop) continue;
    if (x < crop.x || x > crop.x + crop.width || y < crop.y || y > crop.y + crop.height) {
      diagnostics.push(
        diagnostic({
          code: "FOCAL_POINT_LOST",
          severity: "ERROR",
          message: `Responsive crop excludes the focal point for ${node.sourceNode.id}.`,
          recoverable: true,
          nodeId: node.sourceNode.id,
          viewportId,
          property: "CROP",
        }),
      );
    }
  }
  return diagnostics;
}

function reducedMotionDiagnostics(
  document: CanonicalDesignDocument,
  nodes: readonly RuntimeNode[],
  variant: ResponsiveVariant,
): ResponsiveDiagnostic[] {
  if (!variant.reducedMotion) return [];
  const timelineTargets = new Set(
    Object.values(document.timelines).flatMap((timeline) => timeline.tracks.map((track) => track.targetId)),
  );
  return nodes.flatMap((node) => {
    const raw = node.sourceNode.metadata.customData["aevum.responsive"];
    const metadataMotion = Boolean(
      raw && typeof raw === "object" && !Array.isArray(raw) && (raw as Record<string, unknown>).motion === true,
    );
    if (!timelineTargets.has(node.sourceNode.id) && !metadataMotion) return [];
    if (node.responsive.motion && node.responsive.motion.behavior !== "PRESERVE") return [];
    return [
      diagnostic({
        code: "REDUCED_MOTION_MISSING",
        severity: "ERROR",
        message: `Node ${node.sourceNode.id} has motion but no reduced-motion alternative.`,
        recoverable: true,
        nodeId: node.sourceNode.id,
        viewportId: variant.id,
        property: "MOTION",
      }),
    ];
  });
}

function mobileRegenerated(nodes: readonly RuntimeNode[], variant: ResponsiveVariant): boolean {
  if (variant.category !== "MOBILE") return true;
  const semantic = new Set([
    "visible",
    "dimensions",
    "constraints",
    "childIds",
    "layout",
    "crop",
    "objectFit",
    "runs",
    "paragraphStyle",
  ]);
  return nodes.some(
    (node) =>
      node.responsive.appliedOverrideKeys.includes(`breakpoint:${variant.breakpointId}`) &&
      node.responsive.changedPaths.some((path) => semantic.has(path)),
  );
}

export interface ValidateResponsiveVariantsInput {
  readonly task: ResponsiveReconstructionTask;
  readonly document: CanonicalDesignDocument;
  readonly references: Readonly<Record<string, ValidationReferenceSnapshot>>;
  readonly thresholdProfile?: "DRAFT" | "STANDARD" | "HIGH_QUALITY" | "PIXEL_PERFECT";
}

export function validateResponsiveVariants(input: ValidateResponsiveVariantsInput): ResponsiveValidationResult {
  const task = ResponsiveReconstructionTaskSchema.parse(input.task);
  if (input.document.metadata.id !== task.documentId) throw new Error("Responsive validation document mismatch.");
  const results: ResponsiveVariantValidation[] = [];
  for (const variant of task.variants) {
    const viewport = {
      id: variant.id,
      width: variant.width,
      height: variant.height,
      deviceScaleFactor: variant.deviceScaleFactor,
      orientation: variant.orientation,
      category: variant.category,
      reducedMotion: variant.reducedMotion,
      breakpointId: variant.breakpointId,
      containerQueryIds: variant.containerQueryIds,
      qualityMode: variant.qualityMode,
    };
    const validationViewport = {
      id: variant.id,
      width: variant.width,
      height: variant.height,
      deviceScaleFactor: variant.deviceScaleFactor,
      orientation: variant.orientation,
      category: variant.category,
      reducedMotion: variant.reducedMotion,
    };
    const projection = projectScene(input.document, viewport, { strictMode: true });
    const graph = buildRenderGraph(projection);
    const nodes = [...projection.nodes.values()];
    const diagnostics: ResponsiveDiagnostic[] = [
      ...textReadable(nodes, task.minimumTextSizePx, variant.id),
      ...overlapDiagnostics(nodes, variant.id),
      ...focalPointDiagnostics(nodes, variant.id),
      ...reducedMotionDiagnostics(input.document, nodes, variant),
    ];
    const regenerated = mobileRegenerated(nodes, variant);
    if (!regenerated)
      diagnostics.push(
        diagnostic({
          code: "MOBILE_SCALED_COPY",
          severity: "ERROR",
          message: `${variant.name} has no semantic responsive override.`,
          recoverable: true,
          viewportId: variant.id,
        }),
      );
    const reference = input.references[variant.id];
    let validationReportId: string | undefined;
    let validationScore: number | undefined;
    let validationStatus: "PASS" | "WARN" | "FAIL" | "NOT_RUN" = "NOT_RUN";
    if (!reference) {
      diagnostics.push(
        diagnostic({
          code: "REFERENCE_MISSING",
          severity: "ERROR",
          message: `Validation reference is missing for ${variant.name}.`,
          recoverable: true,
          viewportId: variant.id,
        }),
      );
    } else {
      const validationTask = createValidationTask({
        projectId: task.projectId,
        documentId: input.document.metadata.id,
        documentVersion: input.document.documentVersion,
        referenceId: reference.referenceId,
        sourceAssetId: reference.sourceAssetId,
        viewport: validationViewport,
        rendererVersion: RENDERER_2D_VERSION,
        projectionFingerprint: projection.fingerprint,
        renderGraphFingerprint: graph.fingerprint,
        qualityMode: variant.qualityMode,
        thresholdProfile: input.thresholdProfile ?? "STANDARD",
        requestedMetrics: [
          "LAYOUT",
          "POSITION",
          "SIZE",
          "TYPOGRAPHY",
          "IMAGE",
          "ASSET",
          "VISIBILITY",
          "CONSTRAINT",
          "PAINT_ORDER",
          "RENDER_GRAPH",
        ],
        deterministicSeed: task.deterministicSeed,
        createdAt: task.createdAt,
        createdBy: task.createdBy,
      });
      const validated = validateDesign({
        task: validationTask,
        reference,
        document: input.document,
        projection,
        renderGraph: graph,
        createdAt: task.createdAt,
      });
      if (validated.success) {
        validationReportId = validated.report.id;
        validationScore = validated.report.scores.overall;
        validationStatus = validated.report.status;
      } else {
        diagnostics.push(
          diagnostic({
            code: "VALIDATION_FAILED",
            severity: "ERROR",
            message: `Visual Validation failed for ${variant.name}.`,
            recoverable: true,
            viewportId: variant.id,
          }),
        );
        validationStatus = "FAIL";
      }
    }
    const textOk = !diagnostics.some((entry) => entry.code === "TEXT_UNREADABLE");
    const overlapOk = !diagnostics.some((entry) => entry.code === "OVERLAP_DETECTED");
    const focalOk = !diagnostics.some((entry) => entry.code === "FOCAL_POINT_LOST");
    const motionOk = !diagnostics.some((entry) => entry.code === "REDUCED_MOTION_MISSING");
    results.push(
      ResponsiveVariantValidationSchema.parse({
        viewport: variant,
        projectionFingerprint: projection.fingerprint,
        renderGraphFingerprint: graph.fingerprint,
        ...(validationReportId ? { validationReportId } : {}),
        ...(validationScore !== undefined ? { validationScore } : {}),
        validationStatus,
        mobileRegenerated: regenerated,
        textReadable: textOk,
        noUnexpectedOverlap: overlapOk,
        focalPointsPreserved: focalOk,
        reducedMotionSatisfied: motionOk,
        diagnostics,
      }),
    );
  }
  const passed = results.every(
    (result) =>
      result.validationStatus !== "FAIL" &&
      result.validationStatus !== "NOT_RUN" &&
      result.mobileRegenerated &&
      result.textReadable &&
      result.noUnexpectedOverlap &&
      result.focalPointsPreserved &&
      result.reducedMotionSatisfied,
  );
  const draft = {
    validationVersion: RESPONSIVE_VALIDATION_VERSION,
    taskId: task.id,
    documentId: input.document.metadata.id,
    documentVersion: input.document.documentVersion,
    documentFingerprint: fingerprint(input.document),
    variants: results,
    passed,
  };
  return deepFreeze(ResponsiveValidationResultSchema.parse({ ...draft, fingerprint: fingerprint(draft) }));
}
