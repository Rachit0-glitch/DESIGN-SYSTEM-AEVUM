import type { Bounds3D, Quaternion, Transform } from "@aevum/document-model";
import { mat4, quat, vec3 } from "gl-matrix";
import type { RuntimeTransform } from "./types.js";

function rotationQuaternion(transform: Transform): quat {
  if (transform.quaternion) {
    return quat.normalize(
      quat.create(),
      quat.fromValues(transform.quaternion.x, transform.quaternion.y, transform.quaternion.z, transform.quaternion.w),
    );
  }
  const result = quat.create();
  quat.rotateX(result, result, transform.rotation.x);
  quat.rotateY(result, result, transform.rotation.y);
  quat.rotateZ(result, result, transform.rotation.z);
  return result;
}

function localMatrix(transform: Transform): mat4 {
  const matrix = mat4.create();
  mat4.translate(matrix, matrix, [transform.position.x, transform.position.y, transform.position.z]);
  mat4.translate(matrix, matrix, [transform.pivot.x, transform.pivot.y, transform.pivot.z]);
  mat4.fromQuat(matrix, rotationQuaternion(transform));
  matrix[12] += transform.position.x + transform.pivot.x;
  matrix[13] += transform.position.y + transform.pivot.y;
  matrix[14] += transform.position.z + transform.pivot.z;
  if (transform.skew.x !== 0 || transform.skew.y !== 0) {
    const skew = mat4.fromValues(
      1,
      Math.tan(transform.skew.y),
      0,
      0,
      Math.tan(transform.skew.x),
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    );
    mat4.multiply(matrix, matrix, skew);
  }
  mat4.scale(matrix, matrix, [transform.scale.x, transform.scale.y, transform.scale.z]);
  mat4.translate(matrix, matrix, [-transform.pivot.x, -transform.pivot.y, -transform.pivot.z]);
  return matrix;
}

function quaternionRecord(value: quat): Quaternion {
  return { x: value[0], y: value[1], z: value[2], w: value[3] };
}

export function createLocalTransform(transform: Transform): RuntimeTransform {
  return { ...transform, maskIds: [...transform.maskIds], matrix: [...localMatrix(transform)] };
}

export function composeWorldTransform(local: RuntimeTransform, parent?: RuntimeTransform): RuntimeTransform {
  if (!parent || ["WORLD", "VIEWPORT", "SCREEN"].includes(local.coordinateSpace)) {
    return { ...local, matrix: [...local.matrix], coordinateSpace: "WORLD" };
  }
  const matrix = mat4.multiply(
    mat4.create(),
    mat4.fromValues(...(parent.matrix as Parameters<typeof mat4.fromValues>)),
    mat4.fromValues(...(local.matrix as Parameters<typeof mat4.fromValues>)),
  );
  const position = mat4.getTranslation(vec3.create(), matrix);
  const scale = mat4.getScaling(vec3.create(), matrix);
  const rotation = mat4.getRotation(quat.create(), matrix);
  return {
    ...local,
    position: { x: position[0], y: position[1], z: position[2] },
    quaternion: quaternionRecord(rotation),
    scale: { x: scale[0], y: scale[1], z: scale[2] },
    opacity: parent.opacity * local.opacity,
    coordinateSpace: "WORLD",
    matrix: [...matrix],
  };
}

export function invertTransformMatrix(matrix: readonly number[]): readonly number[] {
  const source = mat4.fromValues(...(matrix as Parameters<typeof mat4.fromValues>));
  const inverse = mat4.invert(mat4.create(), source);
  if (!inverse) throw new Error("Transform matrix is not invertible.");
  return [...inverse];
}

export function worldToLocalPoint(matrix: readonly number[], point: Readonly<{ x: number; y: number; z: number }>) {
  const inverse = mat4.fromValues(...(invertTransformMatrix(matrix) as Parameters<typeof mat4.fromValues>));
  const result = vec3.transformMat4(vec3.create(), [point.x, point.y, point.z], inverse);
  return { x: result[0], y: result[1], z: result[2] };
}

export function transformBounds3D(bounds: Bounds3D, matrix: readonly number[]): Bounds3D {
  const transform = mat4.fromValues(...(matrix as Parameters<typeof mat4.fromValues>));
  const corners = [
    [bounds.min.x, bounds.min.y, bounds.min.z],
    [bounds.min.x, bounds.min.y, bounds.max.z],
    [bounds.min.x, bounds.max.y, bounds.min.z],
    [bounds.min.x, bounds.max.y, bounds.max.z],
    [bounds.max.x, bounds.min.y, bounds.min.z],
    [bounds.max.x, bounds.min.y, bounds.max.z],
    [bounds.max.x, bounds.max.y, bounds.min.z],
    [bounds.max.x, bounds.max.y, bounds.max.z],
  ].map((corner) => vec3.transformMat4(vec3.create(), corner as vec3, transform));
  const min = [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis] ?? 0)));
  const max = [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis] ?? 0)));
  const size = max.map((value, axis) => value - (min[axis] ?? 0));
  const center = max.map((value, axis) => (value + (min[axis] ?? 0)) / 2);
  return {
    min: { x: min[0] ?? 0, y: min[1] ?? 0, z: min[2] ?? 0 },
    max: { x: max[0] ?? 0, y: max[1] ?? 0, z: max[2] ?? 0 },
    center: { x: center[0] ?? 0, y: center[1] ?? 0, z: center[2] ?? 0 },
    size: { x: size[0] ?? 0, y: size[1] ?? 0, z: size[2] ?? 0 },
    radius: Math.hypot(size[0] ?? 0, size[1] ?? 0, size[2] ?? 0) / 2,
  };
}
