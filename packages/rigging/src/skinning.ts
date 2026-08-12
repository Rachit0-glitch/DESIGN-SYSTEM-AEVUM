import { mat3, mat4, vec3 } from "gl-matrix";
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { fingerprint } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  CpuSkinningResultSchema,
  DEFAULT_RIG_RESOURCE_LIMITS,
  type CpuSkinningResult,
  type RigDiagnostic,
  type RigResourceLimits,
  type SkinVertex,
} from "./schemas.js";

export interface CpuSkinningInput {
  readonly vertices: readonly SkinVertex[];
  readonly jointMatrices: readonly (readonly number[])[];
  readonly limits?: RigResourceLimits;
}

function boundsOf(points: readonly { x: number; y: number; z: number }[]) {
  if (points.length === 0) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  return {
    min: {
      x: Math.min(...points.map((p) => p.x)),
      y: Math.min(...points.map((p) => p.y)),
      z: Math.min(...points.map((p) => p.z)),
    },
    max: {
      x: Math.max(...points.map((p) => p.x)),
      y: Math.max(...points.map((p) => p.y)),
      z: Math.max(...points.map((p) => p.z)),
    },
  };
}

export function skinVerticesCpu(input: CpuSkinningInput): CpuSkinningResult {
  const limits = input.limits ?? DEFAULT_RIG_RESOURCE_LIMITS;
  if (input.vertices.length > limits.maxCpuSkinVertices)
    throw new Error(`CPU skinning exceeds the ${limits.maxCpuSkinVertices} vertex limit.`);
  const matrices = input.jointMatrices.map((value, index) => {
    if (value.length !== 16 || value.some((entry) => !Number.isFinite(entry)))
      throw new Error(`Joint matrix ${index} is invalid.`);
    return mat4.fromValues(
      ...(value as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ]),
    );
  });
  const diagnostics: RigDiagnostic[] = [];
  const vertices = input.vertices.map((vertex, vertexIndex) => {
    const position = vec3.create();
    const normal = vec3.create();
    let total = 0;
    for (const influence of vertex.influences) {
      const matrix = matrices[influence.jointIndex];
      if (!matrix || !Number.isFinite(influence.weight) || influence.weight < 0) {
        diagnostics.push(
          diagnostic({
            code: "SKIN_BONE_REFERENCE_INVALID",
            severity: "ERROR",
            message: `Vertex ${vertexIndex} has an invalid joint influence.`,
            stage: "CPU_SKINNING",
            recoverable: true,
            relatedIds: [String(influence.jointIndex)],
          }),
        );
        continue;
      }
      const transformed = vec3.transformMat4(
        vec3.create(),
        vec3.fromValues(vertex.position.x, vertex.position.y, vertex.position.z),
        matrix,
      );
      vec3.scaleAndAdd(position, position, transformed, influence.weight);
      if (vertex.normal) {
        const normalMatrix = mat3.normalFromMat4(mat3.create(), matrix);
        if (normalMatrix) {
          const transformedNormal = vec3.transformMat3(
            vec3.create(),
            vec3.fromValues(vertex.normal.x, vertex.normal.y, vertex.normal.z),
            normalMatrix,
          );
          vec3.scaleAndAdd(normal, normal, transformedNormal, influence.weight);
        }
      }
      total += influence.weight;
    }
    if (total <= 0) {
      diagnostics.push(
        diagnostic({
          code: "SKIN_VERTEX_UNWEIGHTED",
          severity: "ERROR",
          message: `Vertex ${vertexIndex} has no valid influences.`,
          stage: "CPU_SKINNING",
          recoverable: true,
        }),
      );
      vec3.set(position, vertex.position.x, vertex.position.y, vertex.position.z);
    } else if (Math.abs(total - 1) > 1e-6) vec3.scale(position, position, 1 / total);
    const result: { position: { x: number; y: number; z: number }; normal?: { x: number; y: number; z: number } } = {
      position: { x: position[0], y: position[1], z: position[2] },
    };
    if (vertex.normal) {
      if (vec3.length(normal) > 1e-12) vec3.normalize(normal, normal);
      result.normal = { x: normal[0], y: normal[1], z: normal[2] };
    }
    return result;
  });
  const body = {
    version: "1.0.0" as const,
    classification: "REAL" as const,
    vertices,
    bounds: boundsOf(vertices.map((entry) => entry.position)),
    diagnostics: sortDiagnostics(diagnostics),
  };
  return deepFreeze(CpuSkinningResultSchema.parse({ ...body, fingerprint: fingerprint(body) }));
}
