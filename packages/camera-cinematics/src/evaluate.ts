import { evaluateEasing, evaluateTimeline } from "@aevum/animation-core";
import type { CameraPathRecord, CameraRecord, CanonicalDesignDocument, Transform } from "@aevum/document-model";
import { lookAtQuaternion, orbitPosition, distance, verticalFieldOfView } from "./math.js";
import {
  CAMERA_CINEMATICS_VERSION,
  ResolvedCameraSchema,
  type CameraDiagnostic,
  type ResolvedCamera,
} from "./schemas.js";
import { cameraFingerprint, deepFreeze } from "./stable.js";

export interface EvaluateCameraInput {
  readonly document: CanonicalDesignDocument;
  readonly cameraId?: string;
  readonly sequenceId?: string;
  readonly time: number;
  readonly viewportAspectRatio?: number;
  readonly nodePositions?: Readonly<Record<string, Readonly<{ x: number; y: number; z: number }>>>;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== "object") cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  const final = parts.at(-1);
  if (final) cursor[final] = structuredClone(value);
}

function interpolate(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}

function evaluatePath(
  camera: CameraRecord,
  path: CameraPathRecord,
  progress: number,
  target?: { x: number; y: number; z: number },
): CameraRecord {
  const eased = evaluateEasing(path.easing, progress);
  if (path.type === "ORBIT" && path.orbit && target) {
    const azimuth = interpolate(path.orbit.startAzimuth, path.orbit.endAzimuth, eased);
    const position = orbitPosition(target, path.orbit.radius, azimuth, path.orbit.elevation);
    return {
      ...camera,
      transform: {
        ...camera.transform,
        position,
        quaternion: lookAtQuaternion(position, target, camera.upVector, camera.roll),
      },
      target,
    };
  }
  if (path.type === "DOLLY" && path.startPosition && path.endPosition) {
    const position = {
      x: interpolate(path.startPosition.x, path.endPosition.x, eased),
      y: interpolate(path.startPosition.y, path.endPosition.y, eased),
      z: interpolate(path.startPosition.z, path.endPosition.z, eased),
    };
    return {
      ...camera,
      transform: {
        ...camera.transform,
        position,
        ...(target ? { quaternion: lookAtQuaternion(position, target, camera.upVector, camera.roll) } : {}),
      },
      ...(target ? { target } : {}),
    };
  }
  return camera;
}

export function evaluateCamera(input: EvaluateCameraInput): ResolvedCamera {
  const sequence = input.sequenceId ? input.document.cinematicSequences[input.sequenceId] : undefined;
  const shots =
    sequence?.shotIds.flatMap((id) => (input.document.cinematicShots[id] ? [input.document.cinematicShots[id]] : [])) ??
    [];
  const shot = shots.find((candidate, index) => {
    const end = candidate.startTime + candidate.duration;
    return input.time >= candidate.startTime && (input.time < end || (index === shots.length - 1 && input.time <= end));
  });
  const cameraId = shot?.cameraId ?? input.cameraId;
  const source = cameraId ? input.document.cameras[cameraId] : undefined;
  if (!source) throw new Error("A valid camera or active cinematic shot is required.");
  let camera = structuredClone(source) as CameraRecord;
  const diagnostics: CameraDiagnostic[] = [];
  const localTime = shot ? Math.max(0, Math.min(shot.duration, input.time - shot.startTime)) : input.time;
  const timelineId = shot?.timelineId;
  if (timelineId) {
    const timeline = input.document.timelines[timelineId];
    if (timeline) {
      const evaluation = evaluateTimeline(timeline, { time: localTime, timelineRegistry: input.document.timelines });
      for (const [path, value] of Object.entries(evaluation.targetValues[camera.id] ?? {})) {
        setPath(camera as unknown as Record<string, unknown>, path, value);
      }
    }
  }
  const path = shot?.cameraPathId ? input.document.cameraPaths[shot.cameraPathId] : undefined;
  const pathTarget = path?.targetNodeId ? input.nodePositions?.[path.targetNodeId] : path?.target;
  if (path) camera = evaluatePath(camera, path, shot ? localTime / shot.duration : 0, pathTarget);
  const target = camera.targetNodeId ? input.nodePositions?.[camera.targetNodeId] : camera.target;
  if (["LOOK_AT_NODE", "TRACKED_NODE"].includes(camera.targetingMode) && !target) {
    diagnostics.push({
      code: "MISSING_TARGET",
      severity: "ERROR",
      category: "TARGET",
      message: `Camera target ${camera.targetNodeId ?? ""} is unavailable at evaluation time.`,
      cameraId: camera.id,
      confidence: 1,
      recoverable: true,
      correctionCategory: "TARGET",
    });
  } else if (target) {
    if (distance(camera.transform.position, target) < 1e-9) {
      diagnostics.push({
        code: "DEGENERATE_TARGET",
        severity: "BLOCKING",
        category: "TARGET",
        message: "Camera position and target are coincident.",
        cameraId: camera.id,
        confidence: 1,
        recoverable: true,
        correctionCategory: "POSITION",
      });
    } else {
      camera.transform.quaternion = lookAtQuaternion(camera.transform.position, target, camera.upVector, camera.roll);
    }
  }
  if (input.viewportAspectRatio) camera.aspectRatio = input.viewportAspectRatio;
  const focusTarget = camera.depthOfField.focusTargetNodeId
    ? input.nodePositions?.[camera.depthOfField.focusTargetNodeId]
    : undefined;
  const focusDistance = focusTarget
    ? distance(camera.transform.position, focusTarget)
    : camera.depthOfField.focusDistance;
  camera.depthOfField = { ...camera.depthOfField, focusDistance };
  const transitionDuration = shot?.transitionIn.duration ?? 0;
  const transitionProgress = transitionDuration > 0 ? Math.min(1, localTime / transitionDuration) : 1;
  const body = {
    version: CAMERA_CINEMATICS_VERSION,
    camera,
    effectiveVerticalFieldOfView: verticalFieldOfView(camera),
    ...(target ? { target } : {}),
    focusDistance,
    transform: camera.transform as Transform,
    ...(shot ? { sourceShotId: shot.id } : {}),
    ...(sequence ? { sourceSequenceId: sequence.id } : {}),
    localTime,
    transition: { type: shot?.transitionIn.type ?? "CUT", progress: transitionProgress },
    diagnostics,
  };
  return deepFreeze(ResolvedCameraSchema.parse({ ...body, fingerprint: cameraFingerprint(body) }));
}
