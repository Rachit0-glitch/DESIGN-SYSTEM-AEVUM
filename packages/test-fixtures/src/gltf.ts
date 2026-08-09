import { Document, WebIO, type JSONDocument } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRLightsPunctual } from "@gltf-transform/extensions";

export interface ThreeFixture {
  readonly glb: Uint8Array;
  readonly gltf: Uint8Array;
  readonly resources: Readonly<Record<string, Uint8Array>>;
}

export interface ThreeFixtureSet {
  readonly simpleCube: ThreeFixture;
  readonly hierarchicalMultiMesh: ThreeFixture;
  readonly multiMaterial: ThreeFixture;
  readonly texturedObject: ThreeFixture;
  readonly cameraScene: ThreeFixture;
  readonly lightScene: ThreeFixture;
  readonly nestedTransforms: ThreeFixture;
}

const onePixelPng = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
);

function encodeJson(document: JSONDocument): { gltf: Uint8Array; resources: Record<string, Uint8Array> } {
  const resources: Record<string, Uint8Array> = {};
  for (const [uri, bytes] of Object.entries(document.resources)) resources[uri] = Uint8Array.from(bytes);
  return { gltf: new TextEncoder().encode(JSON.stringify(document.json)), resources };
}

async function serialize(document: Document): Promise<ThreeFixture> {
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  const [glb, jsonDocument] = await Promise.all([io.writeBinary(document), io.writeJSON(document)]);
  return { glb, ...encodeJson(jsonDocument) };
}

export async function createThreeFixture(): Promise<ThreeFixture> {
  const document = new Document();
  const buffer = document.createBuffer("fixture-buffer");
  const positions = document
    .createAccessor("positions")
    .setType("VEC3")
    .setArray(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]))
    .setBuffer(buffer);
  const normals = document
    .createAccessor("normals")
    .setType("VEC3")
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]))
    .setBuffer(buffer);
  const texcoords = document
    .createAccessor("texcoords")
    .setType("VEC2")
    .setArray(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]))
    .setBuffer(buffer);
  const indices = document
    .createAccessor("indices")
    .setType("SCALAR")
    .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
    .setBuffer(buffer);
  const texture = document.createTexture("fixture-texture").setImage(onePixelPng).setMimeType("image/png");
  const material = document
    .createMaterial("fixture-pbr")
    .setBaseColorFactor([0.3, 0.5, 0.8, 0.9])
    .setMetallicFactor(0.25)
    .setRoughnessFactor(0.65)
    .setBaseColorTexture(texture)
    .setAlphaMode("BLEND")
    .setDoubleSided(true);
  const secondaryMaterial = document
    .createMaterial("fixture-secondary-pbr")
    .setBaseColorFactor([0.8, 0.15, 0.1, 1])
    .setMetallicFactor(0.8)
    .setRoughnessFactor(0.2);
  const primaryPrimitive = document
    .createPrimitive()
    .setAttribute("POSITION", positions)
    .setAttribute("NORMAL", normals)
    .setAttribute("TEXCOORD_0", texcoords)
    .setIndices(indices)
    .setMaterial(material);
  const secondaryPrimitive = document.createPrimitive().setAttribute("POSITION", positions).setIndices(indices);
  const mesh = document.createMesh("fixture-mesh").addPrimitive(primaryPrimitive).addPrimitive(secondaryPrimitive);
  const detailMesh = document
    .createMesh("fixture-detail-mesh")
    .addPrimitive(
      document.createPrimitive().setAttribute("POSITION", positions).setIndices(indices).setMaterial(secondaryMaterial),
    );
  const meshNode = document
    .createNode("nested-mesh")
    .setMesh(mesh)
    .setTranslation([2, 1, -3])
    .setRotation([0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)])
    .setScale([1.5, 1, 0.5]);
  const groupNode = document.createNode("fixture-group").setTranslation([10, 0, 0]).addChild(meshNode);
  const detailNode = document
    .createNode("detail-mesh")
    .setMesh(detailMesh)
    .setTranslation([2, 1, -3])
    .setRotation([0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)])
    .setScale([1.5, 1, 0.5]);
  groupNode.addChild(detailNode);
  const camera = document
    .createCamera("fixture-camera")
    .setType("perspective")
    .setYFov(Math.PI / 3)
    .setZNear(0.1)
    .setZFar(500);
  const cameraNode = document.createNode("camera-node").setCamera(camera).setTranslation([0, 2, 8]);
  const lightExtension = document.createExtension(KHRLightsPunctual);
  const light = lightExtension
    .createLight("fixture-key-light")
    .setType("spot")
    .setColor([1, 0.95, 0.8])
    .setIntensity(7)
    .setRange(50)
    .setInnerConeAngle(0.2)
    .setOuterConeAngle(0.6);
  const lightNode = document.createNode("light-node").setExtension(KHRLightsPunctual.EXTENSION_NAME, light);
  groupNode.addChild(cameraNode).addChild(lightNode);
  const scene = document.createScene("fixture-scene").addChild(groupNode);
  document.getRoot().setDefaultScene(scene);

  return serialize(document);
}

export async function createSimpleCubeFixture(): Promise<ThreeFixture> {
  const document = new Document();
  const buffer = document.createBuffer("cube-buffer");
  const positions = document
    .createAccessor("cube-positions")
    .setType("VEC3")
    .setArray(new Float32Array([-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]))
    .setBuffer(buffer);
  const indices = document
    .createAccessor("cube-indices")
    .setType("SCALAR")
    .setArray(
      new Uint16Array([
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
      ]),
    )
    .setBuffer(buffer);
  const primitive = document.createPrimitive().setAttribute("POSITION", positions).setIndices(indices);
  const cube = document.createNode("cube").setMesh(document.createMesh("cube-mesh").addPrimitive(primitive));
  const scene = document.createScene("cube-scene").addChild(cube);
  document.getRoot().setDefaultScene(scene);
  return serialize(document);
}

export async function createThreeFixtureSet(): Promise<ThreeFixtureSet> {
  const [simpleCube, comprehensive] = await Promise.all([createSimpleCubeFixture(), createThreeFixture()]);
  return Object.freeze({
    simpleCube,
    hierarchicalMultiMesh: comprehensive,
    multiMaterial: comprehensive,
    texturedObject: comprehensive,
    cameraScene: comprehensive,
    lightScene: comprehensive,
    nestedTransforms: comprehensive,
  });
}
