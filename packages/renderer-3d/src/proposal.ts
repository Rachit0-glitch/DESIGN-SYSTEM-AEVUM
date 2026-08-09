import { assetIdFromHash, computeSha256, findAssetByHash } from "@aevum/assets";
import {
  AssetSchema,
  CANONICAL_3D_COORDINATE_SYSTEM,
  CameraSchema,
  DesignNodeSchema,
  LightSchema,
  MaterialSchema,
  createTransform,
  type AssetRecord,
  type CanonicalDesignDocument,
  type DesignNode,
  type ImportProvenanceSchema,
} from "@aevum/document-model";
import type { Material, Node, Primitive, Texture, TextureInfo } from "@gltf-transform/core";
import { KHRLightsPunctual, type Light } from "@gltf-transform/extensions";
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

function nodeBase(id: string, name: string, parentId: string | null, source: ImportProvenance) {
  return {
    id,
    name,
    parentId,
    childIds: [] as string[],
    visible: true,
    locked: false,
    transform: createTransform(),
    sourceLinks: [],
    metadata: { tags: ["gltf-import"], customData: {} },
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

    const visit = (sourceNode: Node, parentId: string): string => {
      const sourceNodeIndex = nodeIndexes.get(sourceNode);
      if (sourceNodeIndex === undefined) throw new Error("glTF node is missing from the root index.");
      const groupId = deterministicEntityId("group", { asset: parsed.input.asset.hash, sceneIndex, sourceNodeIndex });
      canonicalBySource.set(sourceNode, groupId);
      const childIds: string[] = [];
      const mesh = sourceNode.getMesh();
      const sourceMeshIndex = mesh ? meshIndexes.get(mesh) : undefined;
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
        }
      }
      for (const child of sourceNode.listChildren()) childIds.push(visit(child, groupId));
      const camera = sourceNode.getCamera();
      if (camera) {
        const sourceCameraIndex = cameraIndexes.get(camera) ?? 0;
        const cameraId = deterministicEntityId("camera", {
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
                  focalLength: 0.5 / Math.tan(camera.getYFov() / 2),
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
            depthOfField: { enabled: false, aperture: 2.8, focusDistance: 0 },
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
      nodes.push(
        DesignNodeSchema.parse({
          ...nodeBase(
            groupId,
            sourceNode.getName() || `Node ${sourceNodeIndex}`,
            parentId,
            provenance(parsed, { sourceSceneIndex: sceneIndex, sourceNodeIndex }),
          ),
          type: "GROUP_3D",
          childIds,
          transform: transformFor(sourceNode),
        }),
      );
      return groupId;
    };

    (modelNode as Extract<DesignNode, { type: "MODEL_3D" }>).childIds.push(
      ...sourceScene.listChildren().map((sourceNode) => visit(sourceNode, modelId)),
    );
    (modelNode as Extract<DesignNode, { type: "MODEL_3D" }>).meshIds.push(...importedMeshIds);
    void canonicalBySource;
    nodes.push(modelNode, sceneNode);
    rootNodeIds.push(sceneId);
  }
  const diagnostics: ThreeDiagnostic[] = [...parsed.inspection.diagnostics];
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
