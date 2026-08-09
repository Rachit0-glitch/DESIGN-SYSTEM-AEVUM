import { CANONICAL_3D_COORDINATE_SYSTEM } from "@aevum/document-model";
import { createRoleBasedCameraEstimator, type CameraEstimator } from "./camera-estimator.js";
import { buildCoverageReport } from "./coverage.js";
import {
  capConstraints,
  deriveSilhouetteDimensionConstraints,
  deriveSymmetryConstraint,
  resolveScaleEvidence,
} from "./constraints.js";
import { detectDepthAmbiguity, detectDuplicateViews, detectNotReady } from "./conflicts.js";
import { deterministicScopedId, fingerprint } from "./deterministic.js";
import { hasBlockingDiagnostics, sortDiagnostics } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import { buildLandmarks } from "./landmarks.js";
import { buildParts } from "./parts.js";
import { assessReadiness } from "./readiness.js";
import {
  MULTIVIEW_REFERENCE_SET_VERSION,
  MultiViewReferenceSetSchema,
  ViewRecordSchema,
  type CameraEstimate,
  type CoverageReport,
  type GeometricConstraint,
  type MultiViewDiagnostic,
  type MultiViewReferenceSet,
  type MultiViewTask,
  type ReadinessAssessment,
  type ViewRecord,
} from "./schemas.js";
import { createManifestSilhouetteProvider, type SilhouetteProvider } from "./silhouette.js";
import { classifyViewRole, detectDuplicateRoles } from "./view-roles.js";

export interface BuildReferenceSetOptions {
  readonly cameraEstimator?: CameraEstimator;
  readonly silhouetteProvider?: SilhouetteProvider;
}

export interface BuildReferenceSetResult {
  readonly referenceSet: MultiViewReferenceSet;
  readonly coverage: CoverageReport;
  readonly readiness: ReadinessAssessment;
}

/**
 * Runs the full deterministic, provider-independent multi-view evidence pipeline: builds each
 * view (role, camera estimate, silhouette), then derives landmarks, parts, scale evidence,
 * geometric constraints, coverage, and readiness from them. No mesh or GLB is produced here.
 */
export function buildMultiViewReferenceSet(
  task: MultiViewTask,
  options: BuildReferenceSetOptions = {},
): BuildReferenceSetResult {
  const cameraEstimator = options.cameraEstimator ?? createRoleBasedCameraEstimator();
  const silhouetteProvider = options.silhouetteProvider ?? createManifestSilhouetteProvider();

  const diagnostics: MultiViewDiagnostic[] = [];
  const assetIdToViewId = new Map<string, string>();
  const views: ViewRecord[] = [];

  for (const inputView of task.views) {
    const viewId = deterministicScopedId("view", { taskId: task.id, assetId: inputView.assetId });
    assetIdToViewId.set(inputView.assetId, viewId);

    const roleResult = classifyViewRole({ viewId, assetId: inputView.assetId, hints: task.roleHints });
    diagnostics.push(...roleResult.diagnostics);

    const cameraEstimate: CameraEstimate | undefined =
      roleResult.classification.role === "UNKNOWN" || roleResult.classification.role === "DETAIL"
        ? undefined
        : cameraEstimator.estimate({
            viewId,
            role: roleResult.classification,
            imageWidth: inputView.imageWidth,
            imageHeight: inputView.imageHeight,
          });
    if (cameraEstimate) diagnostics.push(...cameraEstimate.diagnostics);

    const silhouette = silhouetteProvider.estimate({
      viewId,
      ...(inputView.silhouetteContour ? { contourHint: inputView.silhouetteContour } : {}),
    });
    if (!silhouette) {
      diagnostics.push({
        code: "SILHOUETTE_MISSING",
        severity: "INFO",
        message: `No silhouette evidence was supplied for view ${viewId}.`,
        stage: "VIEW_CONSTRUCTION",
        relatedIds: [viewId],
        recoverable: true,
        details: {},
      });
    }

    const orientation =
      inputView.imageWidth > inputView.imageHeight
        ? "LANDSCAPE"
        : inputView.imageWidth < inputView.imageHeight
          ? "PORTRAIT"
          : "SQUARE";

    views.push(
      deepFreeze(
        ViewRecordSchema.parse({
          id: viewId,
          assetId: inputView.assetId,
          role: roleResult.classification,
          imageWidth: inputView.imageWidth,
          imageHeight: inputView.imageHeight,
          orientation,
          ...(cameraEstimate ? { cameraEstimate } : {}),
          ...(silhouette ? { silhouette } : {}),
          provenance: {
            source: roleResult.classification.method === "USER_PROVIDED" ? "USER" : "DETERMINISTIC_ANALYZER",
            provider: "multiview-reference-set-builder",
            providerVersion: "1.0.0",
            sourceViewId: viewId,
            sourceAssetId: inputView.assetId,
            confidence: roleResult.classification.confidence,
          },
        }),
      ),
    );
  }

  diagnostics.push(...detectDuplicateRoles(views.map((view) => ({ viewId: view.id, role: view.role }))));
  diagnostics.push(...detectDuplicateViews(views));

  const landmarksResult = buildLandmarks({
    hints: task.landmarkHints,
    assetIdToViewId,
    cameraByViewId: new Map(views.map((view) => [view.id, view.cameraEstimate])),
    config: task.config,
  });
  diagnostics.push(...landmarksResult.diagnostics);

  const partsResult = buildParts({ hints: task.partHints, assetIdToViewId, config: task.config });
  diagnostics.push(...partsResult.diagnostics);

  const scaleResult = resolveScaleEvidence({ hints: task.scaleHints });
  diagnostics.push(...scaleResult.diagnostics);

  const dimensionConstraints = deriveSilhouetteDimensionConstraints(views);
  diagnostics.push(...dimensionConstraints.diagnostics);
  const symmetryConstraint = deriveSymmetryConstraint(views);
  const uncappedConstraints: GeometricConstraint[] = [...dimensionConstraints.constraints];
  if (symmetryConstraint) uncappedConstraints.push(symmetryConstraint);
  const cappedConstraints = capConstraints(uncappedConstraints, task.config);
  diagnostics.push(...cappedConstraints.diagnostics);

  const coverageResult = buildCoverageReport(views);
  diagnostics.push(...coverageResult.diagnostics);
  diagnostics.push(...detectDepthAmbiguity(coverageResult.coverage));

  const readiness = assessReadiness({
    views,
    landmarks: landmarksResult.landmarks,
    parts: partsResult.parts,
    coverage: coverageResult.coverage,
    correspondences: landmarksResult.correspondences,
    scaleResolved: scaleResult.resolved,
    allDiagnostics: diagnostics,
  });
  diagnostics.push(...detectNotReady(readiness));

  const sortedDiagnostics = sortDiagnostics(diagnostics);

  const base = {
    taskId: task.id,
    projectId: task.projectId,
    assetIds: task.views.map((view) => view.assetId),
    views,
    subject: { subjectLabel: task.subjectLabel, subjectCategory: task.subjectCategory },
    coordinateConvention: CANONICAL_3D_COORDINATE_SYSTEM,
    scaleEvidence: scaleResult.evidence,
    landmarks: landmarksResult.landmarks,
    parts: partsResult.parts,
    constraints: cappedConstraints.constraints,
    correspondences: landmarksResult.correspondences,
  };

  const referenceSet = deepFreeze(
    MultiViewReferenceSetSchema.parse({
      id: deterministicScopedId("reference-set", base),
      referenceSetVersion: MULTIVIEW_REFERENCE_SET_VERSION,
      taskId: task.id,
      projectId: task.projectId,
      assetIds: base.assetIds,
      views,
      subject: { label: task.subjectLabel, category: task.subjectCategory },
      coordinateConvention: CANONICAL_3D_COORDINATE_SYSTEM,
      scaleEvidence: scaleResult.evidence,
      landmarks: landmarksResult.landmarks,
      parts: partsResult.parts,
      constraints: cappedConstraints.constraints,
      correspondences: landmarksResult.correspondences,
      provenance: {
        source: "DETERMINISTIC_ANALYZER",
        provider: "multiview-reference-set-builder",
        providerVersion: "1.0.0",
        confidence: readiness.score,
      },
      diagnostics: sortedDiagnostics,
      fingerprint: fingerprint(base),
    }),
  );

  return { referenceSet, coverage: coverageResult.coverage, readiness };
}

export { hasBlockingDiagnostics };
