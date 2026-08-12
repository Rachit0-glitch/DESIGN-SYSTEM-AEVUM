export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };
export const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len === 0) return ZERO_VEC3;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/** The shortest-arc rotation quaternion that rotates unit vector `from` onto unit vector `to`
 * (used to orient a bone's local +Y axis toward its tail — Blender's own bone convention). */
export function quaternionFromTo(from: Vec3, to: Vec3): Quat {
  const a = normalize(from);
  const b = normalize(to);
  const d = dot(a, b);
  if (d > 1 - 1e-9) return IDENTITY_QUAT;
  if (d < -1 + 1e-9) {
    // 180-degree rotation: pick any axis perpendicular to `a`.
    const perpendicular = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const axis = normalize(cross(a, perpendicular));
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }
  const axis = cross(a, b);
  const w = 1 + d;
  const q = { x: axis.x, y: axis.y, z: axis.z, w };
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  return len === 0 ? IDENTITY_QUAT : { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}
