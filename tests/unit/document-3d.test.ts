import {
  CANONICAL_3D_COORDINATE_SYSTEM,
  createAsset,
  createEntityId,
  createTransform,
  fixtures,
  validateDocument,
  type DesignNode,
} from "../../packages/document-model/src/index.js";
import { describe, expect, it } from "vitest";

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

describe("2D and 3D coexistence", () => {
  it("validates one canonical document containing both systems", () => {
    const document = fixtures.landingPage();
    const geometry = createAsset({
      type: "GLB",
      name: "Geometry",
      hash: `sha256:${"b".repeat(64)}`,
      uri: "assets/mesh.glb",
      mimeType: "model/gltf-binary",
    });
    document.assets[geometry.id] = geometry;

    const materialId = createEntityId("material");
    document.materials[materialId] = {
      id: materialId,
      name: "Studio material",
      type: "PBR",
      pbr: {
        baseColor: { r: 0.8, g: 0.2, b: 0.1, a: 1, colorSpace: "SRGB" },
        roughness: 0.35,
        metalness: 0.1,
        opacity: 1,
      },
      textures: [],
      metadata: {},
    };
    const cameraId = createEntityId("camera");
    document.cameras[cameraId] = {
      id: cameraId,
      name: "Hero camera",
      projection: "PERSPECTIVE",
      transform: createTransform(),
      focalLength: 50,
      nearClip: 0.1,
      farClip: 1000,
      depthOfField: { enabled: true, aperture: 2.8, focusDistance: 5 },
    };
    const lightId = createEntityId("light");
    document.lights[lightId] = {
      id: lightId,
      name: "Key light",
      type: "DIRECTIONAL",
      transform: createTransform(),
      color: { r: 1, g: 0.95, b: 0.9, a: 1, colorSpace: "LINEAR_SRGB" },
      intensity: 2,
    };
    const sceneId = createEntityId("scene");
    const modelId = createEntityId("model");
    const meshId = createEntityId("mesh");
    const scene: DesignNode = {
      id: sceneId,
      type: "SCENE_3D",
      name: "Product scene",
      parentId: null,
      childIds: [modelId],
      visible: true,
      locked: false,
      transform: createTransform(),
      sourceLinks: [],
      metadata: { tags: [], customData: {} },
      activeCameraId: cameraId,
      lightIds: [lightId],
      coordinateSystem: CANONICAL_3D_COORDINATE_SYSTEM,
    };
    const model: DesignNode = {
      id: modelId,
      type: "MODEL_3D",
      name: "Product",
      parentId: sceneId,
      childIds: [meshId],
      visible: true,
      locked: false,
      transform: createTransform(),
      sourceLinks: [],
      metadata: { tags: [], customData: {} },
      sourceAssetId: geometry.id,
      meshIds: [meshId],
      realWorldScale: { value: 1, unit: "M" },
    };
    const mesh: DesignNode = {
      id: meshId,
      type: "MESH_3D",
      name: "Body",
      parentId: modelId,
      childIds: [],
      visible: true,
      locked: false,
      transform: createTransform(),
      sourceLinks: [],
      metadata: { tags: [], customData: {} },
      geometryAssetId: geometry.id,
      geometry: {
        sourceAssetId: geometry.id,
        sourceMeshIndex: 0,
        sourcePrimitiveIndex: 0,
        primitiveMode: "TRIANGLES",
        vertexCount: 128,
        indexCount: 756,
        triangleCount: 252,
        attributes: [],
        normalAvailable: false,
        tangentAvailable: false,
        texCoordSets: 0,
        skinAttributes: false,
        morphTargetCount: 0,
        drawCallEstimate: 1,
      },
      materialIds: [materialId],
      topology: { vertices: 128, faces: 126, triangles: 252, manifold: true },
      castShadow: true,
      receiveShadow: true,
    };
    document.nodes[sceneId] = scene;
    document.nodes[modelId] = model;
    document.nodes[meshId] = mesh;
    document.rootNodeIds.push(sceneId);

    expect(validateDocument(document)).toEqual(expect.objectContaining({ success: true, issues: [] }));
  });

  it("validates a large hierarchy without storing runtime instances", () => {
    const document = fixtures.landingPage();
    const pageId = requireValue(document.pages[0], "Page fixture is empty.");
    const page = requireValue(document.nodes[pageId], "Page node is missing.");
    for (let index = 0; index < 500; index += 1) {
      const id = createEntityId("group");
      page.childIds.push(id);
      document.nodes[id] = {
        id,
        type: "GROUP",
        name: `Group ${index}`,
        parentId: page.id,
        childIds: [],
        visible: true,
        locked: false,
        transform: createTransform(),
        sourceLinks: [],
        metadata: { tags: [], customData: {} },
        isolation: false,
        passThroughBlend: true,
      };
    }

    const result = validateDocument(document);
    expect(result.success).toBe(true);
    expect(JSON.stringify(document)).not.toContain("runtimeInstance");
  });
});
