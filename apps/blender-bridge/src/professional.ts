import { EntityIdSchema } from "@aevum/document-model";
import { z } from "zod";
import { blenderFingerprint, deepFreeze } from "./stable.js";

export const PROFESSIONAL_3D_PROTOCOL_VERSION = "1.0.0" as const;

const IndexListSchema = z.array(z.number().int().nonnegative()).min(1).max(100_000);
const FiniteVectorSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const MeshSelectionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("VERTEX_IDS"), indices: IndexListSchema }),
  z.strictObject({ kind: z.literal("EDGE_IDS"), indices: IndexListSchema }),
  z.strictObject({ kind: z.literal("FACE_IDS"), indices: IndexListSchema }),
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
    direction: FiniteVectorSchema,
    minimumDot: z.number().finite().min(-1).max(1),
  }),
  z.strictObject({
    kind: z.literal("BY_POSITION_RANGE"),
    domain: z.enum(["VERTEX", "EDGE", "FACE"]),
    minimum: FiniteVectorSchema,
    maximum: FiniteVectorSchema,
  }),
]);

export const MeshOperationClassSchema = z.enum(["NONDESTRUCTIVE", "TOPOLOGY_CHANGING", "DESTRUCTIVE"]);
export const TopologyQualityProfileSchema = z.enum(["WEB_STATIC", "WEB_ANIMATED", "CHARACTER", "HIGH_RES_REFERENCE"]);
export const TopologyQualitySchema = z.enum(["EXCELLENT", "GOOD", "ACCEPTABLE", "POOR", "INVALID"]);

export const ProfessionalResourceLimitsSchema = z.strictObject({
  maxSelectedElements: z.number().int().positive(),
  maxOutputVertices: z.number().int().positive(),
  maxOutputFaces: z.number().int().positive(),
  maxTopologyGrowthRatio: z.number().finite().min(1).max(100),
  maxSubdivisionLevel: z.number().int().min(0).max(6),
  maxBevelSegments: z.number().int().min(1).max(32),
  maxLoopCuts: z.number().int().min(1).max(128),
  maxUvIslands: z.number().int().positive(),
  maxModifiers: z.number().int().positive(),
});

export const MeshElementMappingSchema = z.strictObject({
  identityStatus: z.enum(["PRESERVED", "PARTIAL", "DESTROYED"]),
  sourceVertexCount: z.number().int().nonnegative(),
  resultVertexCount: z.number().int().nonnegative(),
  sourceFaceCount: z.number().int().nonnegative(),
  resultFaceCount: z.number().int().nonnegative(),
  removedVertexIndices: z.array(z.number().int().nonnegative()),
  removedFaceIndices: z.array(z.number().int().nonnegative()),
  notes: z.array(z.string()),
});

export const MeshDiagnosticCodeSchema = z.enum([
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
]);

export const MeshQualityDiagnosticSchema = z.strictObject({
  code: MeshDiagnosticCodeSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]),
  message: z.string().min(1).max(2_000),
  elementIndices: z.array(z.number().int().nonnegative()).max(10_000).optional(),
  approximate: z.boolean().default(false),
});

export const TopologyReportSchema = z.strictObject({
  version: z.literal(PROFESSIONAL_3D_PROTOCOL_VERSION),
  objectId: EntityIdSchema,
  profile: TopologyQualityProfileSchema,
  quality: TopologyQualitySchema,
  vertexCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  faceCount: z.number().int().nonnegative(),
  triangleCount: z.number().int().nonnegative(),
  triangleFaceCount: z.number().int().nonnegative(),
  quadCount: z.number().int().nonnegative(),
  ngonCount: z.number().int().nonnegative(),
  boundaryEdgeCount: z.number().int().nonnegative(),
  nonManifoldEdgeCount: z.number().int().nonnegative(),
  looseVertexCount: z.number().int().nonnegative(),
  looseEdgeCount: z.number().int().nonnegative(),
  looseFaceCount: z.number().int().nonnegative(),
  duplicatePositionCandidateCount: z.number().int().nonnegative(),
  zeroAreaFaceCount: z.number().int().nonnegative(),
  degenerateEdgeCount: z.number().int().nonnegative(),
  connectedComponentCount: z.number().int().nonnegative(),
  eulerCharacteristic: z.number().int(),
  diagnostics: z.array(MeshQualityDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const UvReportSchema = z.strictObject({
  version: z.literal(PROFESSIONAL_3D_PROTOCOL_VERSION),
  objectId: EntityIdSchema,
  layerCount: z.number().int().nonnegative(),
  activeLayer: z.string().nullable(),
  layers: z.array(z.string()),
  islandCount: z.number().int().nonnegative(),
  seamEdgeCount: z.number().int().nonnegative(),
  missingFaceCount: z.number().int().nonnegative(),
  zeroAreaFaceCount: z.number().int().nonnegative(),
  outOfBoundsLoopCount: z.number().int().nonnegative(),
  overlapEstimate: z.number().finite().min(0).max(1).nullable(),
  packingEfficiency: z.number().finite().min(0).max(1).nullable(),
  density: z
    .strictObject({
      unit: z.enum(["PX_PER_M", "PX_PER_CM"]),
      minimum: z.number().finite().nonnegative(),
      maximum: z.number().finite().nonnegative(),
      mean: z.number().finite().nonnegative(),
    })
    .optional(),
  udimTiles: z.array(z.number().int().positive()),
  diagnostics: z.array(MeshQualityDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const PbrMaterialReportSchema = z.strictObject({
  version: z.literal(PROFESSIONAL_3D_PROTOCOL_VERSION),
  materialId: EntityIdSchema,
  graphSupport: z.enum(["LOSSLESS_SUPPORTED", "PARTIAL", "UNSUPPORTED"]),
  baseColor: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  metallic: z.number().finite().min(0).max(1),
  roughness: z.number().finite().min(0).max(1),
  alpha: z.number().finite().min(0).max(1),
  emission: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
  normalStrength: z.number().finite().nonnegative().nullable(),
  textureChannels: z.array(
    z.strictObject({
      channel: z.enum(["BASE_COLOR", "METALLIC_ROUGHNESS", "NORMAL", "OCCLUSION", "EMISSION"]),
      imageName: z.string(),
      colorSpace: z.string(),
    }),
  ),
  diagnostics: z.array(MeshQualityDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
});

export const WebQualityProfileSchema = z.enum(["WEB_HERO_HIGH", "WEB_STANDARD", "WEB_MOBILE", "ARCHIVE_HIGH"]);
export const WEB_QUALITY_TARGETS = deepFreeze({
  WEB_HERO_HIGH: { maxTriangles: 250_000, maxMaterials: 16, maxTextures: 32, maxDrawCalls: 32 },
  WEB_STANDARD: { maxTriangles: 100_000, maxMaterials: 8, maxTextures: 16, maxDrawCalls: 16 },
  WEB_MOBILE: { maxTriangles: 40_000, maxMaterials: 4, maxTextures: 8, maxDrawCalls: 8 },
  ARCHIVE_HIGH: { maxTriangles: 5_000_000, maxMaterials: 256, maxTextures: 512, maxDrawCalls: 512 },
} as const);

const NONDESTRUCTIVE = new Set([
  "mesh.inspect",
  "mesh.topology_inspect",
  "mesh.validate",
  "uv.inspect",
  "uv.texel_density",
  "uv.udim_inspect",
  "material.inspect",
  "material.validate_pbr",
  "material.update_pbr",
  "optimization.analyze",
  "mesh.set_shading",
  "mesh.set_origin",
  "mesh.set_pivot",
]);
const DESTRUCTIVE = new Set([
  "mesh.delete_vertices",
  "mesh.delete_edges",
  "mesh.delete_faces",
  "topology.remesh",
  "topology.delete_loose",
  "topology.fill_holes",
]);

export function classifyMeshOperation(kind: string): z.infer<typeof MeshOperationClassSchema> {
  if (NONDESTRUCTIVE.has(kind)) return "NONDESTRUCTIVE";
  if (DESTRUCTIVE.has(kind)) return "DESTRUCTIVE";
  return "TOPOLOGY_CHANGING";
}

export function estimateTopologyGrowth(input: {
  readonly kind: string;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly selectedCount: number;
  readonly subdivisionLevel?: number;
  readonly bevelSegments?: number;
  readonly loopCuts?: number;
}): Readonly<{ estimatedVertices: number; estimatedFaces: number; growthRatio: number; fingerprint: string }> {
  let multiplier = 1;
  if (input.kind === "mesh.subdivide") multiplier = 4 ** (input.subdivisionLevel ?? 1);
  else if (input.kind === "mesh.bevel") multiplier += Math.max(1, input.bevelSegments ?? 1) * 0.75;
  else if (input.kind === "mesh.loop_cut") multiplier += Math.max(1, input.loopCuts ?? 1);
  else if (["mesh.extrude", "mesh.inset", "mesh.solidify", "mesh.mirror"].includes(input.kind)) multiplier = 2;
  const selectedRatio = Math.min(1, input.selectedCount / Math.max(1, input.faceCount));
  const growthRatio = 1 + (multiplier - 1) * selectedRatio;
  const result = {
    estimatedVertices: Math.ceil(input.vertexCount * growthRatio),
    estimatedFaces: Math.ceil(input.faceCount * growthRatio),
    growthRatio: Math.round(growthRatio * 1_000_000) / 1_000_000,
  };
  return deepFreeze({ ...result, fingerprint: blenderFingerprint({ ...input, ...result }) });
}

export function validateGrowthEstimate(
  estimate: ReturnType<typeof estimateTopologyGrowth>,
  limits: z.infer<typeof ProfessionalResourceLimitsSchema>,
): void {
  if (
    estimate.estimatedVertices > limits.maxOutputVertices ||
    estimate.estimatedFaces > limits.maxOutputFaces ||
    estimate.growthRatio > limits.maxTopologyGrowthRatio
  ) {
    throw new Error("MESH_OPERATION_BUDGET_EXCEEDED");
  }
}

export type MeshSelection = z.infer<typeof MeshSelectionSchema>;
export type MeshOperationClass = z.infer<typeof MeshOperationClassSchema>;
export type ProfessionalResourceLimits = z.infer<typeof ProfessionalResourceLimitsSchema>;
export type TopologyReport = z.infer<typeof TopologyReportSchema>;
export type UvReport = z.infer<typeof UvReportSchema>;
export type PbrMaterialReport = z.infer<typeof PbrMaterialReportSchema>;
