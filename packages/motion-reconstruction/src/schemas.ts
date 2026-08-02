import { CommandSchema } from "@aevum/command-engine";
import { ActorRefSchema, EntityIdSchema, JsonValueSchema, TimelineSchema, Vector3Schema } from "@aevum/document-model";
import { z } from "zod";

export const MOTION_TASK_VERSION = "1.0.0" as const;
export const MOTION_ANALYSIS_VERSION = "1.0.0" as const;
export const MOTION_PROPOSAL_VERSION = "1.0.0" as const;
export const MOTION_REPORT_VERSION = "1.0.0" as const;

const IsoDateSchema = z.iso.datetime({ offset: true });
const UnitIntervalSchema = z.number().finite().min(0).max(1);
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ScopedIdSchema = (scope: string) => z.string().regex(new RegExp(`^${scope}:[0-9a-f]{32}$`));

export const MotionInputFormatSchema = z.enum(["MP4", "MOV", "WEBM", "GIF", "IMAGE_SEQUENCE"]);
export const MotionPropertySchema = z.enum(["POSITION", "ROTATION", "SCALE", "OPACITY", "VISIBILITY", "CAMERA"]);
export const CameraMotionSchema = z.enum(["PAN", "ORBIT", "DOLLY", "ZOOM", "CRANE", "STATIC"]);
export const MotionDiagnosticCodeSchema = z.enum([
  "MISSING_FRAME",
  "INVALID_TIMING",
  "MISSING_TARGET",
  "BROKEN_TRACK",
  "INVALID_PATH",
  "IMPOSSIBLE_INTERPOLATION",
  "UNSUPPORTED_MOTION",
  "LOW_CONFIDENCE",
  "TIMELINE_INVALID",
  "COMMAND_PLAN_INVALID",
]);
export const MotionDiagnosticSchema = z.strictObject({
  code: MotionDiagnosticCodeSchema,
  severity: z.enum(["INFO", "WARNING", "ERROR"]),
  message: z.string().min(1),
  stage: z.string().min(1),
  targetId: EntityIdSchema.optional(),
  frameIndexes: z.array(z.number().int().nonnegative()),
  path: z.string().min(1).optional(),
  recoverable: z.boolean(),
});

export const MotionTargetSchema = z.strictObject({
  targetId: EntityIdSchema,
  targetKind: z.enum(["NODE", "CAMERA"]),
  properties: z.array(MotionPropertySchema).min(1),
});
export const MotionCommandIntentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("CREATE") }),
  z.strictObject({ type: z.enum(["UPDATE", "DELETE"]), timelineId: EntityIdSchema }),
]);
export const MotionTaskSchema = z
  .strictObject({
    id: ScopedIdSchema("motion-task"),
    taskVersion: z.literal(MOTION_TASK_VERSION),
    projectId: EntityIdSchema,
    documentId: EntityIdSchema,
    expectedDocumentVersion: z.number().int().positive(),
    sourceAssetIds: z.array(EntityIdSchema).min(1),
    sourceFormat: MotionInputFormatSchema,
    targets: z.array(MotionTargetSchema).min(1),
    commandIntent: MotionCommandIntentSchema,
    timelineName: z.string().trim().min(1).max(255),
    frameRate: z.number().finite().positive().max(240),
    minimumConfidence: UnitIntervalSchema,
    keyframeTolerance: z.number().finite().positive(),
    maximumDeltaPerSecond: z.number().finite().positive(),
    deterministicSeed: z.number().int().nonnegative(),
    createdAt: IsoDateSchema,
    createdBy: ActorRefSchema,
  })
  .superRefine((task, context) => {
    if (new Set(task.sourceAssetIds).size !== task.sourceAssetIds.length) {
      context.addIssue({
        code: "custom",
        path: ["sourceAssetIds"],
        message: "Motion source asset IDs must be unique.",
      });
    }
    if (task.sourceFormat === "IMAGE_SEQUENCE" && task.sourceAssetIds.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["sourceAssetIds"],
        message: "Image-sequence tasks require at least two distinct source assets.",
      });
    }
    if (task.sourceFormat !== "IMAGE_SEQUENCE" && task.sourceAssetIds.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["sourceAssetIds"],
        message: "Video and GIF tasks require exactly one source asset.",
      });
    }
  });

export const FrameObservationSchema = z.strictObject({
  targetId: EntityIdSchema,
  targetKind: z.enum(["NODE", "CAMERA"]),
  position: Vector3Schema.optional(),
  rotation: Vector3Schema.optional(),
  scale: Vector3Schema.optional(),
  opacity: UnitIntervalSchema.optional(),
  visible: z.boolean().optional(),
  focalLength: z.number().finite().positive().optional(),
  confidence: UnitIntervalSchema,
  evidence: z.array(z.string().min(1)).min(1),
});
export const MotionFrameSchema = z.strictObject({
  index: z.number().int().nonnegative(),
  time: z.number().finite().nonnegative(),
  observations: z.array(FrameObservationSchema),
});
export const MotionFrameSequenceSchema = z.strictObject({
  id: ScopedIdSchema("frame-sequence"),
  adapterId: z.string().min(1),
  adapterVersion: z.string().min(1),
  sourceAssetIds: z.array(EntityIdSchema).min(1),
  format: MotionInputFormatSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frameRate: z.number().finite().positive(),
  duration: z.number().finite().nonnegative(),
  frames: z.array(MotionFrameSchema).min(1),
});

export const MotionSampleSchema = z.strictObject({
  frameIndex: z.number().int().nonnegative(),
  time: z.number().finite().nonnegative(),
  value: JsonValueSchema,
  confidence: UnitIntervalSchema,
  evidence: z.array(z.string().min(1)),
});
export const MotionTrackDetectionSchema = z.strictObject({
  id: ScopedIdSchema("motion-track"),
  targetId: EntityIdSchema,
  targetKind: z.enum(["NODE", "CAMERA"]),
  property: MotionPropertySchema,
  propertyPath: z.string().min(1),
  valueType: z.enum(["NUMBER", "VECTOR", "BOOLEAN"]),
  samples: z.array(MotionSampleSchema).min(1),
  sourceFrames: z.array(z.number().int().nonnegative()).min(1),
  confidence: UnitIntervalSchema,
  evidence: z.array(z.string().min(1)),
  diagnostics: z.array(MotionDiagnosticSchema),
});
export const CameraMotionDetectionSchema = z.strictObject({
  cameraId: EntityIdSchema,
  motion: CameraMotionSchema,
  confidence: UnitIntervalSchema,
  sourceFrames: z.array(z.number().int().nonnegative()).min(1),
  evidence: z.array(z.string().min(1)),
});
export const MotionAnalysisSchema = z.strictObject({
  id: ScopedIdSchema("motion-analysis"),
  analysisVersion: z.literal(MOTION_ANALYSIS_VERSION),
  taskId: ScopedIdSchema("motion-task"),
  frameSequenceId: ScopedIdSchema("frame-sequence"),
  duration: z.number().finite().nonnegative(),
  frameRate: z.number().finite().positive(),
  tracks: z.array(MotionTrackDetectionSchema),
  cameraMotions: z.array(CameraMotionDetectionSchema),
  diagnostics: z.array(MotionDiagnosticSchema),
  confidence: UnitIntervalSchema,
  analysisFingerprint: FingerprintSchema,
});

export const DetectedKeyframeSchema = z.strictObject({
  id: ScopedIdSchema("detected-keyframe"),
  trackId: ScopedIdSchema("motion-track"),
  time: z.number().finite().nonnegative(),
  value: JsonValueSchema,
  reason: z.enum(["START", "END", "LINEAR", "EASING_CHANGE", "STOP", "DIRECTION_CHANGE", "VISIBILITY_CHANGE"]),
  confidence: UnitIntervalSchema,
  sourceFrames: z.array(z.number().int().nonnegative()).min(1),
  evidence: z.array(z.string().min(1)),
});
export const KeyframeDetectionResultSchema = z.strictObject({
  id: ScopedIdSchema("keyframe-detection"),
  analysisId: ScopedIdSchema("motion-analysis"),
  keyframes: z.array(DetectedKeyframeSchema),
  diagnostics: z.array(MotionDiagnosticSchema),
  fingerprint: FingerprintSchema,
});

export const MotionCommandPlanSchema = z.strictObject({
  id: ScopedIdSchema("motion-command-plan"),
  transactionId: z.string().min(1),
  action: z.enum(["CREATE", "UPDATE", "DELETE"]),
  commands: z.array(CommandSchema).length(1),
  fingerprint: FingerprintSchema,
});
export const TimelineProposalSchema = z.strictObject({
  id: ScopedIdSchema("timeline-proposal"),
  proposalVersion: z.literal(MOTION_PROPOSAL_VERSION),
  taskId: ScopedIdSchema("motion-task"),
  analysisId: ScopedIdSchema("motion-analysis"),
  keyframeDetectionId: ScopedIdSchema("keyframe-detection"),
  action: z.enum(["CREATE", "UPDATE", "DELETE"]),
  timeline: TimelineSchema.optional(),
  commandPlan: MotionCommandPlanSchema,
  confidence: UnitIntervalSchema,
  diagnostics: z.array(MotionDiagnosticSchema),
  proposalFingerprint: FingerprintSchema,
});

export const MotionValidationSchema = z.strictObject({
  success: z.boolean(),
  score: UnitIntervalSchema,
  diagnostics: z.array(MotionDiagnosticSchema),
  fingerprint: FingerprintSchema,
});
export const MotionRuntimeSampleSchema = z.strictObject({
  time: z.number().finite().nonnegative(),
  evaluationFingerprint: FingerprintSchema,
  targetValues: z.record(z.string(), z.record(z.string(), JsonValueSchema)),
});
export const MotionReportSchema = z.strictObject({
  id: ScopedIdSchema("motion-report"),
  reportVersion: z.literal(MOTION_REPORT_VERSION),
  createdAt: IsoDateSchema,
  taskId: ScopedIdSchema("motion-task"),
  analysisId: ScopedIdSchema("motion-analysis"),
  proposalId: ScopedIdSchema("timeline-proposal"),
  sourceAssetIds: z.array(EntityIdSchema),
  sourceFormat: MotionInputFormatSchema,
  duration: z.number().finite().nonnegative(),
  frameRate: z.number().finite().positive(),
  counts: z.strictObject({
    frames: z.number().int().nonnegative(),
    tracks: z.number().int().nonnegative(),
    keyframes: z.number().int().nonnegative(),
  }),
  cameraMotions: z.array(CameraMotionDetectionSchema),
  confidence: UnitIntervalSchema,
  validation: MotionValidationSchema,
  runtimeSamples: z.array(MotionRuntimeSampleSchema),
  diagnostics: z.array(MotionDiagnosticSchema),
  status: z.enum(["VALIDATED", "REVIEW_REQUIRED", "FAILED"]),
  reportFingerprint: FingerprintSchema,
});

export type MotionTask = z.infer<typeof MotionTaskSchema>;
export type MotionTaskInput = Omit<z.input<typeof MotionTaskSchema>, "id" | "taskVersion"> & { readonly id?: string };
export type MotionFrameSequence = z.infer<typeof MotionFrameSequenceSchema>;
export type FrameObservation = z.infer<typeof FrameObservationSchema>;
export type MotionDiagnostic = z.infer<typeof MotionDiagnosticSchema>;
export type MotionTrackDetection = z.infer<typeof MotionTrackDetectionSchema>;
export type MotionAnalysis = z.infer<typeof MotionAnalysisSchema>;
export type CameraMotionDetection = z.infer<typeof CameraMotionDetectionSchema>;
export type DetectedKeyframe = z.infer<typeof DetectedKeyframeSchema>;
export type KeyframeDetectionResult = z.infer<typeof KeyframeDetectionResultSchema>;
export type TimelineProposal = z.infer<typeof TimelineProposalSchema>;
export type MotionCommandPlan = z.infer<typeof MotionCommandPlanSchema>;
export type MotionValidation = z.infer<typeof MotionValidationSchema>;
export type MotionRuntimeSample = z.infer<typeof MotionRuntimeSampleSchema>;
export type MotionReport = z.infer<typeof MotionReportSchema>;
