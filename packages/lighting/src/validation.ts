import {
  LightingValidationReportSchema,
  type LightingEstimate,
  type LightingValidationReport,
  type ResolvedLighting,
} from "./schemas.js";
import { deepFreeze, lightingFingerprint } from "./stable.js";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function angleDegrees(left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }): number {
  const leftLength = Math.hypot(left.x, left.y, left.z) || 1;
  const rightLength = Math.hypot(right.x, right.y, right.z) || 1;
  const cosine = (left.x * right.x + left.y * right.y + left.z * right.z) / (leftLength * rightLength);
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

function directionFromMetadata(light: ResolvedLighting["lights"][number]) {
  const value = light.metadata.direction;
  if (!value || typeof value !== "object" || Array.isArray(value)) return { x: 0, y: 0, z: -1 };
  const record = value as Record<string, unknown>;
  return {
    x: typeof record.x === "number" ? record.x : 0,
    y: typeof record.y === "number" ? record.y : 0,
    z: typeof record.z === "number" ? record.z : -1,
  };
}

export function validateLighting(input: {
  readonly resolved: ResolvedLighting;
  readonly expected?: LightingEstimate;
  readonly materialIssueCount?: number;
}): LightingValidationReport {
  const { resolved, expected } = input;
  const diagnostics = [...resolved.diagnostics];
  const key = resolved.lights.find((light) => light.metadata.role === "KEY") ?? resolved.lights[0];
  const fill = resolved.lights.find((light) => light.metadata.role === "FILL") ?? resolved.lights[1];
  const directionErrorDegrees = expected && key ? angleDegrees(directionFromMetadata(key), expected.keyDirection) : 0;
  const temperatureErrorKelvin =
    expected && key ? Math.abs((key.temperatureKelvin ?? 6_500) - expected.temperatureKelvin) : 0;
  const actualRatio = key && fill ? key.intensity / Math.max(fill.intensity, 0.001) : 1;
  const intensityRatioError = expected ? Math.abs(actualRatio - expected.keyToFillRatio) / expected.keyToFillRatio : 0;
  const shadowScore = clamp(resolved.shadowLightIds.length > 0 ? 1 : expected?.contactShadow ? 0.35 : 1);
  const reflectionScore = clamp(
    resolved.profile.reflectionMode === "DISABLED"
      ? expected?.reflectionContribution
        ? 1 - expected.reflectionContribution
        : 1
      : resolved.reflectionProbes.length > 0 || resolved.environment
        ? 1
        : 0.4,
  );
  const environmentScore = clamp(resolved.environment ? 1 : expected?.environmentContribution ? 0.35 : 1);
  const directionScore = clamp(1 - directionErrorDegrees / 90);
  const temperatureScore = clamp(1 - temperatureErrorKelvin / 5_000);
  const ratioScore = clamp(1 - intensityRatioError);
  const lightingScore = clamp(
    (directionScore + temperatureScore + ratioScore + shadowScore + reflectionScore + environmentScore) / 6,
  );
  const materialScore = clamp(1 - (input.materialIssueCount ?? 0) * 0.2);
  if ((input.materialIssueCount ?? 0) > 0) {
    diagnostics.push({
      code: "MATERIAL_SEPARATED",
      severity: "WARNING",
      domain: "MATERIAL",
      message: "Material diagnostics are reported separately and do not reduce the lighting score.",
      recoverable: true,
      details: { issueCount: input.materialIssueCount ?? 0 },
    });
  }
  const corrections = [];
  if (expected && key && directionErrorDegrees > 10) {
    diagnostics.push({
      code: "DIRECTION_MISMATCH",
      severity: "WARNING",
      domain: "LIGHTING",
      message: "Key-light direction differs from the reference estimate.",
      entityId: key.id,
      recoverable: true,
    });
    corrections.push({
      entityId: key.id,
      property: "metadata.direction",
      expected: expected.keyDirection,
      actual: directionFromMetadata(key),
      confidence: expected.confidence,
    });
  }
  if (expected && key && temperatureErrorKelvin > 750) {
    diagnostics.push({
      code: "TEMPERATURE_MISMATCH",
      severity: "WARNING",
      domain: "LIGHTING",
      message: "Key-light temperature differs from the reference estimate.",
      entityId: key.id,
      recoverable: true,
    });
    corrections.push({
      entityId: key.id,
      property: "temperatureKelvin",
      expected: expected.temperatureKelvin,
      actual: key.temperatureKelvin ?? null,
      confidence: expected.confidence,
    });
  }
  if (expected && intensityRatioError > 0.25 && fill) {
    diagnostics.push({
      code: "INTENSITY_MISMATCH",
      severity: "WARNING",
      domain: "LIGHTING",
      message: "Key-to-fill intensity ratio differs from the reference estimate.",
      entityId: fill.id,
      recoverable: true,
    });
    corrections.push({
      entityId: fill.id,
      property: "intensity",
      expected: key ? key.intensity / expected.keyToFillRatio : 0,
      actual: fill.intensity,
      confidence: expected.confidence,
    });
  }
  const body = {
    version: "1.0.0" as const,
    valid:
      resolved.lights.length > 0 &&
      diagnostics.every((entry) => entry.severity !== "ERROR" && entry.severity !== "BLOCKING"),
    overallScore: clamp(lightingScore * 0.85 + materialScore * 0.15),
    lightingScore,
    materialScore,
    shadowScore,
    reflectionScore,
    environmentScore,
    measurements: {
      activeLightCount: resolved.lights.length,
      shadowLightCount: resolved.shadowLightIds.length,
      directionErrorDegrees,
      temperatureErrorKelvin,
      intensityRatioError,
      reflectionProbeCount: resolved.reflectionProbes.length,
    },
    diagnostics,
    corrections,
  };
  return deepFreeze(LightingValidationReportSchema.parse({ ...body, fingerprint: lightingFingerprint(body) }));
}
