import type { Bounds3D, CameraRecord, Quaternion } from "@aevum/document-model";
import {
  projectPoint,
  quaternionFromLookAt,
  type ResolvedCameraGeometry,
  type Vec3,
} from "@aevum/multiview-reconstruction";

export function verticalFieldOfView(camera: CameraRecord): number {
  if (camera.verticalFieldOfView) return camera.verticalFieldOfView;
  if (camera.focalLength) return 2 * Math.atan(camera.sensor.height / (2 * camera.focalLength));
  return Math.PI / 4;
}

export function focalLengthForVerticalFieldOfView(verticalFov: number, sensorHeight: number): number {
  return sensorHeight / (2 * Math.tan(verticalFov / 2));
}

export function cameraGeometry(camera: CameraRecord): ResolvedCameraGeometry {
  return {
    position: camera.transform.position,
    orientation: camera.transform.quaternion ?? eulerToQuaternion(camera.transform.rotation),
    verticalFieldOfView: verticalFieldOfView(camera),
    aspectRatio: camera.framing.outputAspectRatio ?? camera.aspectRatio ?? camera.sensor.width / camera.sensor.height,
    principalPoint: { x: 0.5 + camera.lensShift.x, y: 0.5 - camera.lensShift.y },
  };
}

export function eulerToQuaternion(rotation: Vec3): Quaternion {
  const cx = Math.cos(rotation.x / 2);
  const sx = Math.sin(rotation.x / 2);
  const cy = Math.cos(rotation.y / 2);
  const sy = Math.sin(rotation.y / 2);
  const cz = Math.cos(rotation.z / 2);
  const sz = Math.sin(rotation.z / 2);
  return {
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  };
}

export function lookAtQuaternion(position: Vec3, target: Vec3, up: Vec3, roll = 0): Quaternion {
  const base = quaternionFromLookAt(position, target, up);
  if (Math.abs(roll) < 1e-12) return base;
  const half = roll / 2;
  const localRoll: Quaternion = { x: 0, y: 0, z: -Math.sin(half), w: Math.cos(half) };
  return multiplyQuaternion(base, localRoll);
}

function multiplyQuaternion(a: Quaternion, b: Quaternion): Quaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function orbitPosition(target: Vec3, radius: number, azimuth: number, elevation: number): Vec3 {
  const horizontal = radius * Math.cos(elevation);
  return {
    x: target.x + horizontal * Math.sin(azimuth),
    y: target.y + radius * Math.sin(elevation),
    z: target.z + horizontal * Math.cos(azimuth),
  };
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function projectBounds(
  camera: CameraRecord,
  bounds: Bounds3D,
): { center: { x: number; y: number }; coverage: number; clipped: boolean } {
  const geometry = cameraGeometry(camera);
  const corners = [
    { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
    { x: bounds.min.x, y: bounds.min.y, z: bounds.max.z },
    { x: bounds.min.x, y: bounds.max.y, z: bounds.min.z },
    { x: bounds.min.x, y: bounds.max.y, z: bounds.max.z },
    { x: bounds.max.x, y: bounds.min.y, z: bounds.min.z },
    { x: bounds.max.x, y: bounds.min.y, z: bounds.max.z },
    { x: bounds.max.x, y: bounds.max.y, z: bounds.min.z },
    { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
  ].map((point) => projectPoint(geometry, point));
  if (corners.some((point) => !point)) return { center: { x: 0.5, y: 0.5 }, coverage: 1, clipped: true };
  const points = corners.filter((point): point is { x: number; y: number } => Boolean(point));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    coverage: Math.min(1, Math.max(0, (maxX - minX) * (maxY - minY))),
    clipped: minX < 0 || maxX > 1 || minY < 0 || maxY > 1,
  };
}
