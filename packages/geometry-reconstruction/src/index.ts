import type { PackageContract } from "@aevum/shared";

export { registerCandidateAsset, type RegisterCandidateAssetInput } from "./asset-registration.js";
export {
  buildCanonicalImportPlan,
  type BuildCanonicalImportPlanInput,
  type CanonicalImportPlan,
} from "./canonical-import.js";
export {
  buildHullViews,
  generateInitialCandidates,
  type GenerateCandidatesResult,
  type RawCandidate,
} from "./candidate-generation.js";
export {
  boxDimensionNeighbors,
  checkViewRegression,
  cylinderDimensionNeighbors,
  type CylinderDimensions,
  type DimensionCandidate,
  type RegressionCheckResult,
} from "./correction.js";
export {
  deterministicCommandId,
  deterministicScopedId,
  deterministicTransactionId,
  fingerprint,
  stableStringify,
} from "./deterministic.js";
export { diagnostic, hasBlockingDiagnostics, hasErrorDiagnostics, sortDiagnostics } from "./diagnostics.js";
export {
  centroidOf,
  chamferBoundaryDistance,
  compareRasterGrids,
  convexHull,
  pointInPolygon,
  rasterizePolygon,
  type Point2D,
  type RasterGrid,
  type RasterOverlapMetrics,
} from "./geometry-2d.js";
export {
  createBoxGroundTruthFixture,
  createConflictingViewFixture,
  createCylinderGroundTruthFixture,
  createMissingViewFixture,
  createMultiPartGroundTruthFixture,
  GEOMETRY_FIXTURE_NOW,
  type GroundTruthBoxFixture,
  type GroundTruthCylinderFixture,
  type GroundTruthMultiPartFixture,
} from "./fixtures.js";
export { exportMeshToGlb } from "./glb-export.js";
export { deepFreeze } from "./immutable.js";
export {
  checkStructuralValidity,
  computeMeshBounds,
  distanceToMeshSurface,
  mergeMeshes,
  translateMesh,
  type MeshBounds,
  type StructuralValidity,
} from "./mesh-utils.js";
export {
  findViewByRole,
  fitBoxDimensions,
  fitCylinderDimensions,
  generateBoxMesh,
  generateCylinderMesh,
  resolveDimensionTargets,
  resolveScaleFactor,
  scaleMesh,
  type BoxFitResult,
  type CylinderFitResult,
  type ResolvedDimensionTarget,
  type ScaleApplicationResult,
} from "./primitives.js";
export {
  createDeterministicTestProvider,
  createLocalBaselineProvider,
  listReconstructionProviders,
  LOCAL_BASELINE_PROVIDER_VERSION,
  type GeometryReconstructionInput,
  type GeometryReconstructionOutput,
  type GeometryReconstructionProvider,
} from "./provider.js";
export * from "./schemas.js";
export {
  computeCrossViewFitScore,
  computeDifferenceEvidence,
  scoreLandmarks,
  scoreView,
  type ConstraintSatisfactionInput,
  type CrossViewScoringInput,
} from "./scoring.js";
export {
  deserializeCandidateReconstruction,
  deserializeReconstructionSessionReport,
  serializeCandidateReconstruction,
  serializeReconstructionSessionReport,
} from "./serialization.js";
export {
  runReconstructionSession,
  type RunReconstructionSessionInput,
  type RunReconstructionSessionResult,
} from "./session.js";
export {
  carveVisualHull,
  countOccupied,
  extractVoxelSurface,
  type HullView,
  type VoxelHullOptions,
} from "./voxel-hull.js";

export const packageContract: PackageContract = {
  name: "@aevum/geometry-reconstruction",
  kind: "package",
  responsibility:
    "First real local multi-view 3D reconstruction execution: candidate geometry generation (box/cylinder primitive fitting and voxel visual-hull carving) from Phase 17 evidence, cross-view scoring, bounded non-regressing correction, GLB export, and asset/canonical-import handoff.",
  owns: "Reconstruction sessions, candidate geometry and scoring contracts, the local baseline provider, the provider registry, and the (not executed) Command Engine plan for registering and importing a selected candidate.",
  mustNotOwn:
    "Real computer vision, external/paid reconstruction providers, Blender execution, canonical document mutation, rigging, or texture/material generation beyond a neutral placeholder.",
  status: "IMPLEMENTED",
};

export const GEOMETRY_RECONSTRUCTION_STATUS = packageContract.status;
