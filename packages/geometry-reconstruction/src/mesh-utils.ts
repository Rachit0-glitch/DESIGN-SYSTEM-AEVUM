import { addVectors, dotVectors, scaleVector, subtractVectors, type Vec3 } from "@aevum/multiview-reconstruction";
import type { RawMesh } from "./schemas.js";

export function mergeMeshes(meshes: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let hasAllNormals = true;

  for (const mesh of meshes) {
    const offset = positions.length / 3;
    positions.push(...mesh.positions);
    if (mesh.normals) normals.push(...mesh.normals);
    else hasAllNormals = false;
    for (const index of mesh.indices) indices.push(index + offset);
  }

  return { positions, ...(hasAllNormals && normals.length > 0 ? { normals } : {}), indices };
}

export interface MeshBounds {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly center: Vec3;
  readonly size: Vec3;
  readonly radius: number;
}

export function computeMeshBounds(mesh: RawMesh): MeshBounds {
  if (mesh.positions.length === 0) {
    const zero = { x: 0, y: 0, z: 0 };
    return { min: zero, max: zero, center: zero, size: zero, radius: 0 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0;
    const y = mesh.positions[i + 1] ?? 0;
    const z = mesh.positions[i + 2] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const min = { x: minX, y: minY, z: minZ };
  const max = { x: maxX, y: maxY, z: maxZ };
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  const size = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
  const radius = Math.hypot(size.x, size.y, size.z) / 2;
  return { min, max, center, size, radius };
}

export interface StructuralValidity {
  readonly valid: boolean;
  readonly triangleCount: number;
  readonly degenerateTriangleCount: number;
  readonly nonFiniteVertexCount: number;
  readonly issues: readonly string[];
}

/**
 * A local, provider-independent structural check (finite coordinates, no zero-area triangles, a
 * bounded triangle count). This is deliberately NOT a claim of real Blender/manifold topology
 * validation — that remains the real Phase 16 `mesh.validate`/`mesh.topology_inspect` bridge
 * operation, invoked separately once the candidate is a registered, imported asset.
 */
export function checkStructuralValidity(mesh: RawMesh, maxTriangles: number): StructuralValidity {
  const issues: string[] = [];
  let nonFiniteVertexCount = 0;
  for (const value of mesh.positions) {
    if (!Number.isFinite(value)) nonFiniteVertexCount += 1;
  }
  if (nonFiniteVertexCount > 0) issues.push(`${nonFiniteVertexCount} non-finite vertex components.`);

  const triangleCount = mesh.indices.length / 3;
  if (triangleCount > maxTriangles) issues.push(`Triangle count ${triangleCount} exceeds the ${maxTriangles} limit.`);
  if (triangleCount === 0) issues.push("Mesh has no triangles.");

  let degenerateTriangleCount = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = vertexAt(mesh, mesh.indices[i] ?? 0);
    const b = vertexAt(mesh, mesh.indices[i + 1] ?? 0);
    const c = vertexAt(mesh, mesh.indices[i + 2] ?? 0);
    const area = triangleArea(a, b, c);
    if (!Number.isFinite(area) || area < 1e-9) degenerateTriangleCount += 1;
  }
  if (degenerateTriangleCount > 0) issues.push(`${degenerateTriangleCount} degenerate (near-zero-area) triangles.`);

  return {
    valid: issues.length === 0,
    triangleCount,
    degenerateTriangleCount,
    nonFiniteVertexCount,
    issues,
  };
}

function vertexAt(mesh: RawMesh, index: number): Vec3 {
  return {
    x: mesh.positions[index * 3] ?? 0,
    y: mesh.positions[index * 3 + 1] ?? 0,
    z: mesh.positions[index * 3 + 2] ?? 0,
  };
}

function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = subtractVectors(b, a);
  const ac = subtractVectors(c, a);
  const cross = {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
  return Math.hypot(cross.x, cross.y, cross.z) / 2;
}

/** Real closest-point-on-triangle distance (Ericson, "Real-Time Collision Detection" §5.1.5),
 * used to measure how far a Phase 17 triangulated landmark sits from the candidate surface. */
function closestPointOnTriangle(point: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = subtractVectors(b, a);
  const ac = subtractVectors(c, a);
  const ap = subtractVectors(point, a);
  const d1 = dotVectors(ab, ap);
  const d2 = dotVectors(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;

  const bp = subtractVectors(point, b);
  const d3 = dotVectors(ab, bp);
  const d4 = dotVectors(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return addVectors(a, scaleVector(ab, v));
  }

  const cp = subtractVectors(point, c);
  const d5 = dotVectors(ab, cp);
  const d6 = dotVectors(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return addVectors(a, scaleVector(ac, w));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return addVectors(b, scaleVector(subtractVectors(c, b), w));
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return addVectors(a, addVectors(scaleVector(ab, v), scaleVector(ac, w)));
}

/** Brute-force nearest distance from a point to a bounded mesh's surface. Triangle counts in this
 * package stay bounded (config-limited), so O(triangleCount) per landmark is intentional and cheap. */
export function distanceToMeshSurface(point: Vec3, mesh: RawMesh): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = vertexAt(mesh, mesh.indices[i] ?? 0);
    const b = vertexAt(mesh, mesh.indices[i + 1] ?? 0);
    const c = vertexAt(mesh, mesh.indices[i + 2] ?? 0);
    const closest = closestPointOnTriangle(point, a, b, c);
    best = Math.min(best, Math.hypot(point.x - closest.x, point.y - closest.y, point.z - closest.z));
  }
  return best;
}

export function translateMesh(mesh: RawMesh, offset: Vec3): RawMesh {
  const positions = mesh.positions.slice();
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] ?? 0) + offset.x;
    positions[i + 1] = (positions[i + 1] ?? 0) + offset.y;
    positions[i + 2] = (positions[i + 2] ?? 0) + offset.z;
  }
  return { positions, ...(mesh.normals ? { normals: mesh.normals } : {}), indices: mesh.indices };
}
