import { CameraSchema, EntityIdSchema, TransformSchema, Vector2Schema } from "@aevum/document-model";
import { z } from "zod";

export const CAMERA_CINEMATICS_VERSION = "1.0.0" as const;
const UnitIntervalSchema = z.number().finite().min(0).max(1);
export const CameraDiagnosticSchema = z.strictObject({
  code: z.enum([
    "INVALID_CAMERA",
    "INVALID_LENS",
    "MISSING_TARGET",
    "DEGENERATE_TARGET",
    "INVALID_CLIPPING",
    "SUBJECT_CLIPPED",
    "SUBJECT_OUTSIDE_SAFE_AREA",
    "COMPOSITION_MISMATCH",
    "MISSING_SHOT",
    "SHOT_GAP",
    "SHOT_OVERLAP",
    "BROKEN_TIMELINE",
    "MOTION_DISCONTINUITY",
    "UNSUPPORTED_TRANSITION",
  ]),
  severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]),
  category: z.enum([
    "PROJECTION",
    "LENS",
    "TRANSFORM",
    "TARGET",
    "FRAMING",
    "CLIPPING",
    "COMPOSITION",
    "MOTION",
    "SEQUENCE",
  ]),
  message: z.string().min(1),
  cameraId: EntityIdSchema.optional(),
  shotId: EntityIdSchema.optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  confidence: UnitIntervalSchema,
  recoverable: z.boolean(),
  correctionCategory: z.enum(["POSITION", "TARGET", "FOCAL_LENGTH", "LENS_SHIFT", "FOCUS", "TIMING"]).optional(),
});

export const ResolvedCameraSchema = z.strictObject({
  version: z.literal(CAMERA_CINEMATICS_VERSION),
  camera: CameraSchema,
  effectiveVerticalFieldOfView: z.number().finite().positive().max(Math.PI),
  target: z.strictObject({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }).optional(),
  focusDistance: z.number().finite().nonnegative(),
  transform: TransformSchema,
  sourceShotId: EntityIdSchema.optional(),
  sourceSequenceId: EntityIdSchema.optional(),
  localTime: z.number().finite().nonnegative(),
  transition: z.strictObject({ type: z.enum(["CUT", "DISSOLVE", "FADE"]), progress: UnitIntervalSchema }),
  diagnostics: z.array(CameraDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export const CompositionMeasurementSchema = z.strictObject({
  cameraId: EntityIdSchema,
  subjectNodeId: EntityIdSchema.optional(),
  screenCenter: Vector2Schema,
  coverage: UnitIntervalSchema,
  margin: UnitIntervalSchema,
  clipped: z.boolean(),
  ruleOfThirdsError: z.number().finite().nonnegative(),
  centerError: z.number().finite().nonnegative(),
  diagnostics: z.array(CameraDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export const CameraCorrectionSchema = z.strictObject({
  id: z.string().min(1),
  cameraId: EntityIdSchema,
  shotId: EntityIdSchema.optional(),
  category: z.enum(["POSITION", "TARGET", "FOCAL_LENGTH", "LENS_SHIFT", "FOCUS", "TIMING"]),
  path: z.string().min(1),
  proposedValue: z.unknown(),
  reason: z.string().min(1),
  confidence: UnitIntervalSchema,
  expectedDocumentVersion: z.number().int().positive(),
});

export const CameraValidationReportSchema = z.strictObject({
  version: z.literal(CAMERA_CINEMATICS_VERSION),
  documentId: EntityIdSchema,
  documentVersion: z.number().int().positive(),
  cameraIds: z.array(EntityIdSchema),
  sequenceId: EntityIdSchema.optional(),
  score: UnitIntervalSchema,
  compositionScore: UnitIntervalSchema,
  lensScore: UnitIntervalSchema,
  continuityScore: UnitIntervalSchema,
  diagnostics: z.array(CameraDiagnosticSchema),
  corrections: z.array(CameraCorrectionSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export const CameraProposalSchema = z.strictObject({
  camera: CameraSchema,
  confidence: UnitIntervalSchema,
  evidence: z.array(z.string().min(1)),
  diagnostics: z.array(CameraDiagnosticSchema),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export type CameraDiagnostic = z.infer<typeof CameraDiagnosticSchema>;
export type ResolvedCamera = z.infer<typeof ResolvedCameraSchema>;
export type CompositionMeasurement = z.infer<typeof CompositionMeasurementSchema>;
export type CameraCorrection = z.infer<typeof CameraCorrectionSchema>;
export type CameraValidationReport = z.infer<typeof CameraValidationReportSchema>;
export type CameraProposal = z.infer<typeof CameraProposalSchema>;
