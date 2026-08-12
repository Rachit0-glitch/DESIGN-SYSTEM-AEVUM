import {
  AssetSchema,
  Bounds3DSchema,
  CameraSchema,
  DesignNodeSchema,
  EntityIdSchema,
  LightSchema,
  MaterialSchema,
} from "@aevum/document-model";
import { z } from "zod";

export const THREE_FOUNDATION_VERSION = "1.0.0" as const;
export const ThreeDiagnosticSeveritySchema = z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]);
export const ThreeDiagnosticCodeSchema = z.enum([
  "ASSET_TYPE_UNSUPPORTED",
  "ASSET_HASH_MISMATCH",
  "ASSET_TOO_LARGE",
  "MALFORMED_GLTF",
  "MALFORMED_BUFFER",
  "MISSING_RESOURCE",
  "UNSAFE_RESOURCE_URI",
  "NETWORK_RESOURCE_REJECTED",
  "RESOURCE_LIMIT_EXCEEDED",
  "UNSUPPORTED_EXTENSION",
  "UNSUPPORTED_MATERIAL_FEATURE",
  "UNSUPPORTED_PRIMITIVE_MODE",
  "UNSUPPORTED_SKIN_FEATURE",
  "UNSUPPORTED_ANIMATION_FEATURE",
  "MISSING_POSITION_ATTRIBUTE",
  "INVALID_INDEX",
  "INVALID_TRANSFORM",
  "INVALID_BOUNDS",
  "DEGENERATE_SCALE",
  "NO_SCENE",
  "NO_CAMERA",
  "IMPORT_PROPOSAL_INVALID",
]);
export const ThreeDiagnosticSchema = z.strictObject({
  code: ThreeDiagnosticCodeSchema,
  severity: ThreeDiagnosticSeveritySchema,
  message: z.string().min(1),
  path: z.string().optional(),
  entityIndex: z.number().int().nonnegative().optional(),
  recoverable: z.boolean(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export const ThreeImportLimitsSchema = z.strictObject({
  maxAssetBytes: z
    .number()
    .int()
    .positive()
    .default(64 * 1024 * 1024),
  maxNodes: z.number().int().positive().default(10_000),
  maxMeshes: z.number().int().positive().default(5_000),
  maxPrimitives: z.number().int().positive().default(20_000),
  maxVertices: z.number().int().positive().default(20_000_000),
  maxTextures: z.number().int().positive().default(2_000),
  maxTextureBytes: z
    .number()
    .int()
    .positive()
    .default(256 * 1024 * 1024),
  maxHierarchyDepth: z.number().int().positive().default(256),
});

export const ThreeInspectionStatisticsSchema = z.strictObject({
  sceneCount: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  meshCount: z.number().int().nonnegative(),
  primitiveCount: z.number().int().nonnegative(),
  materialCount: z.number().int().nonnegative(),
  textureCount: z.number().int().nonnegative(),
  textureBytes: z.number().int().nonnegative(),
  cameraCount: z.number().int().nonnegative(),
  lightCount: z.number().int().nonnegative(),
  animationCount: z.number().int().nonnegative(),
  skinCount: z.number().int().nonnegative(),
  morphTargetCount: z.number().int().nonnegative(),
  vertexCount: z.number().int().nonnegative(),
  triangleCount: z.number().int().nonnegative(),
  drawCallEstimate: z.number().int().nonnegative(),
});

export const ThreeAssetInspectionSchema = z.strictObject({
  version: z.literal(THREE_FOUNDATION_VERSION),
  assetId: EntityIdSchema,
  assetHash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  format: z.enum(["GLB", "GLTF"]),
  statistics: ThreeInspectionStatisticsSchema,
  sceneBounds: Bounds3DSchema.optional(),
  extensionsUsed: z.array(z.string()),
  extensionsRequired: z.array(z.string()),
  diagnostics: z.array(ThreeDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  complete: z.boolean(),
});

export const ThreeImportProposalSchema = z.strictObject({
  version: z.literal(THREE_FOUNDATION_VERSION),
  id: z.string().regex(/^three-proposal:[0-9a-f]{32}$/),
  sourceAssetId: EntityIdSchema,
  sourceAssetHash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  inspection: ThreeAssetInspectionSchema,
  rootNodeIds: z.array(EntityIdSchema).min(1),
  nodes: z.array(DesignNodeSchema).min(2),
  assets: z.array(AssetSchema),
  materials: z.array(MaterialSchema),
  cameras: z.array(CameraSchema),
  lights: z.array(LightSchema),
  diagnostics: z.array(ThreeDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const ThreeImportProposalValidationSchema = z.strictObject({
  valid: z.boolean(),
  diagnostics: z.array(ThreeDiagnosticSchema),
});

export const ThreeRenderOperationSchema = z.strictObject({
  id: z.string().regex(/^three-op:[0-9a-f]{32}$/),
  index: z.number().int().nonnegative(),
  kind: z.enum([
    "SCENE_BEGIN",
    "NODE_TRANSFORM",
    "MESH_BIND",
    "SKIN_BIND",
    "MATERIAL_BIND",
    "CAMERA_BIND",
    "LIGHT_BIND",
    "LIGHTING_PROFILE_BIND",
    "ENVIRONMENT_BIND",
    "REFLECTION_PROBE_BIND",
    "DRAW_PRIMITIVE",
    "SCENE_END",
  ]),
  entityId: z.string().min(1),
  dependencies: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
});

export const ThreeRenderPlanSchema = z.strictObject({
  version: z.literal(THREE_FOUNDATION_VERSION),
  projectionFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  sceneId: EntityIdSchema,
  activeCameraId: EntityIdSchema.optional(),
  operations: z.array(ThreeRenderOperationSchema),
  diagnostics: z.array(ThreeDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export type ThreeDiagnostic = z.infer<typeof ThreeDiagnosticSchema>;
export type ThreeImportLimits = z.infer<typeof ThreeImportLimitsSchema>;
export type ThreeAssetInspection = z.infer<typeof ThreeAssetInspectionSchema>;
export type ThreeImportProposal = z.infer<typeof ThreeImportProposalSchema>;
export type ThreeImportProposalValidation = z.infer<typeof ThreeImportProposalValidationSchema>;
export type ThreeRenderOperation = z.infer<typeof ThreeRenderOperationSchema>;
export type ThreeRenderPlan = z.infer<typeof ThreeRenderPlanSchema>;
