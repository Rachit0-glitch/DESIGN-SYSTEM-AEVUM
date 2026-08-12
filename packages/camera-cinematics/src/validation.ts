import type { Bounds3D, CanonicalDesignDocument } from "@aevum/document-model";
import { projectBounds } from "./math.js";
import {
  CAMERA_CINEMATICS_VERSION,
  CameraValidationReportSchema,
  CompositionMeasurementSchema,
  type CameraCorrection,
  type CameraDiagnostic,
  type CameraValidationReport,
  type CompositionMeasurement,
  type ResolvedCamera,
} from "./schemas.js";
import { cameraFingerprint, deepFreeze } from "./stable.js";

function correction(
  document: CanonicalDesignDocument,
  cameraId: string,
  diagnostic: CameraDiagnostic,
): CameraCorrection | undefined {
  const category = diagnostic.correctionCategory;
  if (!category) return undefined;
  const path =
    category === "FOCAL_LENGTH"
      ? "focalLength"
      : category === "LENS_SHIFT"
        ? "lensShift"
        : category === "FOCUS"
          ? "depthOfField.focusDistance"
          : category === "TARGET"
            ? "target"
            : category === "TIMING"
              ? "duration"
              : "transform.position";
  const camera = document.cameras[cameraId];
  if (!camera) return undefined;
  const proposedValue =
    category === "FOCAL_LENGTH"
      ? Math.max(1, (camera.focalLength ?? 50) * 0.9)
      : category === "LENS_SHIFT"
        ? { x: 0, y: 0 }
        : category === "FOCUS"
          ? camera.depthOfField.focusDistance
          : category === "POSITION"
            ? camera.transform.position
            : (camera.target ?? { x: 0, y: 0, z: 0 });
  const content = { cameraId, category, path, proposedValue, expectedDocumentVersion: document.documentVersion };
  return {
    id: `camera-correction:${cameraFingerprint(content).slice(7, 39)}`,
    cameraId,
    ...(diagnostic.shotId ? { shotId: diagnostic.shotId } : {}),
    category,
    path,
    proposedValue,
    reason: diagnostic.message,
    confidence: diagnostic.confidence,
    expectedDocumentVersion: document.documentVersion,
  };
}

export function analyzeComposition(
  resolved: ResolvedCamera,
  subjectBounds?: Bounds3D,
  desiredCoverage?: number,
  safeMargin = 0.05,
): CompositionMeasurement {
  const diagnostics: CameraDiagnostic[] = [];
  const projection = subjectBounds
    ? projectBounds(resolved.camera, subjectBounds)
    : { center: { x: 0.5, y: 0.5 }, coverage: 0, clipped: false };
  const margin = Math.min(projection.center.x, projection.center.y, 1 - projection.center.x, 1 - projection.center.y);
  const centerError = Math.hypot(projection.center.x - 0.5, projection.center.y - 0.5);
  const thirds = [1 / 3, 2 / 3];
  const ruleOfThirdsError = Math.min(
    ...thirds.flatMap((x) => thirds.map((y) => Math.hypot(projection.center.x - x, projection.center.y - y))),
  );
  if (projection.clipped)
    diagnostics.push({
      code: "SUBJECT_CLIPPED",
      severity: "ERROR",
      category: "CLIPPING",
      message: "Subject bounds extend outside the camera frame.",
      cameraId: resolved.camera.id,
      ...(resolved.sourceShotId ? { shotId: resolved.sourceShotId } : {}),
      confidence: 1,
      recoverable: true,
      correctionCategory: "POSITION",
    });
  if (margin < safeMargin)
    diagnostics.push({
      code: "SUBJECT_OUTSIDE_SAFE_AREA",
      severity: "WARNING",
      category: "FRAMING",
      message: "Subject falls outside the requested safe margin.",
      cameraId: resolved.camera.id,
      ...(resolved.sourceShotId ? { shotId: resolved.sourceShotId } : {}),
      expected: safeMargin,
      actual: margin,
      confidence: 1,
      recoverable: true,
      correctionCategory: "FOCAL_LENGTH",
    });
  if (desiredCoverage !== undefined && Math.abs(projection.coverage - desiredCoverage) > 0.15)
    diagnostics.push({
      code: "COMPOSITION_MISMATCH",
      severity: "WARNING",
      category: "COMPOSITION",
      message: "Subject coverage differs from the shot composition target.",
      cameraId: resolved.camera.id,
      ...(resolved.sourceShotId ? { shotId: resolved.sourceShotId } : {}),
      expected: desiredCoverage,
      actual: projection.coverage,
      confidence: 0.9,
      recoverable: true,
      correctionCategory: "FOCAL_LENGTH",
    });
  const body = {
    cameraId: resolved.camera.id,
    screenCenter: projection.center,
    coverage: projection.coverage,
    margin: Math.max(0, Math.min(1, margin)),
    clipped: projection.clipped,
    ruleOfThirdsError,
    centerError,
    diagnostics,
  };
  return deepFreeze(CompositionMeasurementSchema.parse({ ...body, fingerprint: cameraFingerprint(body) }));
}

export interface ValidateCameraInput {
  readonly document: CanonicalDesignDocument;
  readonly resolvedCameras: readonly ResolvedCamera[];
  readonly sequenceId?: string;
  readonly subjectBounds?: Readonly<Record<string, Bounds3D>>;
}

export function validateCinematics(input: ValidateCameraInput): CameraValidationReport {
  const diagnostics: CameraDiagnostic[] = [];
  const compositions: CompositionMeasurement[] = [];
  for (const resolved of input.resolvedCameras) {
    diagnostics.push(...resolved.diagnostics);
    const shot = resolved.sourceShotId ? input.document.cinematicShots[resolved.sourceShotId] : undefined;
    const subjectId = shot?.composition.subjectNodeId;
    const composition = analyzeComposition(
      resolved,
      subjectId ? input.subjectBounds?.[subjectId] : undefined,
      shot?.composition.desiredCoverage,
      shot?.composition.safeMargin,
    );
    compositions.push(composition);
    diagnostics.push(...composition.diagnostics);
    if (resolved.camera.farClip <= resolved.camera.nearClip)
      diagnostics.push({
        code: "INVALID_CLIPPING",
        severity: "BLOCKING",
        category: "CLIPPING",
        message: "Far clip does not exceed near clip.",
        cameraId: resolved.camera.id,
        confidence: 1,
        recoverable: true,
      });
  }
  const sequence = input.sequenceId ? input.document.cinematicSequences[input.sequenceId] : undefined;
  if (sequence) {
    const shots = sequence.shotIds.flatMap((id) =>
      input.document.cinematicShots[id] ? [input.document.cinematicShots[id]] : [],
    );
    for (let index = 1; index < shots.length; index += 1) {
      const previous = shots[index - 1];
      const current = shots[index];
      if (!previous || !current) continue;
      const previousEnd = previous.startTime + previous.duration;
      if (current.startTime < previousEnd)
        diagnostics.push({
          code: "SHOT_OVERLAP",
          severity: "BLOCKING",
          category: "SEQUENCE",
          message: "Cinematic shots overlap.",
          shotId: current.id,
          confidence: 1,
          recoverable: true,
          correctionCategory: "TIMING",
        });
      if (!sequence.allowGaps && current.startTime > previousEnd)
        diagnostics.push({
          code: "SHOT_GAP",
          severity: "ERROR",
          category: "SEQUENCE",
          message: "Cinematic sequence contains a gap.",
          shotId: current.id,
          confidence: 1,
          recoverable: true,
          correctionCategory: "TIMING",
        });
    }
  }
  const blocking = diagnostics.filter((entry) => entry.severity === "BLOCKING" || entry.severity === "ERROR").length;
  const warnings = diagnostics.filter((entry) => entry.severity === "WARNING").length;
  const score = Math.max(0, 1 - blocking * 0.2 - warnings * 0.05);
  const compositionScore =
    compositions.length === 0
      ? 1
      : Math.max(0, 1 - compositions.reduce((sum, entry) => sum + entry.centerError, 0) / compositions.length);
  const lensScore = diagnostics.some((entry) => entry.category === "LENS" || entry.category === "PROJECTION") ? 0.5 : 1;
  const continuityScore = diagnostics.some((entry) => entry.category === "SEQUENCE" || entry.category === "MOTION")
    ? 0.5
    : 1;
  const cameraIds = [...new Set(input.resolvedCameras.map((entry) => entry.camera.id))].sort();
  const corrections = diagnostics.flatMap((entry) => {
    const cameraId = entry.cameraId ?? cameraIds[0];
    const value = cameraId ? correction(input.document, cameraId, entry) : undefined;
    return value ? [value] : [];
  });
  const body = {
    version: CAMERA_CINEMATICS_VERSION,
    documentId: input.document.metadata.id,
    documentVersion: input.document.documentVersion,
    cameraIds,
    ...(input.sequenceId ? { sequenceId: input.sequenceId } : {}),
    score,
    compositionScore,
    lensScore,
    continuityScore,
    diagnostics,
    corrections,
  };
  return deepFreeze(CameraValidationReportSchema.parse({ ...body, fingerprint: cameraFingerprint(body) }));
}
