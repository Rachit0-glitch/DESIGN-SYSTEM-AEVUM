import { assetIdFromHash, computeSha256, findAssetByHash } from "@aevum/assets";
import {
  AssetSchema,
  CANONICAL_3D_COORDINATE_SYSTEM,
  CameraSchema,
  DesignNodeSchema,
  EntityIdSchema,
  LightSchema,
  MaterialSchema,
  createTransform,
  type AssetRecord,
  type CanonicalDesignDocument,
  type DesignNode,
  type ImportProvenanceSchema,
} from "@aevum/document-model";
import type { Material, Node, Primitive, Skin, Texture, TextureInfo } from "@gltf-transform/core";
import { KHRLightsPunctual, type Light } from "@gltf-transform/extensions";
import { validateWeights, type VertexInfluence } from "@aevum/rigging";
import type { z } from "zod";
import { parse3DAsset, type Inspect3DAssetInput, type Parsed3DAsset } from "./inspection.js";
import { deepFreeze, deterministicEntityId, threeFingerprint } from "./stable.js";
import {
  THREE_FOUNDATION_VERSION,
  ThreeImportProposalSchema,
  ThreeImportProposalValidationSchema,
  type ThreeDiagnostic,
  type ThreeImportProposal,
  type ThreeImportProposalValidation,
} from "./types.js";

type ImportProvenance = z.infer<typeof ImportProvenanceSchema>;

export interface Create3DImportProposalInput extends Inspect3DAssetInput {
  readonly canonicalDocument: CanonicalDesignDocument;
}

const primitiveModes = [
  "POINTS",
  "LINES",
  "LINE_LOOP",
  "LINE_STRIP",
  "TRIANGLES",
  "TRIANGLE_STRIP",
  "TRIANGLE_FAN",
] as const;

function provenance(
  parsed: Parsed3DAsset,
  indexes: Omit<ImportProvenance, "sourceAssetId" | "sourceAssetHash">,
): ImportProvenance {
  return {
    sourceAssetId: parsed.input.asset.id,
    sourceAssetHash: parsed.input.asset.hash,
    ...indexes,
  };
}

function transformFor(node: Node, world = false) {
  const translation = world ? node.getWorldTranslation() : node.getTranslation();
  const rotation = world ? node.getWorldRotation() : node.getRotation();
  const scale = world ? node.getWorldScale() : node.getScale();
  return {
    ...createTransform(),
    position: { x: translation[0], y: translation[1], z: translation[2] },
    quaternion: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
    scale: { x: scale[0], y: scale[1], z: scale[2] },
  };
}

/**
 * glTF has no native "bone length" concept — only Blender's own bone-chain representation does,
 * and that information does not survive a glTF round trip. This is an explicit, disclosed
 * approximation (Phase 19B §11): the distance to the nearest child joint, or a small fixed default
 * for a leaf joint. It is cosmetic/editing-aid data only, never consumed for skinning math (which
 * uses the joint's real local transform and inverse bind matrix instead).
 */
function jointLength(sourceNode: Node, jointNodeSet: ReadonlySet<Node>): number {
  const childJoints = sourceNode.listChildren().filter((child) => jointNodeSet.has(child));
  if (childJoints.length === 0) return 0.05;
  const origin = sourceNode.getWorldTranslation();
  const distances = childJoints.map((child) => {
    const target = child.getWorldTranslation();
    return Math.hypot(target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]);
  });
  const farthest = Math.max(...distances);
  return farthest > 1e-6 ? farthest : 0.05;
}

/** The inverse bind matrix for a joint, read verbatim from whichever skin lists it (Phase 19B §8).
 * Stored for potential future GPU-skinning use; not interpreted or consumed by this import path. */
function inverseBindMatrixFor(sourceNode: Node, skins: readonly Skin[]): number[] | undefined {
  for (const skin of skins) {
    const jointIndex = skin.listJoints().indexOf(sourceNode);
    if (jointIndex === -1) continue;
    const accessor = skin.getInverseBindMatrices();
    if (!accessor) return undefined;
    const target = new Array(16).fill(0);
    accessor.getElement(jointIndex, target);
    return target;
  }
  return undefined;
}

/** The joint whose parent is not itself a joint in this skin — the real root of the bone chain.
 * `Skin.getSkeleton()` (when set) names the joints' common ancestor, which is typically the
 * armature's own object node, not a joint itself, so it cannot be used directly here. */
function rootJointFor(skin: Skin, jointNodeSet: ReadonlySet<Node>): Node | undefined {
  return skin.listJoints().find((joint) => {
    const parent = joint.getParentNode();
    return parent === null || !jointNodeSet.has(parent);
  });
}

function nodeBase(
  id: string,
  name: string,
  parentId: string | null,
  source: ImportProvenance,
  canonicalIdentity?: string,
) {
  return {
    id,
    name,
    parentId,
    childIds: [] as string[],
    visible: true,
    locked: false,
    transform: createTransform(),
    sourceLinks: [],
    metadata: {
      tags: ["gltf-import"],
      customData: canonicalIdentity ? { "aevum.entity_id": canonicalIdentity } : {},
    },
    importProvenance: source,
  };
}

function textureAsset(parsed: Parsed3DAsset, texture: Texture, textureIndex: number): AssetRecord | undefined {
  const image = texture.getImage();
  if (!image) return undefined;
  const hash = computeSha256(image);
  const dimensions = texture.getSize();
  return AssetSchema.parse({
    id: assetIdFromHash(hash),
    type: "IMAGE",
    name: texture.getName() || texture.getURI() || `Embedded texture ${textureIndex}`,
    hash,
    source: {
      kind: "DERIVED",
      uri: `embedded://${parsed.input.asset.id}/texture/${textureIndex}`,
      originalAssetId: parsed.input.asset.id,
    },
    mimeType: texture.getMimeType() || "application/octet-stream",
    byteSize: image.byteLength,
    ...(dimensions ? { dimensions: { width: dimensions[0], height: dimensions[1] } } : {}),
    metadata: {
      "aevum.3dTexture": {
        version: THREE_FOUNDATION_VERSION,
        sourceAssetId: parsed.input.asset.id,
        sourceAssetHash: parsed.input.asset.hash,
        normalizedTextureIndex: textureIndex,
      },
    },
  });
}

function textureBinding(
  channel: "BASE_COLOR" | "ROUGHNESS" | "METALLIC" | "NORMAL" | "AO" | "EMISSION",
  texture: Texture | null,
  info: TextureInfo | null,
  textureIndexes: ReadonlyMap<Texture, number>,
  textureAssetIds: ReadonlyMap<Texture, string>,
  extra: { readonly scale?: number; readonly strength?: number } = {},
) {
  if (!texture) return undefined;
  const assetId = textureAssetIds.get(texture);
  if (!assetId) return undefined;
  const sourceTextureIndex = textureIndexes.get(texture);
  return {
    channel,
    assetId,
    ...(info ? { texCoord: info.getTexCoord() } : {}),
    ...(sourceTextureIndex === undefined ? {} : { sourceTextureIndex, sourceImageIndex: sourceTextureIndex }),
    ...extra,
    ...(info
      ? {
          sampler: {
            ...(info.getMagFilter() === null ? {} : { magFilter: String(info.getMagFilter()) }),
            ...(info.getMinFilter() === null ? {} : { minFilter: String(info.getMinFilter()) }),
            wrapS: String(info.getWrapS()),
            wrapT: String(info.getWrapT()),
          },
        }
      : {}),
  };
}

function materialRecord(
  parsed: Parsed3DAsset,
  material: Material,
  materialIndex: number,
  textureIndexes: ReadonlyMap<Texture, number>,
  textureAssetIds: ReadonlyMap<Texture, string>,
) {
  const base = material.getBaseColorFactor();
  const emissive = material.getEmissiveFactor();
  const bindings = [
    textureBinding(
      "BASE_COLOR",
      material.getBaseColorTexture(),
      material.getBaseColorTextureInfo(),
      textureIndexes,
      textureAssetIds,
    ),
    textureBinding(
      "ROUGHNESS",
      material.getMetallicRoughnessTexture(),
      material.getMetallicRoughnessTextureInfo(),
      textureIndexes,
      textureAssetIds,
    ),
    textureBinding(
      "METALLIC",
      material.getMetallicRoughnessTexture(),
      material.getMetallicRoughnessTextureInfo(),
      textureIndexes,
      textureAssetIds,
    ),
    textureBinding(
      "NORMAL",
      material.getNormalTexture(),
      material.getNormalTextureInfo(),
      textureIndexes,
      textureAssetIds,
      { scale: material.getNormalScale() },
    ),
    textureBinding(
      "AO",
      material.getOcclusionTexture(),
      material.getOcclusionTextureInfo(),
      textureIndexes,
      textureAssetIds,
      { strength: material.getOcclusionStrength() },
    ),
    textureBinding(
      "EMISSION",
      material.getEmissiveTexture(),
      material.getEmissiveTextureInfo(),
      textureIndexes,
      textureAssetIds,
    ),
  ].filter((value) => value !== undefined);
  return MaterialSchema.parse({
    id: deterministicEntityId("material", { asset: parsed.input.asset.hash, materialIndex }),
    name: material.getName() || `Material ${materialIndex}`,
    type: "PBR",
    pbr: {
      baseColor: { r: base[0], g: base[1], b: base[2], a: base[3], colorSpace: "LINEAR_SRGB" },
      roughness: material.getRoughnessFactor(),
      metalness: material.getMetallicFactor(),
      opacity: material.getAlpha(),
      emissiveColor: { r: emissive[0], g: emissive[1], b: emissive[2], a: 1, colorSpace: "LINEAR_SRGB" },
      normalScale: material.getNormalScale(),
      occlusionStrength: material.getOcclusionStrength(),
      alphaMode: material.getAlphaMode(),
      alphaCutoff: material.getAlphaCutoff(),
      doubleSided: material.getDoubleSided(),
    },
    textures: bindings,
    metadata: {},
    importProvenance: provenance(parsed, { sourceMaterialIndex: materialIndex }),
  });
}

function boundsFromPosition(primitive: Primitive) {
  const position = primitive.getAttribute("POSITION");
  if (!position) return undefined;
  const min = position.getMin([]);
  const max = position.getMax([]);
  const size = [0, 1, 2].map((index) => (max[index] ?? 0) - (min[index] ?? 0));
  const center = [0, 1, 2].map((index) => ((max[index] ?? 0) + (min[index] ?? 0)) / 2);
  return {
    min: { x: min[0] ?? 0, y: min[1] ?? 0, z: min[2] ?? 0 },
    max: { x: max[0] ?? 0, y: max[1] ?? 0, z: max[2] ?? 0 },
    center: { x: center[0] ?? 0, y: center[1] ?? 0, z: center[2] ?? 0 },
    size: { x: size[0] ?? 0, y: size[1] ?? 0, z: size[2] ?? 0 },
    radius: Math.hypot(size[0] ?? 0, size[1] ?? 0, size[2] ?? 0) / 2,
  };
}

function triangleCount(mode: number, count: number): number {
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

function geometry(parsed: Parsed3DAsset, primitive: Primitive, meshIndex: number, primitiveIndex: number) {
  const position = primitive.getAttribute("POSITION");
  const vertexCount = position?.getCount() ?? 0;
  const indexCount = primitive.getIndices()?.getCount() ?? vertexCount;
  return {
    sourceAssetId: parsed.input.asset.id,
    sourceMeshIndex: meshIndex,
    sourcePrimitiveIndex: primitiveIndex,
    primitiveMode: primitiveModes[primitive.getMode()] ?? "TRIANGLES",
    vertexCount,
    indexCount,
    triangleCount: triangleCount(primitive.getMode(), indexCount),
    attributes: primitive.listSemantics().map((semantic) => {
      const accessor = primitive.getAttribute(semantic);
      if (!accessor) throw new Error(`Missing accessor for ${semantic}.`);
      return {
        semantic,
        count: accessor.getCount(),
        componentType: String(accessor.getComponentType()),
        elementType: accessor.getType(),
        normalized: accessor.getNormalized(),
        min: accessor.getMin([]),
        max: accessor.getMax([]),
      };
    }),
    ...(position ? { bounds: boundsFromPosition(primitive) } : {}),
    normalAvailable: Boolean(primitive.getAttribute("NORMAL")),
    tangentAvailable: Boolean(primitive.getAttribute("TANGENT")),
    texCoordSets: primitive.listSemantics().filter((semantic) => semantic.startsWith("TEXCOORD_")).length,
    skinAttributes: Boolean(primitive.getAttribute("JOINTS_0") && primitive.getAttribute("WEIGHTS_0")),
    morphTargetCount: primitive.listTargets().length,
    drawCallEstimate: 1,
  };
}

interface SkinWeightStats {
  readonly vertexCount: number;
  readonly unweightedVertexCount: number;
  readonly normalized: boolean;
  readonly maxInfluencesPerVertex: number;
  readonly diagnostics: readonly ThreeDiagnostic[];
}

/** Real per-vertex weight inspection (Phase 19B §9/§10) across every JOINTS_n/WEIGHTS_n accessor
 * set actually present on the primitive, aggregated across a multi-primitive mesh. Reports what
 * the import found; does not repair or normalize it. */
function primitiveWeightStats(primitive: Primitive, jointCount: number): SkinWeightStats | undefined {
  const sets: Array<{
    joints: import("@gltf-transform/core").Accessor;
    weights: import("@gltf-transform/core").Accessor;
  }> = [];
  const malformedSets: number[] = [];
  for (let set = 0; set < 8; set += 1) {
    const joints = primitive.getAttribute(`JOINTS_${set}`);
    const weights = primitive.getAttribute(`WEIGHTS_${set}`);
    if (!joints && !weights) break;
    if (!joints || !weights) {
      malformedSets.push(set);
      continue;
    }
    sets.push({ joints, weights });
  }
  if (sets.length === 0) return undefined;
  const vertexCount = sets[0]?.weights.getCount() ?? 0;
  const weightTarget: number[] = [];
  const jointTarget: number[] = [];
  const influences: VertexInfluence[][] = [];
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const vertexInfluences: VertexInfluence[] = [];
    for (const set of sets) {
      const weights = set.weights.getElement(vertex, weightTarget);
      const joints = set.joints.getElement(vertex, jointTarget);
      for (let component = 0; component < weights.length; component += 1) {
        const weight = weights[component] ?? Number.NaN;
        if (weight !== 0 || !Number.isFinite(weight)) {
          vertexInfluences.push({ jointIndex: joints[component] ?? -1, weight });
        }
      }
    }
    influences.push(vertexInfluences);
  }
  const report = validateWeights({ influences, jointCount, maxInfluencesPerVertex: 8 });
  const diagnostics: ThreeDiagnostic[] = report.diagnostics.map((entry) => ({
    code: "UNSUPPORTED_SKIN_FEATURE",
    severity: entry.severity === "CRITICAL" ? "BLOCKING" : entry.severity,
    message: entry.message,
    recoverable: entry.recoverable,
    details: {
      invalidVertexCount: report.invalidVertexCount,
      unweightedVertexCount: report.unweightedVertexCount,
    },
  }));
  if (malformedSets.length > 0) {
    diagnostics.push({
      code: "UNSUPPORTED_SKIN_FEATURE",
      severity: "ERROR",
      message: `Skin attributes have unmatched JOINTS/WEIGHTS sets: ${malformedSets.join(", ")}.`,
      recoverable: false,
    });
  }
  return {
    vertexCount: report.vertexCount,
    unweightedVertexCount: report.unweightedVertexCount,
    normalized: report.normalized && malformedSets.length === 0,
    maxInfluencesPerVertex: report.maxInfluencesObserved,
    diagnostics,
  };
}

export async function create3DImportProposal(input: Create3DImportProposalInput): Promise<ThreeImportProposal> {
  const parsed = await parse3DAsset(input);
  const root = parsed.document.getRoot();
  const nodeIndexes = new Map(root.listNodes().map((node, index) => [node, index]));
  const meshIndexes = new Map(root.listMeshes().map((mesh, index) => [mesh, index]));
  const cameraIndexes = new Map(root.listCameras().map((camera, index) => [camera, index]));
  const textures = root.listTextures();
  const textureIndexes = new Map(textures.map((texture, index) => [texture, index]));
  const createdAssets: AssetRecord[] = [];
  const textureAssetIds = new Map<Texture, string>();
  for (const [index, texture] of textures.entries()) {
    const generated = textureAsset(parsed, texture, index);
    if (!generated) continue;
    const existing = findAssetByHash(input.canonicalDocument.assets, generated.hash);
    textureAssetIds.set(texture, existing?.id ?? generated.id);
    if (!existing && !createdAssets.some((asset) => asset.hash === generated.hash)) createdAssets.push(generated);
  }
  const materials = root
    .listMaterials()
    .map((material, index) => materialRecord(parsed, material, index, textureIndexes, textureAssetIds));
  const materialIds = new Map(root.listMaterials().map((material, index) => [material, materials[index]?.id]));
  const nodes: DesignNode[] = [];
  const cameras: ReturnType<typeof CameraSchema.parse>[] = [];
  const lights: ReturnType<typeof LightSchema.parse>[] = [];
  const rootNodeIds: string[] = [];
  const skins = root.listSkins();
  const skinIndexes = new Map(skins.map((skin, index) => [skin, index]));
  // Phase 19B: every joint referenced by any skin becomes a canonical BONE_3D node instead of a
  // generic GROUP_3D node — determined up front since a joint can be visited as an ordinary child
  // node before its skin is discovered on the mesh node that uses it.
  const jointNodeSet = new Set<Node>(skins.flatMap((skin) => skin.listJoints()));
  const skinDiagnostics: ThreeDiagnostic[] = [];

  for (const [sceneIndex, sourceScene] of root.listScenes().entries()) {
    const sceneId = deterministicEntityId("scene", { asset: parsed.input.asset.hash, sceneIndex });
    const modelId = deterministicEntityId("model", { asset: parsed.input.asset.hash, sceneIndex });
    const sceneProvenance = provenance(parsed, { sourceSceneIndex: sceneIndex });
    const sceneNode = DesignNodeSchema.parse({
      ...nodeBase(sceneId, sourceScene.getName() || `Scene ${sceneIndex}`, null, sceneProvenance),
      type: "SCENE_3D",
      childIds: [modelId],
      lightIds: [],
      coordinateSystem: CANONICAL_3D_COORDINATE_SYSTEM,
      sourceAssetId: parsed.input.asset.id,
      qualityProfile: input.canonicalDocument.settings.qualityMode,
    });
    const importedMeshIds: string[] = [];
    const modelNode = DesignNodeSchema.parse({
      ...nodeBase(modelId, `${sourceScene.getName() || `Scene ${sceneIndex}`} model`, sceneId, sceneProvenance),
      type: "MODEL_3D",
      sourceAssetId: parsed.input.asset.id,
      sourceSceneIndex: sceneIndex,
      meshIds: importedMeshIds,
      realWorldScale: { value: 1, unit: "M" },
    });
    const canonicalBySource = new Map<Node, string>();
    const meshNodeSkins = new Map<Node, Skin>();
    const meshNodeMeshIds = new Map<Node, string[]>();
    const sceneRigIds: string[] = [];

    const visit = (sourceNode: Node, parentId: string): string => {
      const sourceNodeIndex = nodeIndexes.get(sourceNode);
      if (sourceNodeIndex === undefined) throw new Error("glTF node is missing from the root index.");
      const groupId = deterministicEntityId("group", { asset: parsed.input.asset.hash, sceneIndex, sourceNodeIndex });
      const extrasIdentity = sourceNode.getExtras()["aevum.entity_id"];
      const parsedIdentity = EntityIdSchema.safeParse(extrasIdentity);
      const canonicalIdentity = parsedIdentity.success ? parsedIdentity.data : undefined;
      canonicalBySource.set(sourceNode, groupId);
      const childIds: string[] = [];
      const nodeMeshIds: string[] = [];
      const mesh = sourceNode.getMesh();
      const sourceMeshIndex = mesh ? meshIndexes.get(mesh) : undefined;
      const skin = sourceNode.getSkin();
      if (mesh && sourceMeshIndex !== undefined) {
        for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
          const meshId = deterministicEntityId("mesh", {
            asset: parsed.input.asset.hash,
            sceneIndex,
            sourceNodeIndex,
            sourceMeshIndex,
            primitiveIndex,
          });
          const material = primitive.getMaterial();
          const materialId = material ? materialIds.get(material) : undefined;
          const geometryRecord = geometry(parsed, primitive, sourceMeshIndex, primitiveIndex);
          nodes.push(
            DesignNodeSchema.parse({
              ...nodeBase(
                meshId,
                `${mesh.getName() || sourceNode.getName() || `Mesh ${sourceMeshIndex}`} primitive ${primitiveIndex}`,
                groupId,
                provenance(parsed, {
                  sourceSceneIndex: sceneIndex,
                  sourceNodeIndex,
                  sourceMeshIndex,
                  sourcePrimitiveIndex: primitiveIndex,
                }),
              ),
              type: "MESH_3D",
              geometryAssetId: parsed.input.asset.id,
              geometry: geometryRecord,
              materialIds: materialId ? [materialId] : [],
              topology: {
                vertices: geometryRecord.vertexCount,
                faces: geometryRecord.triangleCount,
                triangles: geometryRecord.triangleCount,
                manifold: null,
              },
              castShadow: true,
              receiveShadow: true,
            }),
          );
          childIds.push(meshId);
          importedMeshIds.push(meshId);
          nodeMeshIds.push(meshId);
        }
        if (skin) meshNodeSkins.set(sourceNode, skin);
        if (nodeMeshIds.length > 0) meshNodeMeshIds.set(sourceNode, nodeMeshIds);
      }
      for (const child of sourceNode.listChildren()) childIds.push(visit(child, groupId));
      const camera = sourceNode.getCamera();
      if (camera) {
        const sourceCameraIndex = cameraIndexes.get(camera) ?? 0;
        const cameraIdentity = EntityIdSchema.safeParse(camera.getExtras()["aevum.entity_id"]);
        const cameraId = cameraIdentity.success
          ? cameraIdentity.data
          : deterministicEntityId("camera", {
              asset: parsed.input.asset.hash,
              sceneIndex,
              sourceNodeIndex,
              sourceCameraIndex,
            });
        const cameraTransform = transformFor(sourceNode, true);
        cameras.push(
          CameraSchema.parse({
            id: cameraId,
            name: camera.getName() || sourceNode.getName() || `Camera ${sourceCameraIndex}`,
            projection: camera.getType() === "orthographic" ? "ORTHOGRAPHIC" : "PERSPECTIVE",
            transform: cameraTransform,
            ...(camera.getType() === "perspective"
              ? {
                  verticalFieldOfView: camera.getYFov(),
                  ...(camera.getAspectRatio() === null ? {} : { aspectRatio: camera.getAspectRatio() }),
                  focalLength: 24 / (2 * Math.tan(camera.getYFov() / 2)),
                }
              : {
                  orthographicSize: camera.getYMag() * 2,
                  orthographicBounds: {
                    left: -camera.getXMag(),
                    right: camera.getXMag(),
                    top: camera.getYMag(),
                    bottom: -camera.getYMag(),
                  },
                }),
            nearClip: camera.getZNear(),
            farClip: camera.getZFar() || 1_000_000,
            depthOfField: { enabled: false, aperture: 2.8, focusDistance: 0, bladeCount: 6 },
            importProvenance: provenance(parsed, { sourceSceneIndex: sceneIndex, sourceNodeIndex, sourceCameraIndex }),
          }),
        );
        if (!(sceneNode as Extract<DesignNode, { type: "SCENE_3D" }>).activeCameraId) {
          (sceneNode as Extract<DesignNode, { type: "SCENE_3D" }>).activeCameraId = cameraId;
        }
      }
      const light = sourceNode.getExtension<Light>(KHRLightsPunctual.EXTENSION_NAME);
      if (light) {
        const lightExtension = parsed.json.nodes?.[sourceNodeIndex]?.extensions?.[KHRLightsPunctual.EXTENSION_NAME] as
          | { light?: unknown }
          | undefined;
        const parsedLightIndex = lightExtension?.light;
        const sourceLightIndex =
          typeof parsedLightIndex === "number" && Number.isInteger(parsedLightIndex) ? parsedLightIndex : lights.length;
        const lightId = deterministicEntityId("light", {
          asset: parsed.input.asset.hash,
          sceneIndex,
          sourceNodeIndex,
          sourceLightIndex,
        });
        const color = light.getColor();
        lights.push(
          LightSchema.parse({
            id: lightId,
            name: light.getName() || sourceNode.getName() || `Light ${sourceLightIndex}`,
            type: light.getType().toUpperCase(),
            transform: transformFor(sourceNode, true),
            color: { r: color[0], g: color[1], b: color[2], a: 1, colorSpace: "LINEAR_SRGB" },
            intensity: light.getIntensity(),
            ...(light.getRange() === null ? {} : { range: light.getRange() }),
            ...(light.getType() === "spot"
              ? { innerConeAngle: light.getInnerConeAngle(), outerConeAngle: light.getOuterConeAngle() }
              : {}),
            castShadow: false,
            importProvenance: provenance(parsed, { sourceSceneIndex: sceneIndex, sourceNodeIndex, sourceLightIndex }),
          }),
        );
        (sceneNode as Extract<DesignNode, { type: "SCENE_3D" }>).lightIds.push(lightId);
      }
      if (jointNodeSet.has(sourceNode)) {
        nodes.push(
          DesignNodeSchema.parse({
            ...nodeBase(
              groupId,
              sourceNode.getName() || `Bone ${sourceNodeIndex}`,
              parentId,
              provenance(parsed, { sourceSceneIndex: sceneIndex, sourceNodeIndex }),
              canonicalIdentity,
            ),
            type: "BONE_3D",
            childIds,
            transform: transformFor(sourceNode),
            length: jointLength(sourceNode, jointNodeSet),
            deforming: true,
            ...(inverseBindMatrixFor(sourceNode, skins)
              ? { inverseBindMatrix: inverseBindMatrixFor(sourceNode, skins) }
              : {}),
          }),
        );
      } else {
        nodes.push(
          DesignNodeSchema.parse({
            ...nodeBase(
              groupId,
              sourceNode.getName() || `Node ${sourceNodeIndex}`,
              parentId,
              provenance(parsed, { sourceSceneIndex: sceneIndex, sourceNodeIndex }),
              canonicalIdentity,
            ),
            type: "GROUP_3D",
            childIds,
            transform: transformFor(sourceNode),
          }),
        );
      }
      return groupId;
    };

    (modelNode as Extract<DesignNode, { type: "MODEL_3D" }>).childIds.push(
      ...sourceScene.listChildren().map((sourceNode) => visit(sourceNode, modelId)),
    );
    (modelNode as Extract<DesignNode, { type: "MODEL_3D" }>).meshIds.push(...importedMeshIds);

    // Phase 19B: build one RIG_3D node per skin actually used by a mesh in this scene, inserted
    // between the root bone's original glTF parent and the root bone itself (the root bone's
    // parent becomes the rig, not the armature object node it was originally parented under).
    const meshNodesBySkin = new Map<Skin, Node[]>();
    for (const [meshNode, skin] of meshNodeSkins) {
      meshNodesBySkin.set(skin, [...(meshNodesBySkin.get(skin) ?? []), meshNode]);
    }
    for (const [skin, meshNodes] of meshNodesBySkin) {
      const jointIds = skin
        .listJoints()
        .map((joint) => canonicalBySource.get(joint))
        .filter((id): id is string => id !== undefined);
      const rootJoint = rootJointFor(skin, jointNodeSet);
      const rootBoneId = rootJoint ? canonicalBySource.get(rootJoint) : undefined;
      if (jointIds.length === 0 || !rootBoneId) continue;
      const rootBoneNode = nodes.find((node) => node.id === rootBoneId);
      if (!rootBoneNode) continue;
      const originalParentId = rootBoneNode.parentId;
      const sourceSkinIndex = skinIndexes.get(skin) ?? 0;
      const rootNodeIndex = rootJoint ? nodeIndexes.get(rootJoint) : undefined;
      const rigId = deterministicEntityId("rig", { asset: parsed.input.asset.hash, sceneIndex, sourceSkinIndex });
      rootBoneNode.parentId = rigId;
      const originalParent =
        originalParentId === modelNode.id ? modelNode : nodes.find((node) => node.id === originalParentId);
      if (originalParent) {
        const index = originalParent.childIds.indexOf(rootBoneId);
        if (index !== -1) originalParent.childIds.splice(index, 1, rigId);
      }
      nodes.push(
        DesignNodeSchema.parse({
          ...nodeBase(
            rigId,
            skin.getName() || `Rig ${skinIndexes.get(skin) ?? 0}`,
            originalParentId,
            provenance(parsed, { sourceSceneIndex: sceneIndex, sourceNodeIndex: rootNodeIndex }),
          ),
          type: "RIG_3D",
          childIds: [rootBoneId],
          rootBoneId,
          boneIds: jointIds,
          ikChains: [],
          constraints: [],
          rigMethod: "IMPORTED",
        }),
      );
      sceneRigIds.push(rigId);

      for (const meshNode of meshNodes) {
        const meshIds = meshNodeMeshIds.get(meshNode) ?? [];
        const mesh = meshNode.getMesh();
        const primitiveWeightReports = mesh
          ? mesh.listPrimitives().map((primitive) => primitiveWeightStats(primitive, jointIds.length))
          : [];
        for (const [primitiveIndex, meshId] of meshIds.entries()) {
          const weightStats = primitiveWeightReports[primitiveIndex];
          skinDiagnostics.push(...(weightStats?.diagnostics ?? []));
          const meshDesignNode = nodes.find((node) => node.id === meshId);
          if (meshDesignNode?.type !== "MESH_3D") continue;
          meshDesignNode.skinBinding = {
            rigId,
            jointIds,
            maxInfluencesPerVertex: Math.max(1, Math.min(8, weightStats?.maxInfluencesPerVertex ?? 4)),
            weightMethod: "IMPORTED",
            normalized: weightStats?.normalized ?? false,
            vertexCount: weightStats?.vertexCount ?? meshDesignNode.geometry.vertexCount,
            unweightedVertexCount: weightStats?.unweightedVertexCount ?? 0,
          };
        }
      }
    }
    if (sceneRigIds.length === 1) (modelNode as Extract<DesignNode, { type: "MODEL_3D" }>).rigId = sceneRigIds[0];

    nodes.push(modelNode, sceneNode);
    rootNodeIds.push(sceneId);
  }
  const diagnostics: ThreeDiagnostic[] = [...parsed.inspection.diagnostics, ...skinDiagnostics];
  const content = {
    version: THREE_FOUNDATION_VERSION,
    sourceAssetId: parsed.input.asset.id,
    sourceAssetHash: parsed.input.asset.hash,
    inspection: parsed.inspection,
    rootNodeIds,
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    assets: createdAssets.sort((left, right) => left.id.localeCompare(right.id)),
    materials: materials.sort((left, right) => left.id.localeCompare(right.id)),
    cameras: cameras.sort((left, right) => left.id.localeCompare(right.id)),
    lights: lights.sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics,
  };
  return deepFreeze(
    ThreeImportProposalSchema.parse({
      ...content,
      id: `three-proposal:${threeFingerprint(content).slice(7, 39)}`,
      fingerprint: threeFingerprint(content),
    }),
  );
}

export function validate3DImportProposal(
  proposal: ThreeImportProposal,
  canonicalDocument?: CanonicalDesignDocument,
): ThreeImportProposalValidation {
  const diagnostics: ThreeDiagnostic[] = [...proposal.diagnostics];
  const ids = [
    ...proposal.nodes.map((value) => value.id),
    ...proposal.assets.map((value) => value.id),
    ...proposal.materials.map((value) => value.id),
    ...proposal.cameras.map((value) => value.id),
    ...proposal.lights.map((value) => value.id),
  ];
  if (new Set(ids).size !== ids.length) {
    diagnostics.push({
      code: "IMPORT_PROPOSAL_INVALID",
      severity: "BLOCKING",
      message: "The import proposal contains duplicate canonical IDs.",
      recoverable: false,
    });
  }
  if (canonicalDocument) {
    const existing = ids.filter(
      (id) =>
        canonicalDocument.nodes[id] ||
        canonicalDocument.assets[id] ||
        canonicalDocument.materials[id] ||
        canonicalDocument.cameras[id] ||
        canonicalDocument.lights[id],
    );
    if (existing.length > 0) {
      diagnostics.push({
        code: "IMPORT_PROPOSAL_INVALID",
        severity: "BLOCKING",
        message: "The import proposal would overwrite existing canonical entities.",
        recoverable: false,
        details: { duplicateCount: existing.length },
      });
    }
  }
  return deepFreeze(
    ThreeImportProposalValidationSchema.parse({
      valid: !diagnostics.some((issue) => issue.severity === "BLOCKING" || issue.severity === "ERROR"),
      diagnostics,
    }),
  );
}
