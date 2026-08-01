import { ActorRefSchema, AssetSchema, EntityIdSchema, type AssetRecord } from "@aevum/document-model";
import { z } from "zod";

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
const IsoDateSchema = z.iso.datetime({ offset: true });
const MimeTypeSchema = z.string().regex(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i);

export const ASSET_METADATA_KEY = "aevum.asset" as const;
export const ASSET_METADATA_VERSION = "1.0.0" as const;

export const AssetStatusSchema = z.enum(["REGISTERED", "PROCESSING", "READY", "QUARANTINED", "FAILED", "ARCHIVED"]);

export const AssetKindSchema = AssetSchema.shape.type;

export const AssetOriginSchema = z.strictObject({
  kind: z.enum(["UPLOAD", "IMPORT", "GENERATED", "DERIVED", "REMOTE", "SYSTEM"]),
  uri: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
});

export const ProcessingStepSchema = z.strictObject({
  operation: z.string().min(1),
  createdAt: IsoDateSchema,
  actor: ActorRefSchema,
  tool: z.string().min(1),
  toolVersion: z.string().min(1),
  inputAssetIds: z.array(EntityIdSchema),
  parameters: JsonObjectSchema,
  seed: z.number().int().optional(),
});

export const AssetProvenanceSchema = z.strictObject({
  origin: AssetOriginSchema,
  importer: ActorRefSchema,
  creator: ActorRefSchema.optional(),
  processingChain: z.array(ProcessingStepSchema),
  parentAssetIds: z.array(EntityIdSchema),
});

export const AssetLicenseSchema = z.strictObject({
  source: z.string().min(1),
  license: z.string().min(1),
  copyright: z.string().min(1).optional(),
  restrictions: z.array(z.string().min(1)),
  commercialUse: z.enum(["ALLOWED", "PROHIBITED", "UNKNOWN"]),
  attributionRequired: z.boolean(),
  redistributionAllowed: z.enum(["ALLOWED", "PROHIBITED", "UNKNOWN"]),
  modificationAllowed: z.enum(["ALLOWED", "PROHIBITED", "UNKNOWN"]),
  embeddingAllowed: z.enum(["ALLOWED", "PROHIBITED", "UNKNOWN"]).optional(),
  expiresAt: IsoDateSchema.optional(),
});

const ImageDetailsSchema = z.strictObject({
  kind: z.literal("IMAGE"),
  alpha: z.boolean(),
  colorProfile: z.string().min(1).optional(),
  exif: JsonObjectSchema,
});
const VideoDetailsSchema = z.strictObject({
  kind: z.literal("VIDEO"),
  fps: z.number().finite().positive(),
  codec: z.string().min(1),
  audioTracks: z.number().int().nonnegative().default(0),
  alpha: z.boolean().default(false),
});
const AudioDetailsSchema = z.strictObject({
  kind: z.literal("AUDIO"),
  codec: z.string().min(1),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().positive(),
});
const FontDetailsSchema = z.strictObject({
  kind: z.literal("FONT"),
  format: z.enum(["WOFF2", "WOFF", "TTF", "OTF"]),
});
const SvgDetailsSchema = z.strictObject({
  kind: z.literal("SVG"),
  sanitized: z.boolean(),
  hasEmbeddedScripts: z.boolean(),
  viewBox: z.string().min(1).optional(),
});
const ModelDetailsSchema = z.strictObject({
  kind: z.enum(["GLB", "GLTF", "FBX", "OBJ", "STL", "USD", "USDZ"]),
  meshes: z.number().int().nonnegative(),
  materials: z.number().int().nonnegative(),
  textures: z.number().int().nonnegative(),
  animations: z.number().int().nonnegative(),
});
const HdriDetailsSchema = z.strictObject({
  kind: z.literal("HDRI"),
  dynamicRangeStops: z.number().finite().nonnegative().optional(),
  colorProfile: z.string().min(1).optional(),
});
const BinaryDetailsSchema = z.strictObject({ kind: z.literal("BINARY"), description: z.string().min(1).optional() });

export const AssetDetailsSchema = z.union([
  ImageDetailsSchema,
  VideoDetailsSchema,
  AudioDetailsSchema,
  FontDetailsSchema,
  SvgDetailsSchema,
  ModelDetailsSchema,
  HdriDetailsSchema,
  BinaryDetailsSchema,
]);

export const DerivativeOperationSchema = z.enum([
  "RESIZED",
  "COMPRESSED",
  "OPTIMIZED",
  "BACKGROUND_REMOVED",
  "SEGMENTED",
  "RELIT",
  "UPSCALED",
  "THUMBNAIL",
  "TEXTURE_VARIANT",
  "WEB_VARIANT",
  "OTHER",
]);

export const DerivativeRecordSchema = z.strictObject({
  originalAssetId: EntityIdSchema,
  operation: DerivativeOperationSchema,
  createdAt: IsoDateSchema,
  parameters: JsonObjectSchema,
});

export const AevumAssetMetadataSchema = z.strictObject({
  schemaVersion: z.literal(ASSET_METADATA_VERSION),
  originalFilename: z.string().min(1),
  createdAt: IsoDateSchema,
  registeredAt: IsoDateSchema,
  status: AssetStatusSchema,
  provenance: AssetProvenanceSchema,
  license: AssetLicenseSchema.optional(),
  details: AssetDetailsSchema,
  derivative: DerivativeRecordSchema.optional(),
});

export const QuarantineIssueSchema = z.strictObject({
  code: z.string().min(1),
  severity: z.enum(["WARNING", "ERROR", "CRITICAL"]),
  message: z.string().min(1),
  detectedBy: z.string().min(1),
});

export const AssetSecurityAssessmentSchema = z
  .strictObject({
    status: z.enum(["PASSED", "QUARANTINED"]),
    inspectedAt: IsoDateSchema,
    inspector: z.string().min(1),
    issues: z.array(QuarantineIssueSchema),
  })
  .superRefine((assessment, context) => {
    if (assessment.status === "QUARANTINED" && assessment.issues.length === 0) {
      context.addIssue({ code: "custom", path: ["issues"], message: "Quarantined assets require at least one issue." });
    }
    if (assessment.status === "PASSED" && assessment.issues.some((issue) => issue.severity !== "WARNING")) {
      context.addIssue({ code: "custom", path: ["issues"], message: "Passed assessments may contain warnings only." });
    }
  });

export const AssetRegistrationInputSchema = z
  .strictObject({
    bytes: z.custom<Uint8Array>((value) => value instanceof Uint8Array, "Expected binary asset bytes."),
    kind: AssetKindSchema,
    originalFilename: z.string().min(1),
    displayName: z.string().min(1).optional(),
    mimeType: MimeTypeSchema,
    sourceUri: z.string().min(1),
    createdAt: IsoDateSchema,
    registeredAt: IsoDateSchema,
    status: AssetStatusSchema.default("REGISTERED"),
    provenance: AssetProvenanceSchema,
    license: AssetLicenseSchema.optional(),
    dimensions: AssetSchema.shape.dimensions,
    details: AssetDetailsSchema,
    derivative: DerivativeRecordSchema.optional(),
    extensions: JsonObjectSchema.default({}),
    security: AssetSecurityAssessmentSchema,
  })
  .superRefine((input, context) => {
    if (input.kind !== input.details.kind) {
      context.addIssue({ code: "custom", path: ["details", "kind"], message: "Asset details must match kind." });
    }
    if (["IMAGE", "VIDEO", "HDRI"].includes(input.kind) && !input.dimensions) {
      context.addIssue({ code: "custom", path: ["dimensions"], message: `${input.kind} dimensions are required.` });
    }
    if (input.kind === "VIDEO" && input.dimensions?.duration === undefined) {
      context.addIssue({ code: "custom", path: ["dimensions", "duration"], message: "Video duration is required." });
    }
    if (input.kind === "AUDIO" && input.dimensions?.duration === undefined) {
      context.addIssue({ code: "custom", path: ["dimensions", "duration"], message: "Audio duration is required." });
    }
    if (input.derivative && input.provenance.parentAssetIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["provenance", "parentAssetIds"],
        message: "Derivatives require parent assets.",
      });
    }
    if (input.derivative && !input.provenance.parentAssetIds.includes(input.derivative.originalAssetId)) {
      context.addIssue({
        code: "custom",
        path: ["provenance", "parentAssetIds"],
        message: "Derivative provenance must include the original asset.",
      });
    }
    if (Date.parse(input.registeredAt) < Date.parse(input.createdAt)) {
      context.addIssue({
        code: "custom",
        path: ["registeredAt"],
        message: "Asset registration cannot predate asset creation.",
      });
    }
  });

export type AssetKind = z.infer<typeof AssetKindSchema>;
export type AssetStatus = z.infer<typeof AssetStatusSchema>;
export type AssetDetails = z.infer<typeof AssetDetailsSchema>;
export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;
export type AssetLicense = z.infer<typeof AssetLicenseSchema>;
export type AevumAssetMetadata = z.infer<typeof AevumAssetMetadataSchema>;
export type AssetRegistrationInput = z.input<typeof AssetRegistrationInputSchema>;
export type ParsedAssetRegistrationInput = z.output<typeof AssetRegistrationInputSchema>;
export type AssetSecurityAssessment = z.infer<typeof AssetSecurityAssessmentSchema>;
export type QuarantineIssue = z.infer<typeof QuarantineIssueSchema>;
export type DerivativeOperation = z.infer<typeof DerivativeOperationSchema>;
export type DerivativeRecord = z.infer<typeof DerivativeRecordSchema>;
export type CanonicalAssetRecord = AssetRecord;
