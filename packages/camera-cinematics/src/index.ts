import type { PackageContract } from "@aevum/shared";

export { evaluateCamera, type EvaluateCameraInput } from "./evaluate.js";
export {
  cameraGeometry,
  distance,
  focalLengthForVerticalFieldOfView,
  lookAtQuaternion,
  orbitPosition,
  projectBounds,
  verticalFieldOfView,
} from "./math.js";
export { proposeCanonicalCamera } from "./proposal.js";
export * from "./schemas.js";
export { cameraEntityId, cameraFingerprint, deepFreeze } from "./stable.js";
export { analyzeComposition, validateCinematics, type ValidateCameraInput } from "./validation.js";

export const packageContract: PackageContract = {
  name: "@aevum/camera-cinematics",
  kind: "package",
  responsibility:
    "Professional deterministic camera, composition, shot, and cinematic sequence evaluation and validation.",
  owns: "Lens derivation, target/path/shot resolution, composition measurements, reference-camera proposals, and bounded correction proposals.",
  mustNotOwn:
    "Canonical persistence, animation interpolation, MCP transport, arbitrary Blender execution, lighting state, video compositing, or rendering backends.",
  status: "IMPLEMENTED",
};

export const CAMERA_CINEMATICS_STATUS = packageContract.status;
