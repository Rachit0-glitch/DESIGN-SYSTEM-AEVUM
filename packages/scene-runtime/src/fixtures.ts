import {
  CANONICAL_3D_COORDINATE_SYSTEM,
  createAsset,
  createEntityId,
  createFrame,
  createTransform,
  fixtures,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import type { RuntimeViewport } from "./types.js";

export function createRuntimeViewport(document: CanonicalDesignDocument, breakpointId?: string): RuntimeViewport {
  const canonical = document.settings.viewports[document.settings.defaultViewportId];
  if (!canonical) throw new Error("The fixture default viewport is missing.");
  return {
    id: canonical.id,
    width: canonical.width,
    height: canonical.height,
    deviceScaleFactor: canonical.deviceScaleFactor,
    orientation: canonical.orientation,
    category: canonical.category,
    reducedMotion: document.settings.reducedMotion !== "PRESERVE",
    ...(breakpointId ? { breakpointId } : {}),
  };
}

export function createNestedSceneFixture(): CanonicalDesignDocument {
  const document = fixtures.landingPage();
  const pageId = document.rootNodeIds[0];
  const page = pageId ? document.nodes[pageId] : undefined;
  if (!page) throw new Error("Landing page fixture root is missing.");
  const nested = createFrame(page.id, "Nested frame");
  nested.transform.position = { x: 10, y: 20, z: 3 };
  page.childIds.push(nested.id);
  document.nodes[nested.id] = nested;
  return document;
}

export function createResponsiveSceneFixture(): CanonicalDesignDocument {
  const document = createNestedSceneFixture();
  const frame = Object.values(document.nodes).find((node) => node.name === "Nested frame");
  if (!frame) throw new Error("Nested frame is missing.");
  frame.responsive = {
    breakpoints: {
      MOBILE: { visible: false, transform: { position: { x: 5, y: 6, z: 0 } } },
      compact: { visible: true, transform: { position: { x: 7, y: 8, z: 0 } } },
    },
    orientations: { PORTRAIT: { transform: { position: { x: 9, y: 10, z: 0 } } } },
  };
  return document;
}

export function createComponentSceneFixture(): CanonicalDesignDocument {
  const document = fixtures.landingPage();
  const componentRoot = createFrame("component-source", "Button definition");
  componentRoot.parentId = null;
  const componentId = createEntityId("component");
  document.nodes[componentRoot.id] = componentRoot;
  document.components[componentId] = {
    id: componentId,
    name: "Button",
    rootNodeId: componentRoot.id,
    variants: [],
    slots: [],
    defaultOverrides: {},
  };
  const rootId = document.rootNodeIds[0];
  const root = rootId ? document.nodes[rootId] : undefined;
  if (!root) throw new Error("Landing page fixture root is missing.");
  const instanceId = createEntityId("node");
  const instance: DesignNode = {
    id: instanceId,
    type: "COMPONENT_INSTANCE",
    name: "Button instance",
    parentId: root.id,
    childIds: [],
    visible: true,
    locked: false,
    transform: createTransform(),
    sourceLinks: [],
    metadata: { tags: [], customData: {} },
    componentId,
    overrides: { label: "Continue" },
  };
  root.childIds.push(instance.id);
  document.nodes[instance.id] = instance;
  return document;
}

export function createMixedSceneFixture(): CanonicalDesignDocument {
  const document = fixtures.landingPage();
  const geometry = createAsset({
    type: "GLB",
    name: "Fixture geometry",
    hash: `sha256:${"c".repeat(64)}`,
    uri: "assets/fixture.glb",
    mimeType: "model/gltf-binary",
  });
  document.assets[geometry.id] = geometry;
  const materialId = createEntityId("material");
  document.materials[materialId] = {
    id: materialId,
    name: "Fixture material",
    type: "PBR",
    pbr: {
      baseColor: { r: 1, g: 1, b: 1, a: 1, colorSpace: "SRGB" },
      roughness: 0.5,
      metalness: 0,
      opacity: 1,
    },
    textures: [],
    metadata: {},
  };
  const cameraId = createEntityId("camera");
  document.cameras[cameraId] = {
    id: cameraId,
    name: "Fixture camera",
    projection: "PERSPECTIVE",
    transform: createTransform(),
    focalLength: 50,
    nearClip: 0.1,
    farClip: 1_000,
    depthOfField: { enabled: false, aperture: 2.8, focusDistance: 5 },
  };
  const sceneId = createEntityId("scene");
  const meshId = createEntityId("mesh");
  document.nodes[sceneId] = {
    id: sceneId,
    type: "SCENE_3D",
    name: "Fixture scene",
    parentId: null,
    childIds: [meshId],
    visible: true,
    locked: false,
    transform: createTransform(),
    sourceLinks: [],
    metadata: { tags: [], customData: {} },
    activeCameraId: cameraId,
    lightIds: [],
    coordinateSystem: CANONICAL_3D_COORDINATE_SYSTEM,
  };
  document.nodes[meshId] = {
    id: meshId,
    type: "MESH_3D",
    name: "Fixture mesh",
    parentId: sceneId,
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
      vertexCount: 8,
      indexCount: 36,
      triangleCount: 12,
      attributes: [],
      normalAvailable: false,
      tangentAvailable: false,
      texCoordSets: 0,
      skinAttributes: false,
      morphTargetCount: 0,
      drawCallEstimate: 1,
    },
    materialIds: [materialId],
    topology: { vertices: 8, faces: 6, triangles: 12, manifold: true },
    castShadow: true,
    receiveShadow: true,
  };
  document.rootNodeIds.push(sceneId);
  return document;
}

export const sceneRuntimeFixtures = Object.freeze({
  nested: createNestedSceneFixture,
  responsive: createResponsiveSceneFixture,
  component: createComponentSceneFixture,
  mixed: createMixedSceneFixture,
});
