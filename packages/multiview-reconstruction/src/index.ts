import type { PackageContract } from "@aevum/shared";

export {
  addVectors,
  crossVectors,
  dotVectors,
  imageSpaceReprojectionError,
  normalizeVector,
  projectPoint,
  quaternionConjugate,
  quaternionFromLookAt,
  rayForNormalizedPoint,
  rotateVectorByQuaternion,
  scaleVector,
  subtractVectors,
  triangulateRays,
  vectorLength,
} from "./camera-math.js";
export type {
  Quat,
  Ray3D,
  ResolvedCameraGeometry,
  TriangulationObservation,
  TriangulationResult,
  Vec3,
} from "./camera-math.js";
export { createRoleBasedCameraEstimator } from "./camera-estimator.js";
export type {
  CameraEstimator,
  CameraEstimatorContext,
  RoleBasedCameraEstimatorOptions,
} from "./camera-estimator.js";
export { averageConfidence, confidence, minConfidence } from "./confidence.js";
export {
  capConstraints,
  deriveSilhouetteDimensionConstraints,
  deriveSymmetryConstraint,
  resolveScaleEvidence,
} from "./constraints.js";
export { detectDepthAmbiguity, detectDuplicateViews, detectNotReady } from "./conflicts.js";
export { buildCoverageReport } from "./coverage.js";
export { deterministicScopedId, fingerprint, stableStringify } from "./deterministic.js";
export { diagnostic, hasBlockingDiagnostics, hasErrorDiagnostics, sortDiagnostics } from "./diagnostics.js";
export { deepFreeze } from "./immutable.js";
export {
  createAsymmetricProductFixture,
  createConflictingFixture,
  createIncompleteFixture,
  createStrongProductFixture,
  createSymmetricProductFixture,
  MULTIVIEW_FIXTURE_NOW,
} from "./fixtures.js";
export { buildLandmarks, resolveCameraGeometry } from "./landmarks.js";
export { buildParts } from "./parts.js";
export { analyzeMultiView } from "./pipeline.js";
export type { AnalyzeMultiViewOptions } from "./pipeline.js";
export { createReconstructionProposal } from "./proposal.js";
export { createDeterministicMockProvider } from "./provider.js";
export type { MultiViewReconstructionProvider } from "./provider.js";
export { createMultiViewAnalysisReport } from "./report.js";
export { buildMultiViewReferenceSet } from "./reference-set.js";
export { assessReadiness } from "./readiness.js";
export * from "./schemas.js";
export {
  deserializeMultiViewAnalysisReport,
  deserializeMultiViewReferenceSet,
  deserializeMultiViewTask,
  serializeMultiViewAnalysisReport,
  serializeMultiViewReferenceSet,
  serializeMultiViewTask,
} from "./serialization.js";
export { createManifestSilhouetteProvider, computeSilhouetteStatistics } from "./silhouette.js";
export type { SilhouetteProvider, SilhouetteProviderContext, SilhouetteStatistics } from "./silhouette.js";
export { createMultiViewTask, validateMultiViewTask } from "./task.js";
export { validateMultiView } from "./validation.js";
export { classifyViewRole, detectDuplicateRoles } from "./view-roles.js";

export const packageContract: PackageContract = {
  name: "@aevum/multiview-reconstruction",
  kind: "package",
  responsibility:
    "Deterministic, provider-independent multi-view 3D reconstruction evidence: reference sets, view roles, camera estimates, landmarks, silhouettes, parts, geometric constraints, coverage, readiness, and provider-neutral reconstruction proposals.",
  owns: "Multi-view tasks, reference sets, view/camera/landmark/silhouette/part/constraint evidence, coverage and readiness assessments, cross-view validation, and the reconstruction provider contract.",
  mustNotOwn:
    "Real computer vision or segmentation models, mesh/GLB generation, Blender execution, canonical document mutation, or MCP transport.",
  status: "IMPLEMENTED",
};

export const MULTIVIEW_RECONSTRUCTION_STATUS = packageContract.status;
