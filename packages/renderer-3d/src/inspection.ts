import { type Document, type GLTF, type JSONDocument, WebIO, getBounds } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRLightsPunctual, type Light } from "@gltf-transform/extensions";
import { computeSha256 } from "@aevum/assets";
import { type AssetRecord, Bounds3DSchema } from "@aevum/document-model";
import { vec3 } from "gl-matrix";
import { ThreeFoundationError } from "./errors.js";
import { deepFreeze, threeFingerprint } from "./stable.js";
import {
  THREE_FOUNDATION_VERSION,
  ThreeAssetInspectionSchema,
  ThreeImportLimitsSchema,
  type ThreeAssetInspection,
  type ThreeDiagnostic,
  type ThreeImportLimits,
} from "./types.js";

export interface Inspect3DAssetInput {
  readonly asset: AssetRecord;
  readonly bytes: Uint8Array;
  readonly resources?: Readonly<Record<string, Uint8Array>>;
  readonly limits?: Partial<ThreeImportLimits>;
}

export interface Parsed3DAsset {
  readonly input: Inspect3DAssetInput;
  readonly document: Document;
  readonly json: GLTF.IGLTF;
  readonly inspection: ThreeAssetInspection;
}

const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
const supportedExtensions = new Set(
  ALL_EXTENSIONS.map((extension) => (extension as unknown as { EXTENSION_NAME?: string }).EXTENSION_NAME).filter(
    (name): name is string => Boolean(name),
  ),
);
const decoderRequired = new Set(["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"]);

function diagnostic(
  code: ThreeDiagnostic["code"],
  severity: ThreeDiagnostic["severity"],
  message: string,
  extra: Partial<ThreeDiagnostic> = {},
): ThreeDiagnostic {
  return { code, severity, message, recoverable: severity !== "BLOCKING", ...extra };
}

function reject(message: string, code: ThreeDiagnostic["code"]): never {
  const issue = diagnostic(code, "BLOCKING", message);
  throw new ThreeFoundationError(code, message, [issue]);
}

function isSafeResourceUri(uri: string): boolean {
  if (uri.startsWith("data:")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) return false;
  if (uri.startsWith("/") || uri.startsWith("\\") || uri.includes("\\")) return false;
  return !uri.split("/").some((part) => part === ".." || part === "");
}

function listedUris(json: GLTF.IGLTF): string[] {
  return [
    ...(json.buffers ?? []).map((value) => value.uri).filter((value): value is string => Boolean(value)),
    ...(json.images ?? []).map((value) => value.uri).filter((value): value is string => Boolean(value)),
  ];
}

async function jsonDocument(input: Inspect3DAssetInput): Promise<JSONDocument> {
  if (input.asset.type === "GLB") return io.binaryToJSON(input.bytes);
  let json: GLTF.IGLTF;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.bytes)) as GLTF.IGLTF;
  } catch (error) {
    reject(
      `GLTF JSON is malformed: ${error instanceof Error ? error.message : "invalid UTF-8 or JSON"}.`,
      "MALFORMED_GLTF",
    );
  }
  if (json.asset?.version !== "2.0") reject("Only glTF 2.0 assets are supported.", "MALFORMED_GLTF");
  const resources: Record<string, Uint8Array<ArrayBuffer>> = {};
  for (const uri of listedUris(json)) {
    if (!isSafeResourceUri(uri)) {
      reject(
        `External resource URI is not a safe relative asset reference: ${uri}`,
        /^[a-z][a-z0-9+.-]*:/i.test(uri) ? "NETWORK_RESOURCE_REJECTED" : "UNSAFE_RESOURCE_URI",
      );
    }
    if (uri.startsWith("data:")) continue;
    const bytes = input.resources?.[uri];
    if (!bytes) reject(`Required GLTF resource is missing: ${uri}`, "MISSING_RESOURCE");
    resources[uri] = Uint8Array.from(bytes);
  }
  return { json, resources };
}

function preflight(json: GLTF.IGLTF, bytes: number, resources: number, limits: ThreeImportLimits): void {
  const checks: Array<[number, number, string]> = [
    [bytes, limits.maxAssetBytes, "asset bytes"],
    [json.nodes?.length ?? 0, limits.maxNodes, "nodes"],
    [json.meshes?.length ?? 0, limits.maxMeshes, "meshes"],
    [json.meshes?.reduce((sum, mesh) => sum + mesh.primitives.length, 0) ?? 0, limits.maxPrimitives, "primitives"],
    [json.images?.length ?? 0, limits.maxTextures, "textures"],
    [resources, limits.maxTextureBytes, "external resource bytes"],
  ];
  const exceeded = checks.find(([actual, maximum]) => actual > maximum);
  if (exceeded)
    reject(
      `${exceeded[2]} exceed configured limit ${exceeded[1]} (received ${exceeded[0]}).`,
      "RESOURCE_LIMIT_EXCEEDED",
    );
}

function primitiveTriangles(mode: number, count: number): number {
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

function boundsRecord(min: readonly number[], max: readonly number[]) {
  const minimum = vec3.fromValues(min[0] ?? 0, min[1] ?? 0, min[2] ?? 0);
  const maximum = vec3.fromValues(max[0] ?? 0, max[1] ?? 0, max[2] ?? 0);
  const center = vec3.scale(vec3.create(), vec3.add(vec3.create(), minimum, maximum), 0.5);
  const size = vec3.subtract(vec3.create(), maximum, minimum);
  return Bounds3DSchema.parse({
    min: { x: minimum[0], y: minimum[1], z: minimum[2] },
    max: { x: maximum[0], y: maximum[1], z: maximum[2] },
    center: { x: center[0], y: center[1], z: center[2] },
    size: { x: size[0], y: size[1], z: size[2] },
    radius: vec3.length(size) / 2,
  });
}

function hierarchyDepth(json: GLTF.IGLTF): number {
  const visit = (index: number, ancestors: Set<number>): number => {
    if (ancestors.has(index)) reject("GLTF hierarchy contains a cycle.", "MALFORMED_GLTF");
    const next = new Set(ancestors).add(index);
    return 1 + Math.max(0, ...(json.nodes?.[index]?.children ?? []).map((child) => visit(child, next)));
  };
  return Math.max(
    0,
    ...(json.scenes ?? []).flatMap((scene) => (scene.nodes ?? []).map((index) => visit(index, new Set()))),
  );
}

function inspectParsed(
  input: Inspect3DAssetInput,
  document: Document,
  json: GLTF.IGLTF,
  limits: ThreeImportLimits,
): ThreeAssetInspection {
  const root = document.getRoot();
  const diagnostics: ThreeDiagnostic[] = [];
  const extensionsUsed = [...(json.extensionsUsed ?? [])].sort();
  const extensionsRequired = [...(json.extensionsRequired ?? [])].sort();
  for (const extension of extensionsUsed) {
    if (!supportedExtensions.has(extension) || decoderRequired.has(extension)) {
      diagnostics.push(
        diagnostic(
          "UNSUPPORTED_EXTENSION",
          extensionsRequired.includes(extension) ? "BLOCKING" : "WARNING",
          `Extension ${extension} is preserved in diagnostics but is not executable by the Phase 14 local adapter.`,
          { details: { extension } },
        ),
      );
    }
  }
  const unsupportedMaterialExtensions = extensionsUsed.filter(
    (name) => name.startsWith("KHR_materials_") && name !== "KHR_materials_unlit",
  );
  for (const extension of unsupportedMaterialExtensions) {
    diagnostics.push(
      diagnostic(
        "UNSUPPORTED_MATERIAL_FEATURE",
        "WARNING",
        `Material extension ${extension} is reported but not normalized into the base PBR contract.`,
      ),
    );
  }
  let vertexCount = 0;
  let triangleCount = 0;
  let primitiveCount = 0;
  let morphTargetCount = 0;
  for (const [meshIndex, mesh] of root.listMeshes().entries()) {
    for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
      primitiveCount += 1;
      const position = primitive.getAttribute("POSITION");
      if (!position) {
        diagnostics.push(
          diagnostic("MISSING_POSITION_ATTRIBUTE", "ERROR", "Primitive does not contain a POSITION attribute.", {
            path: `meshes.${meshIndex}.primitives.${primitiveIndex}`,
            entityIndex: primitiveIndex,
          }),
        );
        continue;
      }
      const count = primitive.getIndices()?.getCount() ?? position.getCount();
      vertexCount += position.getCount();
      triangleCount += primitiveTriangles(primitive.getMode(), count);
      morphTargetCount += primitive.listTargets().length;
      const indices = primitive.getIndices();
      if (indices && (indices.getMax([])[0] ?? -1) >= position.getCount()) {
        diagnostics.push(
          diagnostic("INVALID_INDEX", "ERROR", "Primitive indices exceed the POSITION accessor count.", {
            path: `meshes.${meshIndex}.primitives.${primitiveIndex}.indices`,
          }),
        );
      }
      if (![0, 1, 2, 3, 4, 5, 6].includes(primitive.getMode())) {
        diagnostics.push(
          diagnostic("UNSUPPORTED_PRIMITIVE_MODE", "ERROR", `Primitive mode ${primitive.getMode()} is invalid.`),
        );
      }
    }
  }
  if (vertexCount > limits.maxVertices)
    reject("Vertex count exceeds the configured import limit.", "RESOURCE_LIMIT_EXCEEDED");
  const depth = hierarchyDepth(json);
  if (depth > limits.maxHierarchyDepth)
    reject("Hierarchy depth exceeds the configured import limit.", "RESOURCE_LIMIT_EXCEEDED");
  for (const [nodeIndex, node] of root.listNodes().entries()) {
    const transform = [...node.getTranslation(), ...node.getRotation(), ...node.getScale()];
    if (transform.some((value) => !Number.isFinite(value))) {
      diagnostics.push(
        diagnostic("INVALID_TRANSFORM", "ERROR", "Node transform contains a non-finite value.", {
          entityIndex: nodeIndex,
        }),
      );
    }
    if (node.getScale().some((value) => Math.abs(value) < Number.EPSILON)) {
      diagnostics.push(
        diagnostic("DEGENERATE_SCALE", "WARNING", "Node contains a degenerate scale component.", {
          entityIndex: nodeIndex,
        }),
      );
    }
  }
  if (root.listSkins().length > 0) {
    diagnostics.push(
      diagnostic(
        "UNSUPPORTED_SKIN_FEATURE",
        "WARNING",
        "Skin metadata is inspected but canonical rig execution is deferred.",
      ),
    );
  }
  if (root.listAnimations().length > 0) {
    diagnostics.push(
      diagnostic(
        "UNSUPPORTED_ANIMATION_FEATURE",
        "WARNING",
        "glTF animation metadata is inspected; canonical timeline conversion is deferred.",
      ),
    );
  }
  const lights = root.listNodes().filter((node) => Boolean(node.getExtension<Light>(KHRLightsPunctual.EXTENSION_NAME)));
  const textureBytes = root.listTextures().reduce((sum, texture) => sum + (texture.getImage()?.byteLength ?? 0), 0);
  const scenes = root.listScenes();
  if (scenes.length === 0) diagnostics.push(diagnostic("NO_SCENE", "BLOCKING", "The asset contains no glTF scene."));
  if (root.listCameras().length === 0)
    diagnostics.push(diagnostic("NO_CAMERA", "INFO", "The asset contains no camera."));
  let sceneBounds: ReturnType<typeof boundsRecord> | undefined;
  if (scenes.length > 0) {
    const bounds = scenes.map((scene) => getBounds(scene));
    const min = [0, 1, 2].map((axis) => Math.min(...bounds.map((entry) => entry.min[axis] ?? 0)));
    const max = [0, 1, 2].map((axis) => Math.max(...bounds.map((entry) => entry.max[axis] ?? 0)));
    if ([...min, ...max].every(Number.isFinite)) sceneBounds = boundsRecord(min, max);
    else diagnostics.push(diagnostic("INVALID_BOUNDS", "ERROR", "Scene bounds contain non-finite values."));
  }
  const statistics = {
    sceneCount: scenes.length,
    nodeCount: root.listNodes().length,
    meshCount: root.listMeshes().length,
    primitiveCount,
    materialCount: root.listMaterials().length,
    textureCount: root.listTextures().length,
    textureBytes,
    cameraCount: root.listCameras().length,
    lightCount: lights.length,
    animationCount: root.listAnimations().length,
    skinCount: root.listSkins().length,
    morphTargetCount,
    vertexCount,
    triangleCount,
    drawCallEstimate: primitiveCount,
  };
  const body = {
    version: THREE_FOUNDATION_VERSION,
    assetId: input.asset.id,
    assetHash: input.asset.hash,
    format: input.asset.type as "GLB" | "GLTF",
    statistics,
    ...(sceneBounds ? { sceneBounds } : {}),
    extensionsUsed,
    extensionsRequired,
    diagnostics: diagnostics.sort((left, right) =>
      `${left.severity}:${left.code}`.localeCompare(`${right.severity}:${right.code}`),
    ),
    complete: !diagnostics.some((issue) => issue.severity === "BLOCKING" || issue.severity === "ERROR"),
  };
  return deepFreeze(ThreeAssetInspectionSchema.parse({ ...body, fingerprint: threeFingerprint(body) }));
}

export async function parse3DAsset(input: Inspect3DAssetInput): Promise<Parsed3DAsset> {
  if (input.asset.type !== "GLB" && input.asset.type !== "GLTF")
    reject("Only registered GLB and GLTF assets are supported.", "ASSET_TYPE_UNSUPPORTED");
  if (computeSha256(input.bytes) !== input.asset.hash)
    reject("Registered asset hash does not match supplied bytes.", "ASSET_HASH_MISMATCH");
  const limits = ThreeImportLimitsSchema.parse(input.limits ?? {});
  let jsonDoc: JSONDocument;
  try {
    jsonDoc = await jsonDocument(input);
  } catch (error) {
    if (error instanceof ThreeFoundationError) throw error;
    reject(
      `Unable to decode the 3D asset: ${error instanceof Error ? error.message : "unknown error"}.`,
      "MALFORMED_GLTF",
    );
  }
  const resourceBytes = Object.values(input.resources ?? {}).reduce((sum, value) => sum + value.byteLength, 0);
  preflight(jsonDoc.json, input.bytes.byteLength, resourceBytes, limits);
  let document: Document;
  try {
    document = await io.readJSON(jsonDoc);
  } catch (error) {
    reject(
      `Unable to parse glTF buffers: ${error instanceof Error ? error.message : "unknown error"}.`,
      "MALFORMED_BUFFER",
    );
  }
  return Object.freeze({
    input,
    document,
    json: jsonDoc.json,
    inspection: inspectParsed(input, document, jsonDoc.json, limits),
  });
}

export async function inspect3DAsset(input: Inspect3DAssetInput): Promise<ThreeAssetInspection> {
  return (await parse3DAsset(input)).inspection;
}
