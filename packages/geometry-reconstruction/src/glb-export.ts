import { Document, WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import type { RawMesh } from "./schemas.js";

/**
 * Serializes a generated candidate mesh to a real GLB buffer using `@gltf-transform/core`, the
 * same library and pattern (`WebIO` + `ALL_EXTENSIONS`) already used by `packages/test-fixtures`
 * and read by `packages/renderer-3d`'s Phase 14 import path.
 */
export async function exportMeshToGlb(mesh: RawMesh, meshName = "reconstructed-candidate"): Promise<Uint8Array> {
  const document = new Document();
  const buffer = document.createBuffer(`${meshName}-buffer`);

  const positions = document
    .createAccessor(`${meshName}-positions`)
    .setType("VEC3")
    .setArray(new Float32Array(mesh.positions))
    .setBuffer(buffer);

  const indices = document
    .createAccessor(`${meshName}-indices`)
    .setType("SCALAR")
    .setArray(mesh.positions.length / 3 > 65_535 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices))
    .setBuffer(buffer);

  const primitive = document.createPrimitive().setAttribute("POSITION", positions).setIndices(indices);

  if (mesh.normals) {
    const normals = document
      .createAccessor(`${meshName}-normals`)
      .setType("VEC3")
      .setArray(new Float32Array(mesh.normals))
      .setBuffer(buffer);
    primitive.setAttribute("NORMAL", normals);
  }

  const material = document
    .createMaterial(`${meshName}-material`)
    .setBaseColorFactor([0.72, 0.72, 0.75, 1])
    .setMetallicFactor(0.1)
    .setRoughnessFactor(0.7);
  primitive.setMaterial(material);

  const glMesh = document.createMesh(meshName).addPrimitive(primitive);
  const node = document.createNode(meshName).setMesh(glMesh);
  const scene = document.createScene(`${meshName}-scene`).addChild(node);
  document.getRoot().setDefaultScene(scene);

  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  return io.writeBinary(document);
}
