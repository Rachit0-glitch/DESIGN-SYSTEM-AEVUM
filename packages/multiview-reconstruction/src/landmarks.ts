import {
  imageSpaceReprojectionError,
  projectPoint,
  rayForNormalizedPoint,
  triangulateRays,
  type ResolvedCameraGeometry,
  type TriangulationObservation,
} from "./camera-math.js";
import { deterministicScopedId } from "./deterministic.js";
import { diagnostic } from "./diagnostics.js";
import { averageConfidence } from "./confidence.js";
import { deepFreeze } from "./immutable.js";
import {
  CrossViewCorrespondenceSchema,
  LandmarkSchema,
  type CameraEstimate,
  type CrossViewCorrespondence,
  type Landmark,
  type LandmarkHint,
  type MultiViewConfig,
  type MultiViewDiagnostic,
} from "./schemas.js";

const REPROJECTION_ERROR_WORLD_THRESHOLD = 0.2;
const REPROJECTION_ERROR_IMAGE_THRESHOLD = 0.08;

export function resolveCameraGeometry(estimate: CameraEstimate | undefined): ResolvedCameraGeometry | undefined {
  if (!estimate) return undefined;
  const { position, rotation } = estimate.extrinsics;
  if (!position || !rotation) return undefined;
  return {
    position,
    orientation: rotation,
    verticalFieldOfView: estimate.intrinsics.verticalFieldOfView ?? Math.PI / 4,
    aspectRatio: estimate.intrinsics.aspectRatio ?? 1,
    principalPoint: estimate.intrinsics.principalPoint ?? { x: 0.5, y: 0.5 },
  };
}

export interface BuildLandmarksInput {
  readonly hints: readonly LandmarkHint[];
  readonly assetIdToViewId: ReadonlyMap<string, string>;
  readonly cameraByViewId: ReadonlyMap<string, CameraEstimate | undefined>;
  readonly config: MultiViewConfig;
}

export interface BuildLandmarksResult {
  readonly landmarks: readonly Landmark[];
  readonly correspondences: readonly CrossViewCorrespondence[];
  readonly diagnostics: readonly MultiViewDiagnostic[];
}

/**
 * Builds canonical landmark records from hint observations, and where at least two views carry a
 * resolvable camera pose, triangulates a real 3D estimate via least-squares ray intersection and
 * records genuine reprojection error rather than a fabricated position.
 */
export function buildLandmarks(input: BuildLandmarksInput): BuildLandmarksResult {
  const diagnostics: MultiViewDiagnostic[] = [];
  const landmarks: Landmark[] = [];
  const correspondences: CrossViewCorrespondence[] = [];

  const hints = input.hints.slice(0, input.config.maxLandmarks);
  if (input.hints.length > input.config.maxLandmarks) {
    diagnostics.push(
      diagnostic({
        code: "RESOURCE_LIMIT_EXCEEDED",
        severity: "WARNING",
        message: `${input.hints.length} landmark hints were supplied but only ${input.config.maxLandmarks} are processed.`,
        stage: "LANDMARK_CONSTRUCTION",
        recoverable: true,
      }),
    );
  }

  for (const hint of hints) {
    const observationInputs = hint.observations.slice(0, input.config.maxObservationsPerLandmark);
    const observations = observationInputs
      .map((observation) => {
        const viewId = input.assetIdToViewId.get(observation.assetId);
        if (!viewId) return undefined;
        return {
          viewId,
          normalized: observation.normalized,
          visibility: observation.visibility ?? ("VISIBLE" as const),
          confidence: 0.9,
          source: "USER" as const,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

    if (observations.length === 0) continue;

    const landmarkId = deterministicScopedId("landmark", { label: hint.semanticLabel, observations });
    const relatedDiagnostics: MultiViewDiagnostic[] = [];

    if (observations.length < 2) {
      relatedDiagnostics.push(
        diagnostic({
          code: "LANDMARK_INSUFFICIENT_OBSERVATIONS",
          severity: "INFO",
          message: `Landmark "${hint.semanticLabel}" has only one observation; it cannot be triangulated.`,
          stage: "LANDMARK_CONSTRUCTION",
          recoverable: true,
          relatedIds: [landmarkId],
        }),
      );
    }

    const triangulationObservations: TriangulationObservation[] = [];
    for (const observation of observations) {
      const geometry = resolveCameraGeometry(input.cameraByViewId.get(observation.viewId));
      if (!geometry) continue;
      triangulationObservations.push({
        viewId: observation.viewId,
        ray: rayForNormalizedPoint(geometry, observation.normalized),
      });
    }

    const triangulation = triangulateRays(triangulationObservations);
    if (triangulation && triangulation.residual > REPROJECTION_ERROR_WORLD_THRESHOLD) {
      relatedDiagnostics.push(
        diagnostic({
          code: "LANDMARK_REPROJECTION_ERROR_HIGH",
          severity: "WARNING",
          message: `Landmark "${hint.semanticLabel}" triangulated with residual ${triangulation.residual.toFixed(4)}, above the ${REPROJECTION_ERROR_WORLD_THRESHOLD} threshold.`,
          stage: "LANDMARK_CONSTRUCTION",
          recoverable: true,
          relatedIds: [landmarkId],
        }),
      );
    }

    // Independent image-space consistency check: reproject the triangulated point into every
    // contributing camera and compare against the originally observed normalized coordinate. A
    // camera for which the triangulated point falls outside its view entirely is itself strong
    // evidence of inconsistency, not something to skip.
    let maxImageSpaceError = 0;
    let reprojectionFailed = false;
    if (triangulation) {
      for (const observation of observations) {
        const geometry = resolveCameraGeometry(input.cameraByViewId.get(observation.viewId));
        if (!geometry) continue;
        const reprojected = projectPoint(geometry, triangulation.point);
        if (!reprojected) {
          reprojectionFailed = true;
          continue;
        }
        const error = imageSpaceReprojectionError(observation.normalized, reprojected);
        if (error !== undefined) maxImageSpaceError = Math.max(maxImageSpaceError, error);
      }
    }
    const consistent =
      !triangulation || (!reprojectionFailed && maxImageSpaceError <= REPROJECTION_ERROR_IMAGE_THRESHOLD);
    if (triangulation && !consistent) {
      relatedDiagnostics.push(
        diagnostic({
          code: "LANDMARK_CONFLICT",
          severity: "ERROR",
          message: `Landmark "${hint.semanticLabel}" observations disagree by ${maxImageSpaceError.toFixed(4)} in normalized image space across views.`,
          stage: "LANDMARK_CONSTRUCTION",
          recoverable: true,
          relatedIds: [landmarkId],
        }),
      );
    }

    const landmark = deepFreeze(
      LandmarkSchema.parse({
        id: landmarkId,
        semanticLabel: hint.semanticLabel,
        observations,
        confidence: averageConfidence(observations.map((observation) => observation.confidence)),
        ...(triangulation ? { estimated3D: triangulation.point, reprojectionError: triangulation.residual } : {}),
        provenance: {
          source: "USER",
          provider: "task-input",
          providerVersion: "1.0.0",
          confidence: averageConfidence(observations.map((observation) => observation.confidence)),
        },
      }),
    );
    landmarks.push(landmark);
    diagnostics.push(...relatedDiagnostics);
    correspondences.push(
      deepFreeze(
        CrossViewCorrespondenceSchema.parse({
          landmarkId: landmark.id,
          viewIds: observations.map((observation) => observation.viewId),
          consistent,
          ...(triangulation ? { reprojectionError: triangulation.residual } : {}),
          diagnostics: relatedDiagnostics,
        }),
      ),
    );
  }

  return { landmarks: deepFreeze(landmarks), correspondences: deepFreeze(correspondences), diagnostics };
}
