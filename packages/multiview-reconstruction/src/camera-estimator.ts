import { quaternionFromLookAt, type Vec3 } from "./camera-math.js";
import { diagnostic } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import { deterministicScopedId } from "./deterministic.js";
import { CameraEstimateSchema, type CameraEstimate, type ViewRoleClassification } from "./schemas.js";

export interface CameraEstimatorContext {
  readonly viewId: string;
  readonly role: ViewRoleClassification;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

export interface CameraEstimator {
  readonly id: string;
  readonly version: string;
  estimate(context: CameraEstimatorContext): CameraEstimate;
}

/** Turntable azimuth, in degrees measured from the +Z axis toward +X, assumed for each known role. */
const ROLE_TURNTABLE_AZIMUTH_DEGREES: Partial<Record<ViewRoleClassification["role"], number>> = {
  FRONT: 0,
  THREE_QUARTER_FRONT_RIGHT: 45,
  RIGHT: 90,
  THREE_QUARTER_BACK_RIGHT: 135,
  BACK: 180,
  THREE_QUARTER_BACK_LEFT: 225,
  LEFT: 270,
  THREE_QUARTER_FRONT_LEFT: 315,
};

export interface RoleBasedCameraEstimatorOptions {
  readonly radius?: number;
  readonly verticalFieldOfView?: number;
}

/**
 * A provider-independent, geometrically real (not fixture/fake) camera estimator: it assumes the
 * reference set was captured on a canonical turntable/orbit of the given radius and derives an
 * exact look-at camera pose for FRONT/BACK/LEFT/RIGHT/TOP/BOTTOM/three-quarter roles. This is an
 * explicit ASSUMPTION, not a measurement — confidence is capped well below 1.0 and DETAIL/UNKNOWN
 * roles honestly yield an UNKNOWN camera rather than a fabricated pose.
 */
export function createRoleBasedCameraEstimator(options: RoleBasedCameraEstimatorOptions = {}): CameraEstimator {
  const radius = options.radius ?? 1;
  const verticalFieldOfView = options.verticalFieldOfView ?? Math.PI / 4;

  return Object.freeze({
    id: "role-assumed-turntable",
    version: "1.0.0",
    estimate(context: CameraEstimatorContext): CameraEstimate {
      const aspectRatio = context.imageWidth / context.imageHeight;
      const target: Vec3 = { x: 0, y: 0, z: 0 };

      if (context.role.role === "TOP" || context.role.role === "BOTTOM") {
        const position: Vec3 = { x: 0, y: context.role.role === "TOP" ? radius : -radius, z: 0 };
        const up: Vec3 = { x: 0, y: 0, z: -1 };
        const orientation = quaternionFromLookAt(position, target, up);
        return deepFreeze(
          CameraEstimateSchema.parse({
            id: deterministicScopedId("camera-estimate", { viewId: context.viewId, role: context.role.role }),
            viewId: context.viewId,
            projection: "PERSPECTIVE",
            intrinsics: { verticalFieldOfView, aspectRatio, principalPoint: { x: 0.5, y: 0.5 }, confidence: 0.4 },
            extrinsics: { position, rotation: orientation, target, upVector: up, confidence: 0.4 },
            confidence: 0.4,
            method: "ROLE_ASSUMED_TURNTABLE",
            provenance: {
              source: "CAMERA_ESTIMATOR",
              provider: "role-assumed-turntable",
              providerVersion: "1.0.0",
              sourceViewId: context.viewId,
              confidence: 0.4,
            },
            diagnostics: [],
          }),
        );
      }

      const azimuthDegrees = ROLE_TURNTABLE_AZIMUTH_DEGREES[context.role.role];
      if (azimuthDegrees === undefined) {
        return deepFreeze(
          CameraEstimateSchema.parse({
            id: deterministicScopedId("camera-estimate", { viewId: context.viewId, role: context.role.role }),
            viewId: context.viewId,
            projection: "UNKNOWN",
            intrinsics: { confidence: 0 },
            extrinsics: { confidence: 0 },
            confidence: 0,
            method: "UNKNOWN",
            provenance: {
              source: "CAMERA_ESTIMATOR",
              provider: "role-assumed-turntable",
              providerVersion: "1.0.0",
              sourceViewId: context.viewId,
              confidence: 0,
            },
            diagnostics: [
              diagnostic({
                code: "CAMERA_UNKNOWN",
                severity: "WARNING",
                message: `No turntable pose can be assumed for view role ${context.role.role}.`,
                stage: "CAMERA_ESTIMATION",
                recoverable: true,
                relatedIds: [context.viewId],
              }),
            ],
          }),
        );
      }

      const theta = (azimuthDegrees * Math.PI) / 180;
      const position: Vec3 = { x: radius * Math.sin(theta), y: 0, z: radius * Math.cos(theta) };
      const orientation = quaternionFromLookAt(position, target);
      const roleConfidence = context.role.confidence;
      const cameraConfidence = Math.min(0.6, 0.35 + roleConfidence * 0.25);

      return deepFreeze(
        CameraEstimateSchema.parse({
          id: deterministicScopedId("camera-estimate", { viewId: context.viewId, role: context.role.role }),
          viewId: context.viewId,
          projection: "PERSPECTIVE",
          intrinsics: {
            verticalFieldOfView,
            aspectRatio,
            principalPoint: { x: 0.5, y: 0.5 },
            sensorAssumption: "Assumed narrow-lens pinhole; no real sensor or lens metadata available.",
            confidence: cameraConfidence,
          },
          extrinsics: {
            position,
            rotation: orientation,
            target,
            upVector: { x: 0, y: 1, z: 0 },
            confidence: cameraConfidence,
          },
          confidence: cameraConfidence,
          method: "ROLE_ASSUMED_TURNTABLE",
          provenance: {
            source: "CAMERA_ESTIMATOR",
            provider: "role-assumed-turntable",
            providerVersion: "1.0.0",
            sourceViewId: context.viewId,
            confidence: cameraConfidence,
          },
          diagnostics:
            cameraConfidence < 0.5
              ? [
                  diagnostic({
                    code: "CAMERA_ESTIMATE_LOW_CONFIDENCE",
                    severity: "INFO",
                    message: `Turntable camera assumption for ${context.role.role} has low confidence because the view role itself is uncertain.`,
                    stage: "CAMERA_ESTIMATION",
                    recoverable: true,
                    relatedIds: [context.viewId],
                  }),
                ]
              : [],
        }),
      );
    },
  });
}
