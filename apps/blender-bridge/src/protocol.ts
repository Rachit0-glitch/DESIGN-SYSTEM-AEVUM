import { EntityIdSchema, JsonValueSchema } from "@aevum/document-model";
import { z } from "zod";
import { blenderFingerprint, deepFreeze } from "./stable.js";

export const BLENDER_BRIDGE_PROTOCOL_VERSION = "1.0.0" as const;
export const BLENDER_TESTED_VERSION = "5.1.2" as const;

export const BlenderDiagnosticCodeSchema = z.enum([
  "BLENDER_NOT_CONFIGURED",
  "BLENDER_EXECUTABLE_NOT_FOUND",
  "BLENDER_VERSION_UNSUPPORTED",
  "BLENDER_START_FAILED",
  "BLENDER_JOB_INVALID",
  "BLENDER_OPERATION_UNSUPPORTED",
  "BLENDER_INPUT_INVALID",
  "BLENDER_ASSET_HASH_MISMATCH",
  "BLENDER_PATH_REJECTED",
  "BLENDER_TIMEOUT",
  "BLENDER_CANCELLED",
  "BLENDER_PROCESS_FAILED",
  "BLENDER_RESULT_INVALID",
  "BLENDER_OUTPUT_MISSING",
  "BLENDER_EXPORT_FAILED",
  "BLENDER_OBJECT_NOT_FOUND",
  "BLENDER_MATERIAL_NOT_FOUND",
  "BLENDER_CAMERA_NOT_FOUND",
  "BLENDER_LIGHT_NOT_FOUND",
  "BLENDER_RESOURCE_LIMIT",
  "BLENDER_SCENE_INVALID",
  "BLENDER_CANONICAL_ROUNDTRIP_FAILED",
]);
export const BlenderDiagnosticSchema = z.strictObject({
  code: BlenderDiagnosticCodeSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]),
  message: z.string().min(1).max(2_000),
  recoverable: z.boolean(),
  operation: z.string().min(1).max(128).optional(),
  targetId: z.string().min(1).max(255).optional(),
  details: z.record(z.string(), JsonValueSchema).optional(),
});

const FiniteSchema = z.number().finite();
export const BlenderVector3Schema = z.strictObject({ x: FiniteSchema, y: FiniteSchema, z: FiniteSchema });
export const BlenderQuaternionSchema = z.strictObject({
  x: FiniteSchema,
  y: FiniteSchema,
  z: FiniteSchema,
  w: FiniteSchema,
});
const TargetIdSchema = EntityIdSchema;
const BaseOperationShape = { operationVersion: z.literal("1.0.0") } as const;

export const BlenderOperationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...BaseOperationShape, kind: z.literal("scene.inspect") }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("scene.import_gltf") }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("scene.export_glb") }),
  z.strictObject({
    ...BaseOperationShape,
    kind: z.literal("scene.validate"),
    requireCamera: z.boolean().default(false),
  }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("object.inspect"), objectId: TargetIdSchema }),
  z.strictObject({
    ...BaseOperationShape,
    kind: z.literal("object.transform"),
    objectId: TargetIdSchema,
    mode: z.enum(["SET", "DELTA"]),
    coordinateSpace: z.enum(["LOCAL", "WORLD"]),
    unit: z.literal("M"),
    translation: BlenderVector3Schema.optional(),
    rotation: BlenderQuaternionSchema.optional(),
    scale: BlenderVector3Schema.optional(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    kind: z.literal("object.duplicate"),
    objectId: TargetIdSchema,
    newEntityId: TargetIdSchema,
    parentPolicy: z.enum(["SAME_PARENT", "SCENE_ROOT"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    kind: z.literal("object.delete"),
    objectId: TargetIdSchema,
    childPolicy: z.enum(["KEEP_WORLD", "DELETE_CHILDREN"]),
  }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("mesh.inspect"), objectId: TargetIdSchema }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("material.inspect"), materialId: TargetIdSchema }),
  z.strictObject({
    ...BaseOperationShape,
    kind: z.literal("material.update_pbr"),
    materialId: TargetIdSchema,
    baseColor: z.tuple([FiniteSchema, FiniteSchema, FiniteSchema, FiniteSchema]).optional(),
    metallic: z.number().finite().min(0).max(1).optional(),
    roughness: z.number().finite().min(0).max(1).optional(),
    alpha: z.number().finite().min(0).max(1).optional(),
    emission: z.tuple([FiniteSchema, FiniteSchema, FiniteSchema, FiniteSchema]).optional(),
  }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("camera.inspect"), cameraId: TargetIdSchema }),
  z.strictObject({
    ...BaseOperationShape,
    kind: z.literal("camera.update"),
    cameraId: TargetIdSchema,
    position: BlenderVector3Schema.optional(),
    rotation: BlenderQuaternionSchema.optional(),
    target: BlenderVector3Schema.optional(),
    focalLength: z.number().finite().positive().max(10_000).optional(),
    fieldOfView: z.number().finite().positive().max(Math.PI).optional(),
    nearClip: z.number().finite().positive().optional(),
    farClip: z.number().finite().positive().optional(),
  }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("camera.activate"), cameraId: TargetIdSchema }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("light.inspect"), lightId: TargetIdSchema }),
  z.strictObject({
    ...BaseOperationShape,
    kind: z.literal("light.update"),
    lightId: TargetIdSchema,
    position: BlenderVector3Schema.optional(),
    rotation: BlenderQuaternionSchema.optional(),
    color: z.tuple([FiniteSchema, FiniteSchema, FiniteSchema]).optional(),
    intensity: z.number().finite().nonnegative().max(1_000_000_000).optional(),
    range: z.number().finite().positive().optional(),
    spotSize: z.number().finite().positive().max(Math.PI).optional(),
    spotBlend: z.number().finite().min(0).max(1).optional(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    kind: z.literal("bridge.test_delay"),
    durationMs: z.number().int().min(100).max(10_000),
  }),
]);

export const BlenderResourceBudgetSchema = z.strictObject({
  maxInputBytes: z.number().int().positive(),
  maxOutputBytes: z.number().int().positive(),
  maxObjects: z.number().int().positive(),
  maxMeshes: z.number().int().positive(),
  maxMaterials: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});
export const BlenderInputAssetSchema = z.strictObject({
  assetId: EntityIdSchema,
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  mimeType: z.enum(["model/gltf-binary", "model/gltf+json"]),
  byteSize: z.number().int().positive(),
});
export const BlenderIdentityBindingSchema = z.strictObject({
  kind: z.enum(["OBJECT", "MATERIAL", "CAMERA", "LIGHT"]),
  entityId: EntityIdSchema,
  sourceName: z.string().min(1).max(255),
});
export const BlenderJobStateSchema = z.enum([
  "CREATED",
  "VALIDATING",
  "PREPARING",
  "RUNNING",
  "COLLECTING",
  "VALIDATING_OUTPUT",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);
export const BlenderJobSchema = z.strictObject({
  protocolVersion: z.literal(BLENDER_BRIDGE_PROTOCOL_VERSION),
  id: z.string().regex(/^blender-job:[0-9a-f]{32}$/),
  workspaceId: z.string().min(1).max(255),
  actorId: z.string().min(1).max(255),
  correlationId: z.string().min(1).max(255),
  createdAt: z.iso.datetime({ offset: true }),
  inputAsset: BlenderInputAssetSchema,
  identityBindings: z.array(BlenderIdentityBindingSchema).max(100_000),
  operation: BlenderOperationSchema,
  resourceBudget: BlenderResourceBudgetSchema,
  expectedOutputs: z.strictObject({ inspection: z.boolean(), glb: z.boolean() }),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const BlenderRuntimeInfoSchema = z.strictObject({
  protocolVersion: z.literal(BLENDER_BRIDGE_PROTOCOL_VERSION),
  blenderVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  blenderMajor: z.number().int().nonnegative(),
  blenderMinor: z.number().int().nonnegative(),
  blenderPatch: z.number().int().nonnegative(),
  pythonVersion: z.string().regex(/^\d+\.\d+\.\d+/),
  platform: z.string().min(1),
  compatibility: z.enum(["SUPPORTED", "UNSUPPORTED", "UNTESTED"]),
  headless: z.boolean(),
  executableFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  durationMs: z.number().int().nonnegative(),
});
export const BlenderArtifactSchema = z.strictObject({
  id: z.string().regex(/^blender-artifact:[0-9a-f]{32}$/),
  jobId: BlenderJobSchema.shape.id,
  type: z.enum(["GLB", "INSPECTION_JSON", "DIAGNOSTIC_LOG"]),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  byteSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1),
  logicalPath: z.string().regex(/^\/(output|logs)\/[a-z0-9._-]+$/i),
  createdAt: z.iso.datetime({ offset: true }),
  provenance: z.strictObject({
    sourceAssetId: EntityIdSchema,
    sourceAssetHash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
    blenderVersion: z.string().min(1),
    operationFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  }),
});
export const BlenderJobResultSchema = z.strictObject({
  protocolVersion: z.literal(BLENDER_BRIDGE_PROTOCOL_VERSION),
  jobId: BlenderJobSchema.shape.id,
  state: BlenderJobStateSchema,
  operation: z.enum([
    "scene.inspect",
    "scene.import_gltf",
    "scene.export_glb",
    "scene.validate",
    "object.inspect",
    "object.transform",
    "object.duplicate",
    "object.delete",
    "mesh.inspect",
    "material.inspect",
    "material.update_pbr",
    "camera.inspect",
    "camera.update",
    "camera.activate",
    "light.inspect",
    "light.update",
    "bridge.test_delay",
  ]),
  startedAt: z.iso.datetime({ offset: true }),
  completedAt: z.iso.datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
  exitCode: z.number().int().nullable(),
  transitions: z.array(z.strictObject({ state: BlenderJobStateSchema, at: z.iso.datetime({ offset: true }) })),
  runtime: BlenderRuntimeInfoSchema.optional(),
  data: JsonValueSchema.optional(),
  artifacts: z.array(BlenderArtifactSchema),
  diagnostics: z.array(BlenderDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export type BlenderDiagnostic = z.infer<typeof BlenderDiagnosticSchema>;
export type BlenderOperation = z.infer<typeof BlenderOperationSchema>;
export type BlenderResourceBudget = z.infer<typeof BlenderResourceBudgetSchema>;
export type BlenderJob = z.infer<typeof BlenderJobSchema>;
export type BlenderJobState = z.infer<typeof BlenderJobStateSchema>;
export type BlenderRuntimeInfo = z.infer<typeof BlenderRuntimeInfoSchema>;
export type BlenderArtifact = z.infer<typeof BlenderArtifactSchema>;
export type BlenderJobResult = z.infer<typeof BlenderJobResultSchema>;

export type CreateBlenderJobInput = Omit<BlenderJob, "protocolVersion" | "id" | "fingerprint">;

export function createBlenderJob(input: CreateBlenderJobInput): BlenderJob {
  const parsed = BlenderJobSchema.omit({ protocolVersion: true, id: true, fingerprint: true }).parse(input);
  const fingerprint = blenderFingerprint(parsed);
  return deepFreeze(
    BlenderJobSchema.parse({
      ...parsed,
      protocolVersion: BLENDER_BRIDGE_PROTOCOL_VERSION,
      id: `blender-job:${fingerprint.slice(7, 39)}`,
      fingerprint,
    }),
  );
}

export function validateBlenderJob(input: unknown): BlenderJob {
  return deepFreeze(BlenderJobSchema.parse(input));
}

export function createBlenderJobResult(
  input: Omit<BlenderJobResult, "protocolVersion" | "fingerprint">,
): BlenderJobResult {
  const parsed = BlenderJobResultSchema.omit({ protocolVersion: true, fingerprint: true }).parse(input);
  return deepFreeze(
    BlenderJobResultSchema.parse({
      ...parsed,
      protocolVersion: BLENDER_BRIDGE_PROTOCOL_VERSION,
      fingerprint: blenderFingerprint(parsed),
    }),
  );
}
