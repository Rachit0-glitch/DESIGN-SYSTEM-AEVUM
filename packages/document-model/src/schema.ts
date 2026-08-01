import { z } from "zod";
import { EntityIdSchema } from "./ids.js";

export const CURRENT_SCHEMA_VERSION = "1.1.0" as const;
export const CURRENT_MIGRATION_VERSION = 1 as const;

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
const IsoDateSchema = z.iso.datetime({ offset: true });
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/, "Expected a semantic version");
const NonNegativeSchema = z.number().finite().nonnegative();
const UnitIntervalSchema = z.number().finite().min(0).max(1);

export const ActorRefSchema = z.strictObject({
  id: z.string().min(1),
  type: z.enum(["USER", "MCP_AGENT", "SYSTEM", "WORKER", "PLUGIN"]),
  displayName: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
});

export const Vector2Schema = z.strictObject({ x: z.number().finite(), y: z.number().finite() });
export const Vector3Schema = Vector2Schema.extend({ z: z.number().finite() });
export const ColorSchema = z.strictObject({
  r: UnitIntervalSchema,
  g: UnitIntervalSchema,
  b: UnitIntervalSchema,
  a: UnitIntervalSchema.default(1),
  colorSpace: z.enum(["SRGB", "LINEAR_SRGB", "DISPLAY_P3", "ACESCG", "REC709", "REC2020"]),
});

export const LengthSchema = z.strictObject({
  value: z.number().finite(),
  unit: z.enum(["PX", "REM", "EM", "PERCENT", "VW", "VH", "MM", "CM", "M", "IN", "PT", "WORLD_UNIT"]),
  mode: z.enum(["FIXED", "HUG", "FILL", "AUTO", "FLUID"]).optional(),
});

export const TransformSchema = z.strictObject({
  position: Vector3Schema,
  rotation: Vector3Schema,
  scale: Vector3Schema,
  skew: Vector2Schema,
  anchor: Vector2Schema,
  pivot: Vector3Schema,
  opacity: UnitIntervalSchema,
  clipping: z.boolean(),
  maskIds: z.array(EntityIdSchema),
  coordinateSpace: z.enum(["LOCAL", "PARENT", "WORLD", "VIEWPORT", "SCREEN"]),
});

export const DimensionsSchema = z.strictObject({
  width: LengthSchema,
  height: LengthSchema,
  depth: LengthSchema.optional(),
  minWidth: LengthSchema.optional(),
  maxWidth: LengthSchema.optional(),
  minHeight: LengthSchema.optional(),
  maxHeight: LengthSchema.optional(),
  aspectRatio: z.number().finite().positive().optional(),
});

const ConstraintsSchema = z.strictObject({
  horizontal: z.enum(["LEFT", "RIGHT", "CENTER", "SCALE", "STRETCH", "FIXED"]).optional(),
  vertical: z.enum(["TOP", "BOTTOM", "CENTER", "SCALE", "STRETCH", "FIXED"]).optional(),
  depth: z.enum(["FRONT", "BACK", "CENTER", "SCALE", "FIXED"]).optional(),
  aspectRatioLocked: z.boolean().optional(),
  maintainProportions: z.boolean().optional(),
  rules: z.array(z.strictObject({ id: z.string().min(1), expression: z.string().min(1) })).optional(),
});

const AbsoluteLayoutSchema = z.strictObject({ type: z.literal("ABSOLUTE") });
const FlexLayoutSchema = z.strictObject({
  type: z.literal("FLEX"),
  direction: z.enum(["ROW", "COLUMN"]),
  wrap: z.enum(["NO_WRAP", "WRAP", "WRAP_REVERSE"]),
  gap: LengthSchema,
  justifyContent: z.enum(["START", "CENTER", "END", "SPACE_BETWEEN", "SPACE_AROUND", "SPACE_EVENLY"]),
  alignItems: z.enum(["START", "CENTER", "END", "STRETCH", "BASELINE"]),
});
const GridTrackSchema = z.strictObject({
  size: LengthSchema,
  name: z.string().min(1).optional(),
});
const GridLayoutSchema = z.strictObject({
  type: z.literal("GRID"),
  columns: z.array(GridTrackSchema).min(1),
  rows: z.array(GridTrackSchema),
  gap: LengthSchema,
  autoFlow: z.enum(["ROW", "COLUMN", "DENSE"]).optional(),
});
const ConstraintLayoutSchema = z.strictObject({
  type: z.literal("CONSTRAINT"),
  solver: z.enum(["LINEAR", "CASSOWARY", "CUSTOM"]),
  rules: z.array(z.strictObject({ id: z.string().min(1), expression: z.string().min(1) })),
});
const AutoLayoutSchema = z.strictObject({
  type: z.literal("AUTO_LAYOUT"),
  direction: z.enum(["HORIZONTAL", "VERTICAL"]),
  gap: LengthSchema,
  padding: z.strictObject({ top: LengthSchema, right: LengthSchema, bottom: LengthSchema, left: LengthSchema }),
});
export const LayoutSchema = z.discriminatedUnion("type", [
  AbsoluteLayoutSchema,
  FlexLayoutSchema,
  GridLayoutSchema,
  ConstraintLayoutSchema,
  AutoLayoutSchema,
]);

const ResponsiveOverrideSchema = z.strictObject({
  visible: z.boolean().optional(),
  transform: TransformSchema.partial().optional(),
  dimensions: DimensionsSchema.partial().optional(),
  layout: LayoutSchema.optional(),
  assetId: EntityIdSchema.optional(),
  customData: JsonObjectSchema.optional(),
});
export const ResponsiveSchema = z.strictObject({
  breakpoints: z.record(z.string(), ResponsiveOverrideSchema),
  orientations: z.partialRecord(z.enum(["PORTRAIT", "LANDSCAPE"]), ResponsiveOverrideSchema).optional(),
});

const NodeMetadataSchema = z.strictObject({
  tags: z.array(z.string().min(1)),
  description: z.string().optional(),
  customData: JsonObjectSchema,
});
export const SourceReferenceLinkSchema = z.strictObject({
  referenceId: EntityIdSchema,
  regionId: z.string().min(1).optional(),
  confidence: UnitIntervalSchema,
  relationship: z.enum([
    "RECONSTRUCTED_FROM",
    "STYLE_MATCH",
    "ASSET_EXTRACTED_FROM",
    "CAMERA_MATCH",
    "MOTION_MATCH",
    "MATERIAL_MATCH",
    "LIGHTING_MATCH",
  ]),
});

const BaseNodeShape = {
  id: EntityIdSchema,
  name: z.string().min(1),
  parentId: EntityIdSchema.nullable(),
  childIds: z.array(EntityIdSchema),
  visible: z.boolean(),
  locked: z.boolean(),
  transform: TransformSchema,
  dimensions: DimensionsSchema.optional(),
  constraints: ConstraintsSchema.optional(),
  responsive: ResponsiveSchema.optional(),
  sourceLinks: z.array(SourceReferenceLinkSchema),
  metadata: NodeMetadataSchema,
};

const PageNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("PAGE"),
  pageKind: z.enum(["WEB", "MOBILE", "POSTER", "CANVA_PAGE", "SCENE", "CUSTOM"]),
  viewportId: EntityIdSchema.optional(),
});
const FrameNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("FRAME"),
  layout: LayoutSchema,
  semanticRole: z.string().optional(),
});
const GroupNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("GROUP"),
  isolation: z.boolean(),
  passThroughBlend: z.boolean(),
});

export const TextStyleSchema = z.strictObject({
  fontAssetId: EntityIdSchema.optional(),
  fontFamily: z.string().min(1),
  fallbackFamilies: z.array(z.string().min(1)),
  fontMatchStatus: z.enum(["EXACT", "LIKELY_MATCH", "CLOSE_SUBSTITUTE", "UNKNOWN", "OUTLINED_FROM_REFERENCE"]),
  size: LengthSchema,
  lineHeight: z.union([LengthSchema, z.strictObject({ multiplier: z.number().finite().positive() })]),
  letterSpacing: LengthSchema,
  weight: z.number().int().min(1).max(1000),
  style: z.enum(["NORMAL", "ITALIC", "OBLIQUE"]),
  variableAxes: z.record(z.string(), z.number().finite()),
  openTypeFeatures: z.record(z.string(), z.union([z.boolean(), z.number().finite()])),
});
const ParagraphStyleSchema = z.strictObject({
  alignment: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFY"]),
  verticalAlignment: z.enum(["TOP", "CENTER", "BOTTOM"]),
  direction: z.enum(["LTR", "RTL", "AUTO"]),
  paragraphSpacingBefore: LengthSchema,
  paragraphSpacingAfter: LengthSchema,
  firstLineIndent: LengthSchema,
  hangingIndent: LengthSchema,
});
const TextNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("TEXT"),
  content: z.string(),
  runs: z.array(
    z.strictObject({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      style: TextStyleSchema,
    }),
  ),
  paragraphStyle: ParagraphStyleSchema,
});
const ShapeNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("SHAPE"),
  shapeType: z.enum(["RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "LINE", "ARC", "CUSTOM"]),
  geometry: JsonObjectSchema,
  fillTokenId: EntityIdSchema.optional(),
  strokeTokenId: EntityIdSchema.optional(),
});
const AssetNodeFields = {
  assetId: EntityIdSchema,
  crop: z
    .strictObject({
      x: UnitIntervalSchema,
      y: UnitIntervalSchema,
      width: UnitIntervalSchema,
      height: UnitIntervalSchema,
    })
    .optional(),
};
const ImageNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("IMAGE"),
  ...AssetNodeFields,
  objectFit: z.enum(["FILL", "CONTAIN", "COVER", "NONE", "SCALE_DOWN"]),
});
const VideoNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("VIDEO"),
  ...AssetNodeFields,
  posterAssetId: EntityIdSchema.optional(),
  playback: z.strictObject({
    autoplay: z.boolean(),
    loop: z.boolean(),
    muted: z.boolean(),
    startTime: NonNegativeSchema,
    playbackRate: z.number().finite().positive(),
  }),
});
const SvgNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("SVG"),
  assetId: EntityIdSchema.optional(),
  inlineSource: z.string().optional(),
  sanitized: z.literal(true),
  optimized: z.boolean(),
});
const VectorNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("VECTOR"),
  paths: z.array(z.strictObject({ data: z.string().min(1), closed: z.boolean() })),
  fillRule: z.enum(["NONZERO", "EVENODD"]),
});
const CanvasNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("CANVAS_LAYER"),
  contentAssetId: EntityIdSchema.optional(),
  resolution: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }),
});
const WebGlNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("WEBGL_LAYER"),
  sceneNodeId: EntityIdSchema.optional(),
  fallbackAssetId: EntityIdSchema.optional(),
});
const ComponentNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("COMPONENT"),
  componentId: EntityIdSchema,
});
const ComponentInstanceNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("COMPONENT_INSTANCE"),
  componentId: EntityIdSchema,
  variantId: EntityIdSchema.optional(),
  overrides: z.record(z.string(), JsonValueSchema),
});
const Scene3DNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("SCENE_3D"),
  activeCameraId: EntityIdSchema.optional(),
  lightIds: z.array(EntityIdSchema),
  environmentAssetId: EntityIdSchema.optional(),
});
const Model3DNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("MODEL_3D"),
  sourceAssetId: EntityIdSchema.optional(),
  meshIds: z.array(EntityIdSchema),
  realWorldScale: z
    .strictObject({ value: z.number().finite().positive(), unit: z.enum(["MM", "CM", "M", "IN", "WORLD_UNIT"]) })
    .optional(),
});
const Mesh3DNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("MESH_3D"),
  geometryAssetId: EntityIdSchema,
  materialIds: z.array(EntityIdSchema),
  topology: z.strictObject({
    vertices: z.number().int().nonnegative(),
    faces: z.number().int().nonnegative(),
    triangles: z.number().int().nonnegative(),
    manifold: z.boolean(),
  }),
  castShadow: z.boolean(),
  receiveShadow: z.boolean(),
});

export const DesignNodeSchema = z.discriminatedUnion("type", [
  PageNodeSchema,
  FrameNodeSchema,
  GroupNodeSchema,
  TextNodeSchema,
  ShapeNodeSchema,
  ImageNodeSchema,
  VideoNodeSchema,
  SvgNodeSchema,
  VectorNodeSchema,
  CanvasNodeSchema,
  WebGlNodeSchema,
  ComponentNodeSchema,
  ComponentInstanceNodeSchema,
  Scene3DNodeSchema,
  Model3DNodeSchema,
  Mesh3DNodeSchema,
]);

export const AssetSchema = z.strictObject({
  id: EntityIdSchema,
  type: z.enum([
    "IMAGE",
    "VIDEO",
    "FONT",
    "AUDIO",
    "SVG",
    "HDRI",
    "GLB",
    "GLTF",
    "FBX",
    "OBJ",
    "STL",
    "USD",
    "USDZ",
    "BINARY",
  ]),
  name: z.string().min(1),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  source: z.strictObject({
    kind: z.enum(["UPLOAD", "GENERATED", "DERIVED", "REMOTE"]),
    uri: z.string().min(1),
    originalAssetId: EntityIdSchema.optional(),
  }),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  dimensions: z
    .strictObject({
      width: NonNegativeSchema,
      height: NonNegativeSchema,
      depth: NonNegativeSchema.optional(),
      duration: NonNegativeSchema.optional(),
    })
    .optional(),
  metadata: JsonObjectSchema,
});

const ComponentVariantSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  properties: JsonObjectSchema,
});
export const ComponentSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  rootNodeId: EntityIdSchema,
  variants: z.array(ComponentVariantSchema),
  slots: z.array(z.strictObject({ id: EntityIdSchema, name: z.string().min(1), accepts: z.array(z.string().min(1)) })),
  defaultOverrides: z.record(z.string(), JsonValueSchema),
});

const TokenValueSchema = z.union([ColorSchema, LengthSchema, TextStyleSchema, JsonObjectSchema]);
export const TokenSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  type: z.enum(["COLOR", "TYPOGRAPHY", "SPACING", "SHADOW", "RADIUS", "ANIMATION"]),
  value: TokenValueSchema,
  description: z.string().optional(),
});
export const TypographyRecordSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  style: TextStyleSchema,
});

const KeyframeSchema = z.strictObject({
  id: EntityIdSchema,
  time: NonNegativeSchema,
  value: JsonValueSchema,
  easing: z.union([
    z.enum(["LINEAR", "EASE_IN", "EASE_OUT", "EASE_IN_OUT", "STEP"]),
    z.strictObject({ cubicBezier: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
  ]),
});
const TrackSchema = z.strictObject({
  id: EntityIdSchema,
  targetId: EntityIdSchema,
  propertyPath: z.string().min(1),
  keyframes: z.array(KeyframeSchema),
});
export const TimelineSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  duration: NonNegativeSchema,
  frameRate: z.number().finite().positive(),
  tracks: z.array(TrackSchema),
  labels: z.record(z.string(), NonNegativeSchema),
});

export const CameraSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  projection: z.enum(["PERSPECTIVE", "ORTHOGRAPHIC"]),
  transform: TransformSchema,
  focalLength: z.number().finite().positive().optional(),
  orthographicSize: z.number().finite().positive().optional(),
  nearClip: z.number().finite().positive(),
  farClip: z.number().finite().positive(),
  depthOfField: z.strictObject({
    enabled: z.boolean(),
    aperture: z.number().finite().positive(),
    focusDistance: z.number().finite().nonnegative(),
  }),
  targetNodeId: EntityIdSchema.optional(),
});
export const LightSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  type: z.enum(["DIRECTIONAL", "POINT", "SPOT", "HDRI"]),
  transform: TransformSchema,
  color: ColorSchema,
  intensity: NonNegativeSchema,
  assetId: EntityIdSchema.optional(),
  targetNodeId: EntityIdSchema.optional(),
});
export const MaterialSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  type: z.enum(["PBR", "UNLIT", "CUSTOM_SHADER"]),
  pbr: z
    .strictObject({
      baseColor: ColorSchema,
      roughness: UnitIntervalSchema,
      metalness: UnitIntervalSchema,
      opacity: UnitIntervalSchema,
    })
    .optional(),
  textures: z.array(
    z.strictObject({
      channel: z.enum([
        "BASE_COLOR",
        "ROUGHNESS",
        "METALLIC",
        "NORMAL",
        "HEIGHT",
        "AO",
        "EMISSION",
        "OPACITY",
        "CUSTOM",
      ]),
      assetId: EntityIdSchema,
    }),
  ),
  shader: z.strictObject({ language: z.string().min(1), sourceAssetId: EntityIdSchema }).optional(),
  metadata: JsonObjectSchema,
});

export const ReferenceRecordSchema = z.strictObject({
  id: EntityIdSchema,
  assetId: EntityIdSchema,
  type: z.enum([
    "SCREENSHOT",
    "IMAGE",
    "VIDEO",
    "DESIGN_FILE",
    "MULTI_VIEW_3D",
    "ENVIRONMENT",
    "TURNAROUND",
    "MOTION",
    "WEBSITE_RENDER",
    "MODEL",
    "OTHER",
  ]),
  role: z.enum(["PRIMARY", "SECONDARY", "ANGLE", "MOTION", "STYLE"]),
  viewportId: EntityIdSchema.optional(),
  regions: z.array(
    z.strictObject({
      id: z.string().min(1),
      label: z.string().min(1),
      bounds: z.strictObject({
        x: NonNegativeSchema,
        y: NonNegativeSchema,
        width: NonNegativeSchema,
        height: NonNegativeSchema,
      }),
    }),
  ),
  metadata: JsonObjectSchema,
});

export const ValidationRecordSchema = z.strictObject({
  id: EntityIdSchema,
  createdAt: IsoDateSchema,
  status: z.enum(["PENDING", "PASSED", "FAILED", "WARNING"]),
  scores: z.record(z.string(), UnitIntervalSchema),
  referenceIds: z.array(EntityIdSchema),
  heatmapAssetIds: z.array(EntityIdSchema),
  reportAssetId: EntityIdSchema.optional(),
  metadata: JsonObjectSchema,
});
const ExportArtifactSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  uri: z.string().min(1),
  assetId: EntityIdSchema.optional(),
});
export const ExportRecordSchema = z.strictObject({
  id: EntityIdSchema,
  exporter: z.string().min(1),
  exporterVersion: SemverSchema,
  createdAt: IsoDateSchema,
  status: z.enum(["PENDING", "SUCCEEDED", "FAILED"]),
  artifacts: z.array(ExportArtifactSchema),
  unsupportedFeatures: z.array(z.string()),
  flattenedNodeIds: z.array(EntityIdSchema),
});

export const ViewportSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().finite().positive(),
  orientation: z.enum(["PORTRAIT", "LANDSCAPE"]),
  category: z.enum(["DESKTOP", "TABLET", "MOBILE", "CUSTOM"]),
});
export const SettingsSchema = z.strictObject({
  qualityMode: z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]),
  defaultViewportId: EntityIdSchema,
  viewports: z.record(z.string(), ViewportSchema),
  defaultColorSpace: z.enum(["SRGB", "LINEAR_SRGB", "DISPLAY_P3", "ACESCG", "REC709", "REC2020"]),
  defaultUnit: LengthSchema.shape.unit,
  frameRate: z.number().finite().positive(),
  deterministicSeed: z.number().int().nonnegative(),
  reducedMotion: z.enum(["PRESERVE", "REDUCE", "DISABLE"]),
});
export const DocumentMetadataSchema = z.strictObject({
  id: EntityIdSchema,
  projectId: EntityIdSchema,
  name: z.string().min(1),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  createdBy: ActorRefSchema,
  updatedBy: ActorRefSchema,
  version: z.number().int().positive(),
  projectVersion: z.number().int().positive(),
  tags: z.array(z.string().min(1)),
  description: z.string(),
});

export const CanonicalDesignDocumentSchema = z.strictObject({
  schemaVersion: SemverSchema,
  migrationVersion: z.number().int().nonnegative(),
  documentVersion: z.number().int().positive(),
  parentVersionId: z.string().min(1).nullable(),
  metadata: DocumentMetadataSchema,
  rootNodeIds: z.array(EntityIdSchema),
  pages: z.array(EntityIdSchema),
  nodes: z.record(z.string(), DesignNodeSchema),
  assets: z.record(z.string(), AssetSchema),
  components: z.record(z.string(), ComponentSchema),
  tokens: z.record(z.string(), TokenSchema),
  typography: z.record(z.string(), TypographyRecordSchema),
  timelines: z.record(z.string(), TimelineSchema),
  cameras: z.record(z.string(), CameraSchema),
  lights: z.record(z.string(), LightSchema),
  materials: z.record(z.string(), MaterialSchema),
  references: z.record(z.string(), ReferenceRecordSchema),
  validations: z.record(z.string(), ValidationRecordSchema),
  exports: z.record(z.string(), ExportRecordSchema),
  settings: SettingsSchema,
});

export type CanonicalDesignDocument = z.infer<typeof CanonicalDesignDocumentSchema>;
export type DesignNode = z.infer<typeof DesignNodeSchema>;
export type AssetRecord = z.infer<typeof AssetSchema>;
export type ReferenceRecord = z.infer<typeof ReferenceRecordSchema>;
export type TextStyle = z.infer<typeof TextStyleSchema>;
export type Transform = z.infer<typeof TransformSchema>;
export type Length = z.infer<typeof LengthSchema>;
