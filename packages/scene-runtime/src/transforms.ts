import type { Transform } from "@aevum/document-model";
import type { RuntimeTransform } from "./types.js";

type Matrix4 = readonly number[];

const identity = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(left: Matrix4, right: Matrix4): number[] {
  const result = Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let index = 0; index < 4; index += 1) {
        value += (left[index * 4 + row] ?? 0) * (right[column * 4 + index] ?? 0);
      }
      result[column * 4 + row] = value;
    }
  }
  return result;
}

function translation(x: number, y: number, z: number): number[] {
  const matrix = identity();
  matrix[12] = x;
  matrix[13] = y;
  matrix[14] = z;
  return matrix;
}

function scale(x: number, y: number, z: number): number[] {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

function rotationX(angle: number): number[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [1, 0, 0, 0, 0, cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1];
}

function rotationY(angle: number): number[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1];
}

function rotationZ(angle: number): number[] {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function skew(x: number, y: number): number[] {
  return [1, Math.tan(y), 0, 0, Math.tan(x), 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function createLocalTransform(transform: Transform): RuntimeTransform {
  let matrix = translation(transform.position.x, transform.position.y, transform.position.z);
  matrix = multiply(matrix, translation(transform.pivot.x, transform.pivot.y, transform.pivot.z));
  matrix = multiply(matrix, rotationZ(transform.rotation.z));
  matrix = multiply(matrix, rotationY(transform.rotation.y));
  matrix = multiply(matrix, rotationX(transform.rotation.x));
  matrix = multiply(matrix, skew(transform.skew.x, transform.skew.y));
  matrix = multiply(matrix, scale(transform.scale.x, transform.scale.y, transform.scale.z));
  matrix = multiply(matrix, translation(-transform.pivot.x, -transform.pivot.y, -transform.pivot.z));
  return { ...transform, maskIds: [...transform.maskIds], matrix };
}

export function composeWorldTransform(local: RuntimeTransform, parent?: RuntimeTransform): RuntimeTransform {
  if (!parent || ["WORLD", "VIEWPORT", "SCREEN"].includes(local.coordinateSpace)) {
    return { ...local, matrix: [...local.matrix], coordinateSpace: "WORLD" };
  }
  const matrix = multiply(parent.matrix, local.matrix);
  return {
    ...local,
    position: { x: matrix[12] ?? 0, y: matrix[13] ?? 0, z: matrix[14] ?? 0 },
    rotation: {
      x: parent.rotation.x + local.rotation.x,
      y: parent.rotation.y + local.rotation.y,
      z: parent.rotation.z + local.rotation.z,
    },
    scale: {
      x: parent.scale.x * local.scale.x,
      y: parent.scale.y * local.scale.y,
      z: parent.scale.z * local.scale.z,
    },
    skew: { x: parent.skew.x + local.skew.x, y: parent.skew.y + local.skew.y },
    opacity: parent.opacity * local.opacity,
    coordinateSpace: "WORLD",
    matrix,
  };
}
