import type { Bounds3D, CameraRecord, Quaternion } from "@aevum/document-model";
import { mat4, quat, vec3 } from "gl-matrix";

export function calculateLookAtQuaternion(
  position: Readonly<{ x: number; y: number; z: number }>,
  target: Readonly<{ x: number; y: number; z: number }>,
  up: Readonly<{ x: number; y: number; z: number }> = { x: 0, y: 1, z: 0 },
): Quaternion {
  const matrix = mat4.targetTo(
    mat4.create(),
    vec3.fromValues(position.x, position.y, position.z),
    vec3.fromValues(target.x, target.y, target.z),
    vec3.fromValues(up.x, up.y, up.z),
  );
  const rotation = mat4.getRotation(quat.create(), matrix);
  return { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] };
}

export function frameCameraToBounds(camera: CameraRecord, bounds: Bounds3D, padding = 1.2): CameraRecord {
  const radius = Math.max(bounds.radius, 0.000_001) * Math.max(1, padding);
  const verticalFieldOfView = camera.verticalFieldOfView ?? 2 * Math.atan(0.5 / (camera.focalLength ?? 1));
  const distance = camera.projection === "PERSPECTIVE" ? radius / Math.sin(verticalFieldOfView / 2) : radius * 2;
  const position = { x: bounds.center.x, y: bounds.center.y, z: bounds.center.z + distance };
  return {
    ...camera,
    transform: {
      ...camera.transform,
      position,
      quaternion: calculateLookAtQuaternion(position, bounds.center),
    },
    target: bounds.center,
    ...(camera.projection === "ORTHOGRAPHIC"
      ? {
          orthographicSize: radius * 2,
          orthographicBounds: { left: -radius, right: radius, top: radius, bottom: -radius },
        }
      : {}),
  };
}

export function selectCamera(
  cameras: ReadonlyMap<string, CameraRecord>,
  requestedId?: string,
): CameraRecord | undefined {
  if (requestedId) return cameras.get(requestedId);
  return [...cameras.values()].sort((left, right) => left.id.localeCompare(right.id))[0];
}
