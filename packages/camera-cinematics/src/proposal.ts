import { CameraSchema, type CameraRecord } from "@aevum/document-model";
import type { CameraEstimate } from "@aevum/multiview-reconstruction";
import { focalLengthForVerticalFieldOfView } from "./math.js";
import { CameraProposalSchema, type CameraProposal } from "./schemas.js";
import { cameraEntityId, cameraFingerprint, deepFreeze } from "./stable.js";

export function proposeCanonicalCamera(estimate: CameraEstimate, name = "Matched Camera"): CameraProposal {
  if (
    !estimate.extrinsics.position ||
    !estimate.extrinsics.rotation ||
    !estimate.intrinsics.verticalFieldOfView ||
    estimate.projection === "UNKNOWN"
  ) {
    throw new Error("Camera estimate lacks sufficient geometric evidence for a canonical proposal.");
  }
  const sensor = { width: 36, height: 24, fit: "AUTO" as const };
  const content = {
    viewId: estimate.viewId,
    method: estimate.method,
    position: estimate.extrinsics.position,
    rotation: estimate.extrinsics.rotation,
  };
  const camera: CameraRecord = CameraSchema.parse({
    id: cameraEntityId("camera", content),
    name,
    projection: estimate.projection === "ORTHOGRAPHIC" ? "ORTHOGRAPHIC" : "PERSPECTIVE",
    transform: {
      position: estimate.extrinsics.position,
      rotation: { x: 0, y: 0, z: 0 },
      quaternion: estimate.extrinsics.rotation,
      scale: { x: 1, y: 1, z: 1 },
      skew: { x: 0, y: 0 },
      anchor: { x: 0, y: 0 },
      pivot: { x: 0, y: 0, z: 0 },
      opacity: 1,
      clipping: false,
      maskIds: [],
      coordinateSpace: "WORLD",
    },
    focalLength: focalLengthForVerticalFieldOfView(estimate.intrinsics.verticalFieldOfView, sensor.height),
    verticalFieldOfView: estimate.intrinsics.verticalFieldOfView,
    aspectRatio: estimate.intrinsics.aspectRatio,
    sensor,
    nearClip: 0.01,
    farClip: 10_000,
    depthOfField: { enabled: false, aperture: 2.8, focusDistance: 1, bladeCount: 6 },
    targetingMode: estimate.extrinsics.target ? "LOOK_AT_POINT" : "EXPLICIT_ORIENTATION",
    target: estimate.extrinsics.target,
    upVector: estimate.extrinsics.upVector,
    matchProvenance: {
      sourceViewId: estimate.viewId,
      method: estimate.method,
      confidence: estimate.confidence,
      evidence: estimate.diagnostics.map((entry) => entry.code),
    },
  });
  const body = {
    camera,
    confidence: estimate.confidence,
    evidence: [`view:${estimate.viewId}`, `method:${estimate.method}`],
    diagnostics: [],
  };
  return deepFreeze(CameraProposalSchema.parse({ ...body, fingerprint: cameraFingerprint(body) }));
}
