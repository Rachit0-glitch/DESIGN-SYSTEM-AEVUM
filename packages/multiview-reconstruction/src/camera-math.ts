/**
 * Provider-independent camera geometry: vector/quaternion algebra, ray casting, perspective
 * projection, and multi-view triangulation by least-squares ray intersection. Every function
 * here is a deterministic mathematical computation with no dependency on any vision provider.
 */

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

export interface Ray3D {
  readonly origin: Vec3;
  readonly direction: Vec3;
}

export function addVectors(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtractVectors(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scaleVector(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dotVectors(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function crossVectors(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vectorLength(v: Vec3): number {
  return Math.sqrt(dotVectors(v, v));
}

export function normalizeVector(v: Vec3): Vec3 {
  const length = vectorLength(v);
  if (length < 1e-12) return { x: 0, y: 0, z: 0 };
  return scaleVector(v, 1 / length);
}

/** Rotates a vector by a unit quaternion using v' = v + 2w(q_xyz x v) + 2(q_xyz x (q_xyz x v)). */
export function rotateVectorByQuaternion(v: Vec3, q: Quat): Vec3 {
  const axis: Vec3 = { x: q.x, y: q.y, z: q.z };
  const t = scaleVector(crossVectors(axis, v), 2);
  return addVectors(addVectors(v, scaleVector(t, q.w)), crossVectors(axis, t));
}

export function quaternionConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

/**
 * Builds the world-space rotation of a camera whose local forward axis (canonical convention:
 * NEGATIVE_Z) should point from `position` toward `target`, with `up` as the world up-vector hint.
 * Converts the resulting orthonormal basis directly into a quaternion (no matrix intermediate).
 */
export function quaternionFromLookAt(position: Vec3, target: Vec3, up: Vec3 = { x: 0, y: 1, z: 0 }): Quat {
  const forward = normalizeVector(subtractVectors(target, position)); // world direction the camera looks along
  let right = normalizeVector(crossVectors(forward, up));
  if (vectorLength(right) < 1e-9) {
    // forward is parallel to up; pick a stable fallback axis
    right = normalizeVector(crossVectors(forward, { x: 1, y: 0, z: 0 }));
  }
  const realUp = crossVectors(right, forward);
  // Camera local axes map to world columns: local +X -> right, local +Y -> realUp, local -Z -> forward.
  const m00 = right.x;
  const m01 = realUp.x;
  const m02 = -forward.x;
  const m10 = right.y;
  const m11 = realUp.y;
  const m12 = -forward.y;
  const m20 = right.z;
  const m21 = realUp.z;
  const m22 = -forward.z;

  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return {
      w: s / 4,
      x: (m21 - m12) / s,
      y: (m02 - m20) / s,
      z: (m10 - m01) / s,
    };
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return { w: (m21 - m12) / s, x: s / 4, y: (m01 + m10) / s, z: (m02 + m20) / s };
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: s / 4, z: (m12 + m21) / s };
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: s / 4 };
}

export interface ResolvedCameraGeometry {
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly verticalFieldOfView: number;
  readonly aspectRatio: number;
  readonly principalPoint: { readonly x: number; readonly y: number };
}

/**
 * Casts a world-space ray for a normalized (0..1, y-down) image coordinate under a perspective
 * pinhole assumption. The camera's local forward axis is -Z per the canonical 3D convention.
 */
export function rayForNormalizedPoint(camera: ResolvedCameraGeometry, normalized: { x: number; y: number }): Ray3D {
  const ndcX = (normalized.x - camera.principalPoint.x) * 2;
  const ndcY = -(normalized.y - camera.principalPoint.y) * 2;
  const halfHeight = Math.tan(camera.verticalFieldOfView / 2);
  const halfWidth = halfHeight * camera.aspectRatio;
  const localDirection = normalizeVector({ x: ndcX * halfWidth, y: ndcY * halfHeight, z: -1 });
  return {
    origin: camera.position,
    direction: normalizeVector(rotateVectorByQuaternion(localDirection, camera.orientation)),
  };
}

/** Projects a world point into normalized (0..1, y-down) image coordinates, or undefined if behind the camera. */
export function projectPoint(
  camera: ResolvedCameraGeometry,
  point: Vec3,
): { readonly x: number; readonly y: number } | undefined {
  const local = rotateVectorByQuaternion(
    subtractVectors(point, camera.position),
    quaternionConjugate(camera.orientation),
  );
  if (local.z >= 0) return undefined;
  const halfHeight = Math.tan(camera.verticalFieldOfView / 2);
  const halfWidth = halfHeight * camera.aspectRatio;
  const ndcX = local.x / -local.z / halfWidth;
  const ndcY = local.y / -local.z / halfHeight;
  return { x: camera.principalPoint.x + ndcX / 2, y: camera.principalPoint.y - ndcY / 2 };
}

export interface TriangulationObservation {
  readonly viewId: string;
  readonly ray: Ray3D;
}

export interface TriangulationResult {
  readonly point: Vec3;
  readonly reprojectionErrors: ReadonlyArray<{ readonly viewId: string; readonly error: number }>;
  readonly residual: number;
}

/**
 * Estimates the 3D point closest (least squares) to a set of rays cast from different views.
 * Minimizes sum ||(I - d d^T)(x - p)||^2 for each ray (origin p, unit direction d), which reduces
 * to the 3x3 linear system sum(I - d d^T) x = sum(I - d d^T) p. Returns undefined for degenerate
 * (parallel or fewer than two) ray sets rather than fabricating a point.
 */
export function triangulateRays(observations: readonly TriangulationObservation[]): TriangulationResult | undefined {
  if (observations.length < 2) return undefined;

  let m00 = 0;
  let m01 = 0;
  let m02 = 0;
  let m11 = 0;
  let m12 = 0;
  let m22 = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;

  for (const observation of observations) {
    const d = observation.ray.direction;
    const p = observation.ray.origin;
    const a00 = 1 - d.x * d.x;
    const a01 = -d.x * d.y;
    const a02 = -d.x * d.z;
    const a11 = 1 - d.y * d.y;
    const a12 = -d.y * d.z;
    const a22 = 1 - d.z * d.z;
    m00 += a00;
    m01 += a01;
    m02 += a02;
    m11 += a11;
    m12 += a12;
    m22 += a22;
    bx += a00 * p.x + a01 * p.y + a02 * p.z;
    by += a01 * p.x + a11 * p.y + a12 * p.z;
    bz += a02 * p.x + a12 * p.y + a22 * p.z;
  }

  const det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02);
  if (Math.abs(det) < 1e-9) return undefined;
  const invDet = 1 / det;

  const point: Vec3 = {
    x: invDet * (bx * (m11 * m22 - m12 * m12) - m01 * (by * m22 - m12 * bz) + m02 * (by * m12 - m11 * bz)),
    y: invDet * (m00 * (by * m22 - bz * m12) - bx * (m01 * m22 - m02 * m12) + m02 * (m01 * bz - by * m02)),
    z: invDet * (m00 * (m11 * bz - m12 * by) - m01 * (m01 * bz - by * m02) + bx * (m01 * m12 - m11 * m02)),
  };

  const reprojectionErrors = observations.map((observation) => {
    const t = dotVectors(subtractVectors(point, observation.ray.origin), observation.ray.direction);
    const closest = addVectors(observation.ray.origin, scaleVector(observation.ray.direction, t));
    return { viewId: observation.viewId, error: vectorLength(subtractVectors(point, closest)) };
  });

  const residual = reprojectionErrors.reduce((sum, entry) => sum + entry.error, 0) / reprojectionErrors.length;

  return { point, reprojectionErrors, residual };
}

/** Euclidean distance, in normalized image space, between an observed and a reprojected point. */
export function imageSpaceReprojectionError(
  observed: { readonly x: number; readonly y: number },
  reprojected: { readonly x: number; readonly y: number } | undefined,
): number | undefined {
  if (!reprojected) return undefined;
  return Math.sqrt((observed.x - reprojected.x) ** 2 + (observed.y - reprojected.y) ** 2);
}
