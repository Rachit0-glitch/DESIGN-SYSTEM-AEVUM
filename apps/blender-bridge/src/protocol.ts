import { EntityIdSchema, JsonValueSchema } from "@aevum/document-model";
import { z } from "zod";
import { MeshSelectionSchema, ProfessionalResourceLimitsSchema } from "./professional.js";
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
  "MESH_NOT_FOUND",
  "MESH_SELECTION_INVALID",
  "MESH_ELEMENT_NOT_FOUND",
  "MESH_OPERATION_INVALID",
  "MESH_TOPOLOGY_INVALID",
  "MESH_NON_MANIFOLD",
  "MESH_DEGENERATE",
  "MESH_LIMIT_EXCEEDED",
  "MESH_IDENTITY_LOST",
  "MESH_OPERATION_BUDGET_EXCEEDED",
  "SUBDIVISION_GROWTH_EXCEEDED",
  "BEVEL_GROWTH_EXCEEDED",
  "UV_LAYER_NOT_FOUND",
  "UV_UNWRAP_FAILED",
  "UV_OVERLAP",
  "UV_OUT_OF_BOUNDS",
  "UV_DISTORTION_HIGH",
  "UV_PACK_FAILED",
  "MATERIAL_UNSUPPORTED_GRAPH",
  "MATERIAL_TEXTURE_MISSING",
  "MATERIAL_VALUE_INVALID",
  "MATERIAL_ROUNDTRIP_LOSS",
  "OPTIMIZATION_TARGET_UNREACHABLE",
  "RIG_HIERARCHY_INVALID",
  "RIG_DANGLING_REFERENCE",
  "RIG_BONE_MISSING",
  "RIG_REST_POSE_INVALID",
  "SKIN_BINDING_MISSING",
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
const MeshTargetShape = { objectId: TargetIdSchema } as const;
const SelectionShape = { selection: MeshSelectionSchema } as const;

export const BlenderOperationKindSchema = z.enum([
  "scene.inspect",
  "scene.import_gltf",
  "scene.export_glb",
  "scene.validate",
  "object.inspect",
  "object.transform",
  "object.duplicate",
  "object.delete",
  "mesh.inspect",
  "mesh.topology_inspect",
  "mesh.validate",
  "mesh.extrude",
  "mesh.inset",
  "mesh.bevel",
  "mesh.loop_cut",
  "mesh.subdivide",
  "mesh.solidify",
  "mesh.mirror",
  "mesh.join",
  "mesh.separate",
  "mesh.merge_vertices",
  "mesh.delete_vertices",
  "mesh.delete_edges",
  "mesh.delete_faces",
  "mesh.recalculate_normals",
  "mesh.flip_normals",
  "mesh.set_shading",
  "mesh.set_origin",
  "mesh.set_pivot",
  "topology.decimate",
  "topology.remesh",
  "topology.delete_loose",
  "topology.fill_holes",
  "topology.triangulate",
  "topology.tris_to_quads",
  "uv.inspect",
  "uv.create_layer",
  "uv.delete_layer",
  "uv.set_active_layer",
  "uv.mark_seam",
  "uv.clear_seams",
  "uv.unwrap",
  "uv.pack",
  "uv.transform",
  "uv.texel_density",
  "uv.udim_inspect",
  "material.inspect",
  "material.update_pbr",
  "material.validate_pbr",
  "camera.inspect",
  "camera.update",
  "camera.activate",
  "light.inspect",
  "light.update",
  "optimization.analyze",
  "optimization.generate_lod",
  "rig.create",
  "rig.inspect",
  "skin.bind",
  "skin.inspect",
  "bridge.test_delay",
]);

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
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("mesh.topology_inspect"),
    profile: z.enum(["WEB_STATIC", "WEB_ANIMATED", "CHARACTER", "HIGH_RES_REFERENCE"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("mesh.validate"),
    profile: z.enum(["WEB_STATIC", "WEB_ANIMATED", "CHARACTER", "HIGH_RES_REFERENCE"]),
    requireUv: z.boolean().default(false),
    requireMaterial: z.boolean().default(false),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.extrude"),
    direction: BlenderVector3Schema,
    distance: z
      .number()
      .finite()
      .min(-100)
      .max(100)
      .refine((value) => value !== 0),
    coordinateSpace: z.enum(["LOCAL", "WORLD"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.inset"),
    amount: z.number().finite().positive().max(100),
    depth: z.number().finite().min(-100).max(100).default(0),
    mode: z.enum(["REGION", "INDIVIDUAL"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.bevel"),
    width: z.number().finite().positive().max(100),
    segments: z.number().int().min(1).max(32),
    profile: z.number().finite().min(0).max(1),
    affect: z.enum(["VERTICES", "EDGES"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("mesh.loop_cut"),
    edgeIndex: z.number().int().nonnegative(),
    cutCount: z.number().int().min(1).max(128),
    factor: z.number().finite().min(-1).max(1).default(0),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.subdivide"),
    level: z.number().int().min(1).max(6),
    mode: z.enum(["APPLIED_TOPOLOGY", "NONDESTRUCTIVE_MODIFIER"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("mesh.solidify"),
    thickness: z
      .number()
      .finite()
      .min(-100)
      .max(100)
      .refine((value) => value !== 0),
    offset: z.number().finite().min(-1).max(1),
    evenThickness: z.boolean(),
    apply: z.boolean(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("mesh.mirror"),
    axis: z.enum(["X", "Y", "Z"]),
    merge: z.boolean(),
    mergeThreshold: z.number().finite().nonnegative().max(1),
    apply: z.boolean(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("mesh.join"),
    sourceObjectIds: z.array(TargetIdSchema).min(1).max(100),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.separate"),
    policy: z.enum(["BY_MATERIAL", "LOOSE_PARTS", "SELECTED_FACES"]),
    newEntityIds: z.array(TargetIdSchema).min(1).max(100),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.merge_vertices"),
    strategy: z.enum(["CENTER", "FIRST", "BY_DISTANCE"]),
    distance: z.number().finite().nonnegative().max(10),
  }),
  ...(["vertices", "edges", "faces"] as const).map((domain) =>
    z.strictObject({
      ...BaseOperationShape,
      ...MeshTargetShape,
      ...SelectionShape,
      kind: z.literal(`mesh.delete_${domain}`),
    }),
  ),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.recalculate_normals"),
    direction: z.enum(["OUTSIDE", "INSIDE"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.flip_normals"),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("mesh.set_shading"),
    shading: z.enum(["FLAT", "SMOOTH"]),
    angle: z.number().finite().min(0).max(Math.PI).optional(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("mesh.set_origin"),
    mode: z.enum(["GEOMETRY", "CENTER_OF_MASS", "CURSOR"]),
    cursor: BlenderVector3Schema.optional(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("mesh.set_pivot"),
    position: BlenderVector3Schema,
    coordinateSpace: z.enum(["LOCAL", "WORLD"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("topology.decimate"),
    ratio: z.number().finite().positive().max(1),
    preserveBoundaries: z.boolean(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("topology.remesh"),
    voxelSize: z.number().finite().positive().max(100),
    preserveVolume: z.boolean(),
    smoothIterations: z.number().int().min(0).max(20),
  }),
  z.strictObject({ ...BaseOperationShape, ...MeshTargetShape, kind: z.literal("topology.delete_loose") }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("topology.fill_holes"),
    maxSides: z.number().int().min(3).max(1_000),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("topology.triangulate"),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("topology.tris_to_quads"),
    angleLimit: z.number().finite().min(0).max(Math.PI),
  }),
  z.strictObject({ ...BaseOperationShape, ...MeshTargetShape, kind: z.literal("uv.inspect") }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("uv.create_layer"),
    name: z.string().trim().min(1).max(63),
    setActive: z.boolean(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("uv.delete_layer"),
    name: z.string().trim().min(1).max(63),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("uv.set_active_layer"),
    name: z.string().trim().min(1).max(63),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("uv.mark_seam"),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("uv.clear_seams"),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    ...SelectionShape,
    kind: z.literal("uv.unwrap"),
    method: z.enum(["ANGLE_BASED", "CONFORMAL", "SMART_PROJECT"]),
    margin: z.number().finite().min(0).max(0.25),
    packAfter: z.boolean().default(true),
    rotate: z.boolean().default(true),
    scaleToFit: z.boolean().default(true),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("uv.pack"),
    margin: z.number().finite().min(0).max(0.25),
    rotate: z.boolean(),
    scaleToFit: z.boolean(),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("uv.transform"),
    translation: z.strictObject({ x: z.number().finite(), y: z.number().finite() }),
    scale: z.strictObject({ x: z.number().finite().positive(), y: z.number().finite().positive() }),
    rotation: z
      .number()
      .finite()
      .min(-Math.PI * 2)
      .max(Math.PI * 2),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("uv.texel_density"),
    textureWidth: z.number().int().positive().max(65_536),
    textureHeight: z.number().int().positive().max(65_536),
    unit: z.enum(["PX_PER_M", "PX_PER_CM"]),
  }),
  z.strictObject({ ...BaseOperationShape, ...MeshTargetShape, kind: z.literal("uv.udim_inspect") }),
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
    normalStrength: z.number().finite().nonnegative().max(100).optional(),
  }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("material.validate_pbr"), materialId: TargetIdSchema }),
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
    kind: z.literal("optimization.analyze"),
    profile: z.enum(["WEB_HERO_HIGH", "WEB_STANDARD", "WEB_MOBILE", "ARCHIVE_HIGH"]),
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("optimization.generate_lod"),
    level: z.enum(["LOD1", "LOD2", "LOD3"]),
    ratio: z.number().finite().positive().max(1),
    newEntityId: TargetIdSchema,
  }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("rig.create"),
    name: z.string().trim().min(1).max(64),
    bones: z
      .array(
        z.strictObject({
          key: z.string().min(1).max(128),
          parentKey: z.string().min(1).max(128).nullable(),
          head: BlenderVector3Schema,
          tail: BlenderVector3Schema,
          deforming: z.boolean(),
        }),
      )
      .min(1)
      .max(256),
  }),
  z.strictObject({ ...BaseOperationShape, kind: z.literal("rig.inspect"), objectId: TargetIdSchema }),
  z.strictObject({
    ...BaseOperationShape,
    ...MeshTargetShape,
    kind: z.literal("skin.bind"),
    rigObjectId: TargetIdSchema,
  }),
  z.strictObject({ ...BaseOperationShape, ...MeshTargetShape, kind: z.literal("skin.inspect") }),
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
  professional: ProfessionalResourceLimitsSchema,
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
  sourceFingerprint: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/i)
    .optional(),
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
  operation: BlenderOperationKindSchema,
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
