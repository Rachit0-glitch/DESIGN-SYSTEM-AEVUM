import { CURRENT_COMMAND_VERSION, type ChangeSet } from "@aevum/command-engine";
import {
  AssetSchema,
  Bounds3DSchema,
  CURRENT_SCHEMA_VERSION,
  CanonicalDesignDocumentSchema,
  CoordinateSystem3DSchema,
  DesignNodeSchema,
  EntityIdSchema,
  JsonValueSchema,
  TimelineSchema,
  TransformSchema,
} from "@aevum/document-model";
import { WorkspaceIdSchema } from "@aevum/project-store";
import {
  LightingEstimateSchema,
  ReferenceLightingInputSchema,
  ResolvedLightingSchema,
  LightingValidationReportSchema,
} from "@aevum/lighting";
import { z } from "zod";
import { McpPermissionSchema } from "./permissions.js";
import { MCP_PROTOCOL_VERSION } from "./version.js";

export const MCP_TOOL_VERSION = "1.9.0" as const;
export const McpAuthModeSchema = z.enum(["development", "supabase", "disabled"]);
export const McpToolNameSchema = z.enum([
  "system.get_capabilities",
  "project.get",
  "document.get",
  "document.get_version",
  "document.list_versions",
  "document.inspect_hierarchy",
  "asset.get",
  "timeline.get",
  "three.inspect_asset",
  "three.inspect_scene",
  "three.update_node_transform",
  "three.inspect_topology",
  "three.inspect_uv",
  "three.validate_mesh",
  "three.validate_material",
  "three.analyze_web_quality",
  "three.bevel_mesh",
  "three.unwrap_uv",
  "three.update_pbr_material",
  "three.multiview_analyze",
  "three.reconstruction_generate_candidate",
  "three.import_scene",
  "three.rig_create",
  "three.rig_inspect",
  "three.skin_bind",
  "three.skin_inspect",
  "three.pose_inspect",
  "three.pose_update",
  "three.pose_reset",
  "three.weight_inspect",
  "three.weight_update",
  "three.weight_normalize",
  "three.ik_update",
  "three.constraint_update",
  "three.deformation_validate",
  "three.retarget",
  "lighting.analyze_reference",
  "lighting.inspect",
  "lighting.resolve_profile",
  "lighting.create_rig",
  "lighting.validate",
  "lighting.bake",
  "blender.runtime_info",
  "blender.inspect_scene",
  "blender.inspect_object",
  "blender.inspect_mesh",
  "blender.inspect_material",
  "blender.inspect_camera",
  "blender.inspect_light",
  "blender.update_object_transform",
  "blender.update_material",
  "blender.update_camera",
  "blender.update_light",
  "blender.duplicate_object",
  "blender.delete_object",
  "blender.export_scene",
  "document.rename",
  "node.create",
  "node.update",
  "node.delete",
]);

export const McpToolDescriptorSchema = z.strictObject({
  name: McpToolNameSchema,
  version: z.literal(MCP_TOOL_VERSION),
  description: z.string().min(1).max(500),
  requiredPermissions: z.array(McpPermissionSchema),
  classification: z.enum(["READ", "WRITE"]),
  supportsDryRun: z.boolean(),
  supportsTransactions: z.boolean(),
  supportsIdempotency: z.boolean(),
  timeoutMs: z.number().int().positive(),
  payloadLimitBytes: z.number().int().positive(),
  auditPolicy: z.enum(["ALWAYS", "WRITE_ONLY", "FAILURES"]),
  enabled: z.boolean(),
});

export const McpLimitsSchema = z.strictObject({
  requestBodyBytes: z.number().int().positive(),
  toolInputBytes: z.number().int().positive(),
  responseBytes: z.number().int().positive(),
  metadataBytes: z.number().int().positive(),
  batchSize: z.number().int().positive(),
  nodePayloadBytes: z.number().int().positive(),
  auditPayloadBytes: z.number().int().positive(),
});

export const SystemCapabilitiesInputSchema = z.strictObject({});
export const SystemCapabilitiesOutputSchema = z.strictObject({
  protocolVersion: z.literal(MCP_PROTOCOL_VERSION),
  tools: z.array(McpToolDescriptorSchema),
  enabledTools: z.array(McpToolNameSchema),
  supportedSchemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  supportedCommandVersion: z.literal(CURRENT_COMMAND_VERSION),
  authMode: McpAuthModeSchema,
  dryRunSupport: z.boolean(),
  transactionSupport: z.boolean(),
  limits: McpLimitsSchema,
  deploymentVersion: z.string().min(1).max(128),
  environment: z.enum(["development", "test", "production"]),
});

export const ProjectGetInputSchema = z.strictObject({});
export const ProjectSummarySchema = z.strictObject({
  projectId: EntityIdSchema,
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(255),
  currentDocumentId: EntityIdSchema,
  currentDocumentVersion: z.number().int().positive(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  nodeCount: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative(),
  timelineCount: z.number().int().nonnegative(),
  openWarnings: z.number().int().nonnegative(),
  lastModifiedAt: z.iso.datetime({ offset: true }),
  lastModifiedBy: z.string().min(1).max(255),
});

export const DocumentGetInputSchema = z.strictObject({
  projection: z.enum(["summary", "full", "node-subtree"]).default("summary"),
  nodeId: EntityIdSchema.optional(),
});
export const DocumentGetVersionInputSchema = z.strictObject({
  version: z.number().int().positive(),
  projection: z.enum(["summary", "full"]).default("summary"),
});
export const DocumentListVersionsInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(25),
  beforeVersion: z.number().int().positive().optional(),
});
export const DocumentSummarySchema = z.strictObject({
  id: EntityIdSchema,
  projectId: EntityIdSchema,
  name: z.string().min(1).max(255),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  documentVersion: z.number().int().positive(),
  rootNodeIds: z.array(EntityIdSchema),
  nodeCount: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative(),
  timelineCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
  updatedBy: z.string().min(1).max(255),
});
export const DocumentSubtreeSchema = z.strictObject({
  document: DocumentSummarySchema,
  rootNodeId: EntityIdSchema,
  nodes: z.array(DesignNodeSchema),
});
export const DocumentReadOutputSchema = z.union([
  DocumentSummarySchema,
  CanonicalDesignDocumentSchema,
  DocumentSubtreeSchema,
]);
export const DocumentVersionEntrySchema = z.strictObject({
  documentId: EntityIdSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  actorId: z.string().min(1).max(255),
  transactionId: z.string().min(1).max(128).optional(),
});
export const DocumentListVersionsOutputSchema = z.strictObject({
  versions: z.array(DocumentVersionEntrySchema),
  nextBeforeVersion: z.number().int().positive().optional(),
});

export const DocumentInspectHierarchyInputSchema = z.strictObject({
  rootNodeId: EntityIdSchema.optional(),
  maxDepth: z.number().int().min(0).max(1_000).default(100),
});
export const HierarchyNodeSchema = z.strictObject({
  id: EntityIdSchema,
  parentId: EntityIdSchema.nullable(),
  childIds: z.array(EntityIdSchema),
  type: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  depth: z.number().int().nonnegative(),
  locked: z.boolean(),
  visible: z.boolean(),
});
export const DocumentInspectHierarchyOutputSchema = z.strictObject({
  rootIds: z.array(EntityIdSchema),
  nodes: z.array(HierarchyNodeSchema),
});

export const AssetGetInputSchema = z.strictObject({ assetId: EntityIdSchema });
export const AssetGetOutputSchema = AssetSchema;
export const TimelineGetInputSchema = z.strictObject({ timelineId: EntityIdSchema });
export const TimelineGetOutputSchema = TimelineSchema;

export const ThreeInspectAssetInputSchema = z.strictObject({ assetId: EntityIdSchema });
export const ThreeInspectAssetOutputSchema = z.strictObject({
  asset: AssetSchema,
  sourceAssetHash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  rootSceneIds: z.array(EntityIdSchema),
  nodeIds: z.array(EntityIdSchema),
  meshIds: z.array(EntityIdSchema),
  materialIds: z.array(EntityIdSchema),
  cameraIds: z.array(EntityIdSchema),
  lightIds: z.array(EntityIdSchema),
});
export const ThreeInspectSceneInputSchema = z.strictObject({
  sceneId: EntityIdSchema,
  viewport: z
    .strictObject({
      width: z.number().int().positive().max(16_384),
      height: z.number().int().positive().max(16_384),
      deviceScaleFactor: z.number().finite().positive().max(8).default(1),
      orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
      category: z.enum(["DESKTOP", "TABLET", "MOBILE", "CUSTOM"]),
      reducedMotion: z.boolean().default(false),
      breakpointId: z.string().min(1).max(128).optional(),
    })
    .optional(),
});
export const ThreeInspectSceneOutputSchema = z.strictObject({
  sceneId: EntityIdSchema,
  sourceAssetId: EntityIdSchema.optional(),
  coordinateSystem: CoordinateSystem3DSchema,
  activeCameraId: EntityIdSchema.optional(),
  nodeIds: z.array(EntityIdSchema),
  meshIds: z.array(EntityIdSchema),
  materialIds: z.array(EntityIdSchema),
  lightIds: z.array(EntityIdSchema),
  bounds: Bounds3DSchema.optional(),
  projectionFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  renderPlanFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  renderOperationCount: z.number().int().nonnegative(),
  diagnostics: z.array(z.string()),
});

// Phase 17 multi-view reconstruction foundation. This tool is read-only from the canonical
// document's perspective: it analyzes already-registered image assets and returns a bounded,
// flattened evidence summary. It never mutates the document and never invokes Blender or any
// model-generation provider. The richer internal evidence graph (full landmark/constraint/part
// records) lives in `@aevum/multiview-reconstruction` and is intentionally not mirrored here in
// full to avoid duplicating that package's schema surface into the MCP protocol layer.
const MultiviewNormalizedPointSchema = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const MultiviewViewRoleSchema = z.enum([
  "FRONT",
  "BACK",
  "LEFT",
  "RIGHT",
  "TOP",
  "BOTTOM",
  "THREE_QUARTER_FRONT_LEFT",
  "THREE_QUARTER_FRONT_RIGHT",
  "THREE_QUARTER_BACK_LEFT",
  "THREE_QUARTER_BACK_RIGHT",
  "DETAIL",
  "UNKNOWN",
]);
export const ThreeMultiviewAnalyzeInputSchema = z.strictObject({
  subjectLabel: z.string().min(1).max(255).optional(),
  subjectCategory: z.string().min(1).max(255).optional(),
  views: z
    .array(
      z.strictObject({
        assetId: EntityIdSchema,
        role: MultiviewViewRoleSchema.optional(),
        imageWidth: z.number().int().positive().max(16_384),
        imageHeight: z.number().int().positive().max(16_384),
        silhouetteContour: z.array(MultiviewNormalizedPointSchema).min(3).max(256).optional(),
      }),
    )
    .min(1)
    .max(16),
  landmarkHints: z
    .array(
      z.strictObject({
        semanticLabel: z.string().min(1).max(255),
        observations: z
          .array(
            z.strictObject({
              assetId: EntityIdSchema,
              normalized: MultiviewNormalizedPointSchema,
              visibility: z.enum(["VISIBLE", "PARTIAL", "OCCLUDED", "OUT_OF_FRAME", "UNKNOWN"]).optional(),
            }),
          )
          .min(1)
          .max(16),
      }),
    )
    .max(64)
    .default([]),
  partHints: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(255),
        observations: z
          .array(
            z.strictObject({
              assetId: EntityIdSchema,
              bounds: z.strictObject({
                minX: z.number().min(0).max(1),
                minY: z.number().min(0).max(1),
                maxX: z.number().min(0).max(1),
                maxY: z.number().min(0).max(1),
              }),
              visibility: z
                .enum(["VISIBLE", "PARTIALLY_OCCLUDED", "FULLY_OCCLUDED", "SELF_OCCLUDED", "OUT_OF_FRAME", "UNKNOWN"])
                .optional(),
            }),
          )
          .min(1)
          .max(16),
      }),
    )
    .max(32)
    .default([]),
  scaleHints: z
    .array(
      z.strictObject({
        source: z.enum(["USER_PROVIDED", "KNOWN_SPECIFICATION", "REFERENCE_OBJECT", "INFERRED"]),
        value: z.number().finite().positive(),
        unit: z.enum(["MM", "CM", "M", "IN", "FT"]),
        description: z.string().min(1).max(500).optional(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(8)
    .default([]),
  targetQuality: z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]).optional(),
});
export const ThreeMultiviewAnalyzeOutputSchema = z.strictObject({
  taskId: z.string().min(1),
  referenceSetId: z.string().min(1),
  viewSummaries: z.array(
    z.strictObject({
      assetId: EntityIdSchema,
      role: MultiviewViewRoleSchema,
      roleConfidence: z.number().min(0).max(1),
    }),
  ),
  coverage: z.record(
    z.enum(["FRONT", "BACK", "LEFT", "RIGHT", "TOP", "BOTTOM"]),
    z.strictObject({
      status: z.enum(["COVERED", "WEAK", "MISSING"]),
      confidence: z.number().min(0).max(1),
      viewIds: z.array(z.string()),
    }),
  ),
  readiness: z.strictObject({
    classification: z.enum(["INSUFFICIENT", "WEAK", "USABLE", "STRONG", "EXCELLENT"]),
    score: z.number().min(0).max(1),
  }),
  validationStatus: z.enum(["PASS", "WARN", "FAIL"]),
  reportStatus: z.enum(["READY_FOR_PROPOSAL", "NEEDS_MORE_EVIDENCE", "BLOCKED"]),
  diagnostics: z.array(
    z.strictObject({
      code: z.string(),
      severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
      message: z.string(),
    }),
  ),
  reportFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

const WriteBaseSchema = z.strictObject({ expectedDocumentVersion: z.number().int().positive() });

// Phase 18 reconstruction execution. WRITE-classified because, on success, it registers a real
// generated GLB as a canonical asset (`asset.register`) — the same bounded mutation surface
// already used elsewhere, no new command type. It never imports the asset into the scene
// (`scene3d.import` has no MCP tool at all yet, for any 3D asset); that remains a separate,
// explicit step.
export const ThreeReconstructionGenerateCandidateInputSchema = ThreeMultiviewAnalyzeInputSchema.extend(
  WriteBaseSchema.shape,
).extend({
  qualityMode: z.enum(["DRAFT", "STANDARD", "HIGH"]).optional(),
});
export const ThreeReconstructionGenerateCandidateOutputSchema = z.strictObject({
  dryRun: z.boolean(),
  baseVersion: z.number().int().nonnegative(),
  resultVersion: z.number().int().nonnegative(),
  predictedDocumentVersion: z.number().int().nonnegative().optional(),
  transactionId: z.string().min(1).optional(),
  commandIds: z.array(z.string().min(1)).optional(),
  reconstruction: z.strictObject({
    status: z.enum(["BLOCKED", "COMPLETED"]),
    stopReason: z.enum([
      "TARGET_SCORE_REACHED",
      "NO_IMPROVEMENT",
      "REGRESSION_DETECTED",
      "MAXIMUM_PASSES_REACHED",
      "INSUFFICIENT_EVIDENCE",
      "RESOURCE_LIMIT_REACHED",
    ]),
    providerId: z.enum(["LOCAL_BASELINE", "DETERMINISTIC_TEST"]),
    providerVersion: z.string().min(1),
    qualityMode: z.enum(["DRAFT", "STANDARD", "HIGH"]),
    passCount: z.number().int().nonnegative(),
    candidateSummaries: z.array(
      z.strictObject({
        generationMethod: z.enum(["BOX_PRIMITIVE", "CYLINDER_PRIMITIVE", "VOXEL_HULL"]),
        partCount: z.number().int().positive(),
        triangleCount: z.number().int().nonnegative(),
        overallScore: z.number().min(0).max(1),
      }),
    ),
    selectedScore: z
      .strictObject({
        silhouette: z.number().min(0).max(1),
        landmark: z.number().min(0).max(1),
        cameraConsistency: z.number().min(0).max(1),
        scale: z.number().min(0).max(1),
        constraintSatisfaction: z.number().min(0).max(1),
        coverage: z.number().min(0).max(1),
        topologyViability: z.number().min(0).max(1),
        overall: z.number().min(0).max(1),
        // Explicit, inspectable weights — never hidden weighting magic.
        weights: z.strictObject({
          silhouette: z.number().min(0).max(1),
          landmark: z.number().min(0).max(1),
          cameraConsistency: z.number().min(0).max(1),
          scale: z.number().min(0).max(1),
          constraintSatisfaction: z.number().min(0).max(1),
          coverage: z.number().min(0).max(1),
          topologyViability: z.number().min(0).max(1),
        }),
      })
      .optional(),
    diagnostics: z.array(
      z.strictObject({
        code: z.string(),
        severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
        message: z.string(),
      }),
    ),
  }),
  assetId: EntityIdSchema.optional(),
  assetHash: z
    .string()
    .regex(/^sha256:[0-9a-f]{64}$/i)
    .optional(),
  changeSet: z.unknown().optional(),
});

// Phase 19A: exposes the existing scene3d.import Command Engine path (already used internally
// since Phase 14) as a bounded MCP write tool. High-level input only — no raw GLB bytes,
// filesystem paths, or Command Engine payloads accepted.
export const ThreeImportSceneInputSchema = WriteBaseSchema.extend({
  assetId: EntityIdSchema,
});
export const ThreeImportSceneOutputSchema = z.strictObject({
  dryRun: z.boolean(),
  baseVersion: z.number().int().nonnegative(),
  resultVersion: z.number().int().nonnegative(),
  predictedDocumentVersion: z.number().int().nonnegative().optional(),
  transactionId: z.string().min(1).optional(),
  commandIds: z.array(z.string().min(1)).optional(),
  assetId: EntityIdSchema,
  rootNodeIds: z.array(EntityIdSchema),
  importedNodeIds: z.array(EntityIdSchema),
  counts: z.strictObject({
    nodes: z.number().int().nonnegative(),
    meshes: z.number().int().nonnegative(),
    materials: z.number().int().nonnegative(),
    cameras: z.number().int().nonnegative(),
    lights: z.number().int().nonnegative(),
  }),
  diagnostics: z.array(
    z.strictObject({
      code: z.string(),
      severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]),
      message: z.string(),
    }),
  ),
  changeSet: z.unknown().optional(),
});

export const DocumentRenameInputSchema = WriteBaseSchema.extend({ name: z.string().trim().min(1).max(255) });
export const NodeCreateInputSchema = WriteBaseSchema.extend({
  node: DesignNodeSchema,
  index: z.number().int().nonnegative().optional(),
});
export const NodeUpdateInputSchema = WriteBaseSchema.extend({
  nodeId: EntityIdSchema,
  changes: z.record(z.string().min(1).max(100), JsonValueSchema),
});
export const NodeDeleteInputSchema = WriteBaseSchema.extend({ nodeId: EntityIdSchema });
export const ThreeUpdateNodeTransformInputSchema = WriteBaseSchema.extend({
  nodeId: EntityIdSchema,
  transform: TransformSchema,
  coordinateSpace: z.literal("LOCAL"),
  unit: z.literal("M"),
});

const BlenderAssetInputSchema = z.strictObject({ assetId: EntityIdSchema });
const BlenderTargetInputSchema = BlenderAssetInputSchema.extend({ targetId: EntityIdSchema });
const BlenderWriteBaseSchema = WriteBaseSchema.extend({ assetId: EntityIdSchema });
const BlenderVector3Schema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
const BlenderQuaternionSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  w: z.number().finite(),
});
const BlenderColor4Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const MeshIndexListSchema = z.array(z.number().int().nonnegative()).min(1).max(100_000);
const MeshSelectionInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("VERTEX_IDS"), indices: MeshIndexListSchema }),
  z.strictObject({ kind: z.literal("EDGE_IDS"), indices: MeshIndexListSchema }),
  z.strictObject({ kind: z.literal("FACE_IDS"), indices: MeshIndexListSchema }),
  z.strictObject({ kind: z.literal("BOUNDARY_LOOP"), seedEdgeIndex: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal("MATERIAL_SLOT"), materialSlot: z.number().int().nonnegative() }),
  z.strictObject({
    kind: z.literal("CONNECTED_COMPONENT"),
    domain: z.enum(["VERTEX", "EDGE", "FACE"]),
    seedIndex: z.number().int().nonnegative(),
  }),
  z.strictObject({ kind: z.literal("ALL"), domain: z.enum(["VERTEX", "EDGE", "FACE"]) }),
  z.strictObject({
    kind: z.literal("BY_NORMAL_DIRECTION"),
    direction: BlenderVector3Schema,
    minimumDot: z.number().finite().min(-1).max(1),
  }),
  z.strictObject({
    kind: z.literal("BY_POSITION_RANGE"),
    domain: z.enum(["VERTEX", "EDGE", "FACE"]),
    minimum: BlenderVector3Schema,
    maximum: BlenderVector3Schema,
  }),
]);
const TopologyProfileInputSchema = z.enum(["WEB_STATIC", "WEB_ANIMATED", "CHARACTER", "HIGH_RES_REFERENCE"]);

export const BlenderRuntimeInfoInputSchema = z.strictObject({});
export const BlenderInspectSceneInputSchema = BlenderAssetInputSchema;
export const BlenderInspectObjectInputSchema = BlenderTargetInputSchema;
export const BlenderInspectMeshInputSchema = BlenderTargetInputSchema;
export const BlenderInspectMaterialInputSchema = BlenderTargetInputSchema;
export const BlenderInspectCameraInputSchema = BlenderTargetInputSchema;
export const BlenderInspectLightInputSchema = BlenderTargetInputSchema;
export const BlenderUpdateObjectTransformInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  mode: z.enum(["SET", "DELTA"]),
  coordinateSpace: z.enum(["LOCAL", "WORLD"]),
  unit: z.literal("M"),
  translation: BlenderVector3Schema.optional(),
  rotation: BlenderQuaternionSchema.optional(),
  scale: BlenderVector3Schema.optional(),
});
export const BlenderUpdateMaterialInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  baseColor: BlenderColor4Schema.optional(),
  metallic: z.number().finite().min(0).max(1).optional(),
  roughness: z.number().finite().min(0).max(1).optional(),
  alpha: z.number().finite().min(0).max(1).optional(),
  emission: BlenderColor4Schema.optional(),
  normalStrength: z.number().finite().nonnegative().max(100).optional(),
});
export const BlenderUpdateCameraInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  position: BlenderVector3Schema.optional(),
  rotation: BlenderQuaternionSchema.optional(),
  target: BlenderVector3Schema.optional(),
  focalLength: z.number().finite().positive().max(10_000).optional(),
  fieldOfView: z.number().finite().positive().max(Math.PI).optional(),
  nearClip: z.number().finite().positive().optional(),
  farClip: z.number().finite().positive().optional(),
  activate: z.boolean().default(false),
});
export const BlenderUpdateLightInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  position: BlenderVector3Schema.optional(),
  rotation: BlenderQuaternionSchema.optional(),
  color: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]).optional(),
  intensity: z.number().finite().nonnegative().max(1_000_000_000).optional(),
  range: z.number().finite().positive().optional(),
  spotSize: z.number().finite().positive().max(Math.PI).optional(),
  spotBlend: z.number().finite().min(0).max(1).optional(),
});
export const BlenderDuplicateObjectInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  newEntityId: EntityIdSchema,
  parentPolicy: z.enum(["SAME_PARENT", "SCENE_ROOT"]),
});
export const BlenderDeleteObjectInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  childPolicy: z.enum(["KEEP_WORLD", "DELETE_CHILDREN"]),
});
export const BlenderExportSceneInputSchema = BlenderWriteBaseSchema;
export const LightingAnalyzeReferenceInputSchema = ReferenceLightingInputSchema;
export const LightingInspectInputSchema = BlenderAssetInputSchema;
export const LightingResolveProfileInputSchema = z.strictObject({
  sceneId: EntityIdSchema,
  target: z.enum(["REALTIME", "OFFLINE", "MOBILE"]),
});
export const LightingCreateRigInputSchema = BlenderWriteBaseSchema.extend({
  sceneId: EntityIdSchema,
  name: z.string().trim().min(1).max(128),
  preset: z.enum([
    "THREE_POINT",
    "PRODUCT",
    "CHARACTER",
    "RIM",
    "SOFTBOX",
    "NEON",
    "CINEMATIC",
    "DAY",
    "NIGHT",
    "STUDIO",
    "CUSTOM",
  ]),
  target: z.enum(["REALTIME", "OFFLINE", "MOBILE"]).default("REALTIME"),
  reference: ReferenceLightingInputSchema.optional(),
  hdriAssetId: EntityIdSchema.optional(),
});
export const LightingValidateInputSchema = BlenderAssetInputSchema.extend({
  sceneId: EntityIdSchema,
  target: z.enum(["REALTIME", "OFFLINE", "MOBILE"]),
  reference: ReferenceLightingInputSchema.optional(),
});
export const LightingBakeInputSchema = BlenderWriteBaseSchema.extend({
  sceneId: EntityIdSchema,
  cameraId: EntityIdSchema,
  target: z.enum(["REALTIME", "OFFLINE", "MOBILE"]),
  resolution: z.number().int().min(64).max(512),
  samples: z.number().int().min(1).max(64),
  bakeType: z.enum(["LIGHTING_PREVIEW", "SHADOW_PREVIEW", "REFLECTION_PREVIEW"]),
});

export const ThreeInspectTopologyInputSchema = BlenderTargetInputSchema.extend({
  profile: TopologyProfileInputSchema.default("WEB_STATIC"),
});
export const ThreeInspectUvInputSchema = BlenderTargetInputSchema;
export const ThreeValidateMeshInputSchema = BlenderTargetInputSchema.extend({
  profile: TopologyProfileInputSchema.default("WEB_STATIC"),
  requireUv: z.boolean().default(false),
  requireMaterial: z.boolean().default(false),
});
export const ThreeValidateMaterialInputSchema = BlenderTargetInputSchema;
export const ThreeAnalyzeWebQualityInputSchema = BlenderAssetInputSchema.extend({
  profile: z.enum(["WEB_HERO_HIGH", "WEB_STANDARD", "WEB_MOBILE", "ARCHIVE_HIGH"]),
});
export const ThreeBevelMeshInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  selection: MeshSelectionInputSchema,
  width: z.number().finite().positive().max(100),
  segments: z.number().int().min(1).max(32),
  profile: z.number().finite().min(0).max(1).default(0.5),
  affect: z.enum(["VERTICES", "EDGES"]).default("EDGES"),
});
export const ThreeUnwrapUvInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  selection: MeshSelectionInputSchema,
  method: z.enum(["ANGLE_BASED", "CONFORMAL", "SMART_PROJECT"]),
  margin: z.number().finite().min(0).max(0.25).default(0.02),
  packAfter: z.boolean().default(true),
  rotate: z.boolean().default(true),
  scaleToFit: z.boolean().default(true),
});
export const ThreeUpdatePbrMaterialInputSchema = BlenderUpdateMaterialInputSchema;

// Phase 19B: bounded rig/skin creation and inspection. Only rig.create, rig.inspect, skin.bind,
// and skin.inspect are exposed — IK chains, constraints, and bone-level pose/rest editing remain
// canonical-schema-and-validation-only for now (see packages/rigging), not yet round-tripped
// through Blender. This is an explicit, disclosed scope boundary, not an oversight.
const RigBoneSpecInputSchema = z.strictObject({
  key: z.string().min(1).max(128),
  parentKey: z.string().min(1).max(128).nullable(),
  head: BlenderVector3Schema,
  tail: BlenderVector3Schema,
  deforming: z.boolean().default(true),
});
export const ThreeRigCreateInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  name: z.string().trim().min(1).max(64),
  bones: z.array(RigBoneSpecInputSchema).min(1).max(256),
});
export const ThreeRigInspectInputSchema = BlenderTargetInputSchema;
export const ThreeSkinBindInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  rigObjectId: EntityIdSchema,
});
export const ThreeSkinInspectInputSchema = BlenderTargetInputSchema;
export const ThreePoseInspectInputSchema = BlenderTargetInputSchema.extend({ meshTargetId: EntityIdSchema.optional() });
export const ThreePoseUpdateInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  meshTargetId: EntityIdSchema.optional(),
  boneKey: z.string().min(1).max(128),
  mode: z.enum(["SET", "DELTA"]),
  translation: BlenderVector3Schema.optional(),
  rotation: BlenderQuaternionSchema.optional(),
});
export const ThreePoseResetInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  meshTargetId: EntityIdSchema.optional(),
});
export const ThreeWeightInspectInputSchema = BlenderTargetInputSchema;
export const ThreeWeightUpdateInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  boneKey: z.string().min(1).max(128),
  vertexIndices: z.array(z.number().int().nonnegative()).min(1).max(10_000),
  mode: z.enum(["SET", "ADD", "SUBTRACT", "CLEAR"]),
  value: z.number().finite().min(0).max(1).default(0),
  normalize: z.boolean().default(true),
});
export const ThreeWeightNormalizeInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  vertexIndices: z.array(z.number().int().nonnegative()).max(10_000).optional(),
});
export const ThreeIkUpdateInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  meshTargetId: EntityIdSchema.optional(),
  rootBoneKey: z.string().min(1).max(128),
  endEffectorBoneKey: z.string().min(1).max(128),
  target: BlenderVector3Schema,
  iterations: z.number().int().min(1).max(128).default(32),
  tolerance: z.number().finite().positive().max(1).default(0.001),
});
export const ThreeConstraintUpdateInputSchema = BlenderWriteBaseSchema.extend({
  targetId: EntityIdSchema,
  meshTargetId: EntityIdSchema.optional(),
  constraintId: EntityIdSchema,
  constraintType: z.enum(["COPY_ROTATION", "COPY_LOCATION", "LIMIT_ROTATION", "LIMIT_LOCATION", "TRACK_TO"]),
  targetBoneKey: z.string().min(1).max(128),
  sourceBoneKey: z.string().min(1).max(128).optional(),
  influence: z.number().finite().min(0).max(1).default(1),
  settings: z.record(z.string(), JsonValueSchema).default({}),
});
export const ThreeDeformationValidateInputSchema = BlenderTargetInputSchema.extend({
  maxDisplacementRatio: z.number().finite().positive().max(100).default(10),
});
const McpPoseDeltaSchema = z.strictObject({
  boneId: EntityIdSchema,
  translation: BlenderVector3Schema.optional(),
  rotation: BlenderQuaternionSchema.optional(),
  scale: BlenderVector3Schema.optional(),
});
const McpRetargetMappingSchema = z.strictObject({
  sourceBoneId: EntityIdSchema,
  targetBoneId: EntityIdSchema,
  semanticRole: z.string().min(1).max(64).optional(),
});
export const ThreeRetargetInputSchema = z.strictObject({
  sourceRigId: EntityIdSchema,
  targetRigId: EntityIdSchema,
  sourcePoseDeltas: z.array(McpPoseDeltaSchema).max(256),
  mappings: z.array(McpRetargetMappingSchema).max(128).optional(),
});
export const ThreeRetargetOutputSchema = z.strictObject({
  mappings: z.array(McpRetargetMappingSchema),
  targetPoseDeltas: z.array(McpPoseDeltaSchema),
  unmappedSourceBoneIds: z.array(EntityIdSchema),
  unmappedTargetBoneIds: z.array(EntityIdSchema),
  diagnostics: z.array(z.unknown()),
  fingerprint: z.string().regex(/^sha256:/),
});

const BlenderDiagnosticOutputSchema = z.strictObject({
  code: z.string().min(1).max(128),
  severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]),
  message: z.string().min(1).max(2_000),
  recoverable: z.boolean(),
  operation: z.string().min(1).max(128).optional(),
  targetId: z.string().min(1).max(255).optional(),
  details: z.record(z.string(), JsonValueSchema).optional(),
});
export const BlenderRuntimeInfoOutputSchema = z.strictObject({
  protocolVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  blenderVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  pythonVersion: z.string().regex(/^\d+\.\d+\.\d+/),
  platform: z.string().min(1).max(128),
  compatibility: z.enum(["SUPPORTED", "UNSUPPORTED", "UNTESTED"]),
  headless: z.boolean(),
  executableFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  durationMs: z.number().int().nonnegative(),
});
export const BlenderExecutionOutputSchema = z.strictObject({
  stage: z.enum(["VALIDATED", "EXECUTED"]),
  operation: z.string().min(1).max(128),
  jobId: z
    .string()
    .regex(/^blender-job:[0-9a-f]{32}$/)
    .optional(),
  state: z.enum(["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]).optional(),
  data: JsonValueSchema.optional(),
  artifacts: z.array(
    z.strictObject({
      id: z.string().min(1).max(128),
      type: z.enum(["GLB", "INSPECTION_JSON", "DIAGNOSTIC_LOG"]),
      hash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
      byteSize: z.number().int().nonnegative(),
      mimeType: z.string().min(1).max(255),
      logicalPath: z.string().min(1).max(255),
    }),
  ),
  diagnostics: z.array(BlenderDiagnosticOutputSchema),
});
const ChangeSetSchema: z.ZodType<ChangeSet> = z.strictObject({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  updated: z.array(z.string()),
  moved: z.array(z.string()),
  metadata: z.strictObject({
    commandIds: z.array(z.string()),
    transactionId: z.string(),
    fromVersion: z.number().int().nonnegative(),
    toVersion: z.number().int().positive(),
  }),
});
export const WriteToolOutputSchema = z.strictObject({
  dryRun: z.boolean(),
  baseVersion: z.number().int().positive(),
  resultVersion: z.number().int().positive(),
  predictedDocumentVersion: z.number().int().positive().optional(),
  transactionId: z.string().min(1).max(128),
  commandIds: z.array(z.string().min(1).max(128)),
  changeSet: ChangeSetSchema,
});
export const BlenderWriteOutputSchema = z.strictObject({
  dryRun: z.boolean(),
  stage: z.enum(["VALIDATED", "EXECUTED"]),
  baseVersion: z.number().int().positive(),
  operation: z.string().min(1).max(128),
  manifestFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  preview: JsonValueSchema.optional(),
  execution: BlenderExecutionOutputSchema.optional(),
  canonical: WriteToolOutputSchema.optional(),
  reconciliation: z
    .strictObject({
      unchangedEntityIds: z.array(EntityIdSchema),
      modifiedEntityIds: z.array(EntityIdSchema),
      newEntityIds: z.array(EntityIdSchema),
      deletedEntityIds: z.array(EntityIdSchema),
      outputAssetId: EntityIdSchema,
      outputAssetHash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
    })
    .optional(),
});

export const TOOL_SCHEMAS = Object.freeze({
  "system.get_capabilities": { input: SystemCapabilitiesInputSchema, output: SystemCapabilitiesOutputSchema },
  "project.get": { input: ProjectGetInputSchema, output: ProjectSummarySchema },
  "document.get": { input: DocumentGetInputSchema, output: DocumentReadOutputSchema },
  "document.get_version": { input: DocumentGetVersionInputSchema, output: DocumentReadOutputSchema },
  "document.list_versions": { input: DocumentListVersionsInputSchema, output: DocumentListVersionsOutputSchema },
  "document.inspect_hierarchy": {
    input: DocumentInspectHierarchyInputSchema,
    output: DocumentInspectHierarchyOutputSchema,
  },
  "asset.get": { input: AssetGetInputSchema, output: AssetGetOutputSchema },
  "timeline.get": { input: TimelineGetInputSchema, output: TimelineGetOutputSchema },
  "three.inspect_asset": { input: ThreeInspectAssetInputSchema, output: ThreeInspectAssetOutputSchema },
  "three.inspect_scene": { input: ThreeInspectSceneInputSchema, output: ThreeInspectSceneOutputSchema },
  "three.multiview_analyze": { input: ThreeMultiviewAnalyzeInputSchema, output: ThreeMultiviewAnalyzeOutputSchema },
  "three.reconstruction_generate_candidate": {
    input: ThreeReconstructionGenerateCandidateInputSchema,
    output: ThreeReconstructionGenerateCandidateOutputSchema,
  },
  "three.import_scene": { input: ThreeImportSceneInputSchema, output: ThreeImportSceneOutputSchema },
  "three.rig_create": { input: ThreeRigCreateInputSchema, output: BlenderWriteOutputSchema },
  "three.rig_inspect": { input: ThreeRigInspectInputSchema, output: BlenderExecutionOutputSchema },
  "three.skin_bind": { input: ThreeSkinBindInputSchema, output: BlenderWriteOutputSchema },
  "three.skin_inspect": { input: ThreeSkinInspectInputSchema, output: BlenderExecutionOutputSchema },
  "three.pose_inspect": { input: ThreePoseInspectInputSchema, output: BlenderExecutionOutputSchema },
  "three.pose_update": { input: ThreePoseUpdateInputSchema, output: BlenderWriteOutputSchema },
  "three.pose_reset": { input: ThreePoseResetInputSchema, output: BlenderWriteOutputSchema },
  "three.weight_inspect": { input: ThreeWeightInspectInputSchema, output: BlenderExecutionOutputSchema },
  "three.weight_update": { input: ThreeWeightUpdateInputSchema, output: BlenderWriteOutputSchema },
  "three.weight_normalize": { input: ThreeWeightNormalizeInputSchema, output: BlenderWriteOutputSchema },
  "three.ik_update": { input: ThreeIkUpdateInputSchema, output: BlenderWriteOutputSchema },
  "three.constraint_update": { input: ThreeConstraintUpdateInputSchema, output: BlenderWriteOutputSchema },
  "three.deformation_validate": { input: ThreeDeformationValidateInputSchema, output: BlenderExecutionOutputSchema },
  "three.retarget": { input: ThreeRetargetInputSchema, output: ThreeRetargetOutputSchema },
  "lighting.analyze_reference": { input: LightingAnalyzeReferenceInputSchema, output: LightingEstimateSchema },
  "lighting.inspect": { input: LightingInspectInputSchema, output: BlenderExecutionOutputSchema },
  "lighting.resolve_profile": { input: LightingResolveProfileInputSchema, output: ResolvedLightingSchema },
  "lighting.create_rig": { input: LightingCreateRigInputSchema, output: BlenderWriteOutputSchema },
  "lighting.validate": { input: LightingValidateInputSchema, output: LightingValidationReportSchema },
  "lighting.bake": { input: LightingBakeInputSchema, output: BlenderWriteOutputSchema },
  "document.rename": { input: DocumentRenameInputSchema, output: WriteToolOutputSchema },
  "node.create": { input: NodeCreateInputSchema, output: WriteToolOutputSchema },
  "node.update": { input: NodeUpdateInputSchema, output: WriteToolOutputSchema },
  "node.delete": { input: NodeDeleteInputSchema, output: WriteToolOutputSchema },
  "three.update_node_transform": {
    input: ThreeUpdateNodeTransformInputSchema,
    output: WriteToolOutputSchema,
  },
  "three.inspect_topology": { input: ThreeInspectTopologyInputSchema, output: BlenderExecutionOutputSchema },
  "three.inspect_uv": { input: ThreeInspectUvInputSchema, output: BlenderExecutionOutputSchema },
  "three.validate_mesh": { input: ThreeValidateMeshInputSchema, output: BlenderExecutionOutputSchema },
  "three.validate_material": { input: ThreeValidateMaterialInputSchema, output: BlenderExecutionOutputSchema },
  "three.analyze_web_quality": { input: ThreeAnalyzeWebQualityInputSchema, output: BlenderExecutionOutputSchema },
  "three.bevel_mesh": { input: ThreeBevelMeshInputSchema, output: BlenderWriteOutputSchema },
  "three.unwrap_uv": { input: ThreeUnwrapUvInputSchema, output: BlenderWriteOutputSchema },
  "three.update_pbr_material": { input: ThreeUpdatePbrMaterialInputSchema, output: BlenderWriteOutputSchema },
  "blender.runtime_info": { input: BlenderRuntimeInfoInputSchema, output: BlenderRuntimeInfoOutputSchema },
  "blender.inspect_scene": { input: BlenderInspectSceneInputSchema, output: BlenderExecutionOutputSchema },
  "blender.inspect_object": { input: BlenderInspectObjectInputSchema, output: BlenderExecutionOutputSchema },
  "blender.inspect_mesh": { input: BlenderInspectMeshInputSchema, output: BlenderExecutionOutputSchema },
  "blender.inspect_material": { input: BlenderInspectMaterialInputSchema, output: BlenderExecutionOutputSchema },
  "blender.inspect_camera": { input: BlenderInspectCameraInputSchema, output: BlenderExecutionOutputSchema },
  "blender.inspect_light": { input: BlenderInspectLightInputSchema, output: BlenderExecutionOutputSchema },
  "blender.update_object_transform": {
    input: BlenderUpdateObjectTransformInputSchema,
    output: BlenderWriteOutputSchema,
  },
  "blender.update_material": { input: BlenderUpdateMaterialInputSchema, output: BlenderWriteOutputSchema },
  "blender.update_camera": { input: BlenderUpdateCameraInputSchema, output: BlenderWriteOutputSchema },
  "blender.update_light": { input: BlenderUpdateLightInputSchema, output: BlenderWriteOutputSchema },
  "blender.duplicate_object": { input: BlenderDuplicateObjectInputSchema, output: BlenderWriteOutputSchema },
  "blender.delete_object": { input: BlenderDeleteObjectInputSchema, output: BlenderWriteOutputSchema },
  "blender.export_scene": { input: BlenderExportSceneInputSchema, output: BlenderWriteOutputSchema },
});

export type McpAuthMode = z.infer<typeof McpAuthModeSchema>;
export type McpToolName = z.infer<typeof McpToolNameSchema>;
export type McpToolDescriptor = z.infer<typeof McpToolDescriptorSchema>;
export type McpLimits = z.infer<typeof McpLimitsSchema>;
export type SystemCapabilitiesOutput = z.infer<typeof SystemCapabilitiesOutputSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type DocumentReadOutput = z.infer<typeof DocumentReadOutputSchema>;
export type WriteToolOutput = z.infer<typeof WriteToolOutputSchema>;
