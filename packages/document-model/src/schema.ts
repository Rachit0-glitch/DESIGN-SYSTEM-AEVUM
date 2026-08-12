import { z } from "zod";
import { EntityIdSchema } from "./ids.js";

export const CURRENT_SCHEMA_VERSION = "1.7.0" as const;
export const CURRENT_MIGRATION_VERSION = 7 as const;

export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
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
export const QuaternionSchema = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  w: z.number().finite(),
});
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
  quaternion: QuaternionSchema.optional(),
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
export const ParagraphStyleSchema = z.strictObject({
  alignment: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFY"]),
  verticalAlignment: z.enum(["TOP", "CENTER", "BOTTOM"]),
  direction: z.enum(["LTR", "RTL", "AUTO"]),
  paragraphSpacingBefore: LengthSchema,
  paragraphSpacingAfter: LengthSchema,
  firstLineIndent: LengthSchema,
  hangingIndent: LengthSchema,
});
export const AssetCropSchema = z.strictObject({
  x: UnitIntervalSchema,
  y: UnitIntervalSchema,
  width: UnitIntervalSchema,
  height: UnitIntervalSchema,
});
export const ResponsiveMotionSchema = z.strictObject({
  behavior: z.enum(["PRESERVE", "REDUCE", "DISABLE"]),
  durationScale: UnitIntervalSchema.default(1),
});
export const ResponsiveOverrideSchema = z.strictObject({
  visible: z.boolean().optional(),
  transform: TransformSchema.partial().optional(),
  dimensions: DimensionsSchema.partial().optional(),
  constraints: ConstraintsSchema.partial().optional(),
  layout: LayoutSchema.optional(),
  assetId: EntityIdSchema.optional(),
  crop: AssetCropSchema.optional(),
  objectFit: z.enum(["FILL", "CONTAIN", "COVER", "NONE", "SCALE_DOWN"]).optional(),
  textStyle: TextStyleSchema.partial().optional(),
  paragraphStyle: ParagraphStyleSchema.partial().optional(),
  childOrder: z.array(EntityIdSchema).optional(),
  activeCameraId: EntityIdSchema.optional(),
  motion: ResponsiveMotionSchema.optional(),
  customData: JsonObjectSchema.optional(),
});
export const ResponsiveSchema = z.strictObject({
  breakpoints: z.record(z.string(), ResponsiveOverrideSchema),
  orientations: z.partialRecord(z.enum(["PORTRAIT", "LANDSCAPE"]), ResponsiveOverrideSchema).optional(),
  containerQueries: z.record(z.string(), ResponsiveOverrideSchema).optional(),
  reducedMotionOverride: ResponsiveOverrideSchema.optional(),
  qualityProfileOverrides: z
    .partialRecord(z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]), ResponsiveOverrideSchema)
    .optional(),
});

const NodeMetadataSchema = z.strictObject({
  tags: z.array(z.string().min(1)),
  description: z.string().optional(),
  customData: JsonObjectSchema,
});
export const ImportProvenanceSchema = z.strictObject({
  sourceAssetId: EntityIdSchema,
  sourceAssetHash: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  sourceSceneIndex: z.number().int().nonnegative().optional(),
  sourceNodeIndex: z.number().int().nonnegative().optional(),
  sourceMeshIndex: z.number().int().nonnegative().optional(),
  sourcePrimitiveIndex: z.number().int().nonnegative().optional(),
  sourceMaterialIndex: z.number().int().nonnegative().optional(),
  sourceCameraIndex: z.number().int().nonnegative().optional(),
  sourceLightIndex: z.number().int().nonnegative().optional(),
});
export const CoordinateSystem3DSchema = z.strictObject({
  handedness: z.literal("RIGHT_HANDED"),
  upAxis: z.literal("Y"),
  forwardAxis: z.literal("NEGATIVE_Z"),
  unit: z.literal("M"),
  rotationUnit: z.literal("RADIANS"),
  quaternionOrder: z.literal("XYZW"),
  transformComposition: z.literal("TRS"),
});
export const CANONICAL_3D_COORDINATE_SYSTEM = Object.freeze({
  handedness: "RIGHT_HANDED" as const,
  upAxis: "Y" as const,
  forwardAxis: "NEGATIVE_Z" as const,
  unit: "M" as const,
  rotationUnit: "RADIANS" as const,
  quaternionOrder: "XYZW" as const,
  transformComposition: "TRS" as const,
});
export const Bounds3DSchema = z.strictObject({
  min: Vector3Schema,
  max: Vector3Schema,
  center: Vector3Schema,
  size: Vector3Schema,
  radius: NonNegativeSchema,
});
export const GeometryAttributeSchema = z.strictObject({
  semantic: z.string().min(1),
  count: z.number().int().nonnegative(),
  componentType: z.string().min(1),
  elementType: z.string().min(1),
  normalized: z.boolean(),
  min: z.array(z.number().finite()).optional(),
  max: z.array(z.number().finite()).optional(),
});
export const GeometryReferenceSchema = z.strictObject({
  sourceAssetId: EntityIdSchema,
  sourceMeshIndex: z.number().int().nonnegative(),
  sourcePrimitiveIndex: z.number().int().nonnegative(),
  primitiveMode: z.enum(["POINTS", "LINES", "LINE_LOOP", "LINE_STRIP", "TRIANGLES", "TRIANGLE_STRIP", "TRIANGLE_FAN"]),
  vertexCount: z.number().int().nonnegative(),
  indexCount: z.number().int().nonnegative(),
  triangleCount: z.number().int().nonnegative(),
  attributes: z.array(GeometryAttributeSchema),
  bounds: Bounds3DSchema.optional(),
  normalAvailable: z.boolean(),
  tangentAvailable: z.boolean(),
  texCoordSets: z.number().int().nonnegative(),
  skinAttributes: z.boolean(),
  morphTargetCount: z.number().int().nonnegative(),
  drawCallEstimate: z.number().int().positive(),
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
  importProvenance: ImportProvenanceSchema.optional(),
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
  crop: AssetCropSchema.optional(),
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
  environmentId: EntityIdSchema.optional(),
  lightingRigId: EntityIdSchema.optional(),
  coordinateSystem: CoordinateSystem3DSchema,
  sourceAssetId: EntityIdSchema.optional(),
  qualityProfile: z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]).optional(),
});
const Group3DNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("GROUP_3D"),
});
// ---------------------------------------------------------------------------
// Phase 19B: rigging (canonical rig/bone model, skin binding)
// ---------------------------------------------------------------------------

// Bounded to the constraint types that round-trip safely through a single Blender export (Phase
// 19B §24). Facial controls, cloth/hair bones, and finger-level rigs remain out of scope — an
// explicit, disclosed limitation, not a fabricated capability.
export const RigConstraintTypeSchema = z.enum([
  "COPY_TRANSFORM",
  "COPY_ROTATION",
  "COPY_LOCATION",
  "LIMIT_ROTATION",
  "LIMIT_LOCATION",
  "TRACK_TO",
]);
export const RigConstraintSchema = z.strictObject({
  id: EntityIdSchema,
  type: RigConstraintTypeSchema,
  targetBoneId: EntityIdSchema,
  sourceBoneId: EntityIdSchema.optional(),
  sourceNodeId: EntityIdSchema.optional(),
  influence: UnitIntervalSchema.default(1),
  settings: JsonObjectSchema,
});
export const IKChainSchema = z.strictObject({
  id: EntityIdSchema,
  rootBoneId: EntityIdSchema,
  endEffectorBoneId: EntityIdSchema,
  chainLength: z.number().int().positive(),
  targetNodeId: EntityIdSchema,
  poleTargetNodeId: EntityIdSchema.optional(),
  iterations: z.number().int().positive().default(500),
});
const Bone3DNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("BONE_3D"),
  length: z.number().finite().positive(),
  deforming: z.boolean(),
  inverseBindMatrix: z.array(z.number().finite()).length(16).optional(),
});
export const RigMethodSchema = z.enum(["IMPORTED", "TEMPLATE_MECHANICAL_CHAIN", "TEMPLATE_BASIC_HUMANOID", "MANUAL"]);
const Rig3DNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("RIG_3D"),
  rootBoneId: EntityIdSchema,
  boneIds: z.array(EntityIdSchema).min(1),
  ikChains: z.array(IKChainSchema),
  constraints: z.array(RigConstraintSchema),
  rigMethod: RigMethodSchema,
  compatibilityProfile: z.string().min(1).max(64).optional(),
});
export const SkinWeightMethodSchema = z.enum(["AUTOMATIC_HEURISTIC", "MANUAL", "IMPORTED"]);
// Deliberately compact: per-vertex joint indices and weights are never duplicated into the CDD.
// They live in the registered GLB/GLTF asset's own JOINTS_0/WEIGHTS_0 accessors (Phase 19B §8) —
// the same "canonical references + derived artifacts" pattern already used for mesh geometry
// itself (GeometryReference never stores raw vertex arrays either).
export const SkinBindingSchema = z.strictObject({
  rigId: EntityIdSchema,
  jointIds: z.array(EntityIdSchema).min(1),
  maxInfluencesPerVertex: z.number().int().positive().max(8),
  weightMethod: SkinWeightMethodSchema,
  normalized: z.boolean(),
  vertexCount: z.number().int().nonnegative(),
  unweightedVertexCount: z.number().int().nonnegative(),
});

const Model3DNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("MODEL_3D"),
  sourceAssetId: EntityIdSchema.optional(),
  meshIds: z.array(EntityIdSchema),
  rigId: EntityIdSchema.optional(),
  sourceSceneIndex: z.number().int().nonnegative().optional(),
  realWorldScale: z
    .strictObject({ value: z.number().finite().positive(), unit: z.enum(["MM", "CM", "M", "IN", "WORLD_UNIT"]) })
    .optional(),
});
const Mesh3DNodeSchema = z.strictObject({
  ...BaseNodeShape,
  type: z.literal("MESH_3D"),
  geometryAssetId: EntityIdSchema,
  geometry: GeometryReferenceSchema,
  materialIds: z.array(EntityIdSchema),
  topology: z.strictObject({
    vertices: z.number().int().nonnegative(),
    faces: z.number().int().nonnegative(),
    triangles: z.number().int().nonnegative(),
    manifold: z.boolean().nullable(),
  }),
  skinBinding: SkinBindingSchema.optional(),
  castShadow: z.boolean(),
  receiveShadow: z.boolean(),
});

export type DesignNode =
  | z.infer<typeof PageNodeSchema>
  | z.infer<typeof FrameNodeSchema>
  | z.infer<typeof GroupNodeSchema>
  | z.infer<typeof TextNodeSchema>
  | z.infer<typeof ShapeNodeSchema>
  | z.infer<typeof ImageNodeSchema>
  | z.infer<typeof VideoNodeSchema>
  | z.infer<typeof SvgNodeSchema>
  | z.infer<typeof VectorNodeSchema>
  | z.infer<typeof CanvasNodeSchema>
  | z.infer<typeof WebGlNodeSchema>
  | z.infer<typeof ComponentNodeSchema>
  | z.infer<typeof ComponentInstanceNodeSchema>
  | z.infer<typeof Scene3DNodeSchema>
  | z.infer<typeof Group3DNodeSchema>
  | z.infer<typeof Model3DNodeSchema>
  | z.infer<typeof Mesh3DNodeSchema>
  | z.infer<typeof Rig3DNodeSchema>
  | z.infer<typeof Bone3DNodeSchema>;
const DesignNodeSchemaValue: z.ZodType<DesignNode> = z.discriminatedUnion("type", [
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
  Group3DNodeSchema,
  Model3DNodeSchema,
  Mesh3DNodeSchema,
  Rig3DNodeSchema,
  Bone3DNodeSchema,
]);
export const DesignNodeSchema: z.ZodType<DesignNode> = DesignNodeSchemaValue;

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

export const TimelineTypeSchema = z.enum([
  "SCROLL",
  "TIME",
  "HOVER",
  "CLICK",
  "FOCUS",
  "LOAD",
  "VIEWPORT",
  "MEDIA",
  "MANUAL",
  "LOOP",
]);
export const AnimatedPropertySchema = z.enum([
  "POSITION",
  "ROTATION",
  "SCALE",
  "OPACITY",
  "COLOR",
  "BORDER",
  "RADIUS",
  "SHADOW",
  "GRADIENT",
  "TYPOGRAPHY",
  "CAMERA",
  "CONSTRAINTS",
  "VISIBILITY",
]);
export const EasingSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.enum(["LINEAR", "EASE", "EASE_IN", "EASE_OUT", "EASE_IN_OUT"]) }),
  z.strictObject({
    type: z.literal("CUBIC_BEZIER"),
    x1: z.number().finite(),
    y1: z.number().finite(),
    x2: z.number().finite(),
    y2: z.number().finite(),
  }),
  z.strictObject({
    type: z.literal("SPRING"),
    mass: z.number().finite().positive(),
    stiffness: z.number().finite().positive(),
    damping: z.number().finite().nonnegative(),
    initialVelocity: z.number().finite(),
    restSpeed: z.number().finite().positive(),
    restDelta: z.number().finite().positive(),
    overshootClamping: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("STEPS"),
    count: z.number().int().positive(),
    position: z.enum(["START", "END"]),
  }),
]);
export const KeyframeSchema = z.strictObject({
  id: EntityIdSchema,
  time: NonNegativeSchema,
  value: JsonValueSchema,
  easing: EasingSchema,
  interpolation: z.enum(["LINEAR", "STEP", "HOLD", "BEZIER", "SPRING"]),
  metadata: z.record(z.string(), JsonValueSchema),
});
export const TrackSchema = z.strictObject({
  id: EntityIdSchema,
  targetId: EntityIdSchema,
  property: AnimatedPropertySchema,
  propertyPath: z.string().min(1),
  valueType: z.enum(["NUMBER", "VECTOR", "COLOR", "BOOLEAN", "STRING", "STRUCTURED"]),
  muted: z.boolean(),
  locked: z.boolean(),
  layer: z.number().int(),
  keyframes: z.array(KeyframeSchema),
});
export const ClipSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  start: NonNegativeSchema,
  end: NonNegativeSchema,
  offset: NonNegativeSchema,
  playbackRate: z.number().finite().positive(),
  trackIds: z.array(EntityIdSchema),
});
export const TimelineMarkerSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  time: NonNegativeSchema,
});
export const TimelineTriggerSchema = z.strictObject({
  id: EntityIdSchema,
  type: TimelineTypeSchema,
  sourceId: EntityIdSchema.optional(),
  event: z.string().min(1).optional(),
  threshold: z.number().finite().optional(),
});
export const TimelineEventSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  time: NonNegativeSchema,
  payload: z.record(z.string(), JsonValueSchema),
});
export const TimelineSchema = z.strictObject({
  id: EntityIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  type: TimelineTypeSchema,
  duration: NonNegativeSchema,
  frameRate: z.number().finite().positive(),
  timeScale: z.number().finite().positive(),
  loop: z.strictObject({
    enabled: z.boolean(),
    count: z.number().int().positive().nullable(),
    mode: z.enum(["RESTART", "PING_PONG"]),
  }),
  tracks: z.array(TrackSchema),
  clips: z.array(ClipSchema),
  markers: z.array(TimelineMarkerSchema),
  triggers: z.array(TimelineTriggerSchema),
  events: z.array(TimelineEventSchema),
  labels: z.record(z.string(), NonNegativeSchema),
  reducedMotionTimelineId: EntityIdSchema.optional(),
  metadata: z.record(z.string(), JsonValueSchema),
});

export const AnimationActionSchema = z.strictObject({
  type: z.enum(["START_TIMELINE", "STOP_TIMELINE", "SET_VARIABLE", "EMIT_EVENT"]),
  targetId: EntityIdSchema.optional(),
  name: z.string().min(1).optional(),
  value: JsonValueSchema.optional(),
});
export const AnimationGuardSchema = z.strictObject({
  mode: z.enum(["ALL", "ANY"]),
  conditions: z.array(
    z.strictObject({
      variable: z.string().min(1),
      operator: z.enum(["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "TRUTHY", "FALSY"]),
      value: JsonValueSchema.optional(),
    }),
  ),
});
export const AnimationStateSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  timelineId: EntityIdSchema.optional(),
  entryActions: z.array(AnimationActionSchema),
  exitActions: z.array(AnimationActionSchema),
  metadata: z.record(z.string(), JsonValueSchema),
});
export const AnimationTransitionSchema = z.strictObject({
  id: EntityIdSchema,
  fromStateId: EntityIdSchema,
  toStateId: EntityIdSchema,
  triggerId: EntityIdSchema.optional(),
  guard: AnimationGuardSchema.optional(),
  actions: z.array(AnimationActionSchema),
  priority: z.number().int(),
});
export const AnimationStateMachineSchema = z.strictObject({
  id: EntityIdSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().min(1),
  initialStateId: EntityIdSchema,
  states: z.array(AnimationStateSchema),
  transitions: z.array(AnimationTransitionSchema),
  triggers: z.array(TimelineTriggerSchema),
  metadata: z.record(z.string(), JsonValueSchema),
});

export const CameraSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  projection: z.enum(["PERSPECTIVE", "ORTHOGRAPHIC"]),
  transform: TransformSchema,
  focalLength: z.number().finite().positive().optional(),
  verticalFieldOfView: z.number().finite().positive().max(Math.PI).optional(),
  aspectRatio: z.number().finite().positive().optional(),
  sensor: z
    .strictObject({
      width: z.number().finite().positive().max(100),
      height: z.number().finite().positive().max(100),
      fit: z.enum(["AUTO", "HORIZONTAL", "VERTICAL"]),
    })
    .default({ width: 36, height: 24, fit: "AUTO" }),
  lensShift: Vector2Schema.default({ x: 0, y: 0 }),
  roll: z
    .number()
    .finite()
    .min(-Math.PI * 2)
    .max(Math.PI * 2)
    .default(0),
  anamorphicRatio: z.number().finite().min(0.25).max(4).default(1),
  orthographicSize: z.number().finite().positive().optional(),
  orthographicBounds: z
    .strictObject({
      left: z.number().finite(),
      right: z.number().finite(),
      top: z.number().finite(),
      bottom: z.number().finite(),
    })
    .optional(),
  nearClip: z.number().finite().positive(),
  farClip: z.number().finite().positive(),
  depthOfField: z.strictObject({
    enabled: z.boolean(),
    aperture: z.number().finite().positive(),
    focusDistance: z.number().finite().nonnegative(),
    focusTargetNodeId: EntityIdSchema.optional(),
    bladeCount: z.number().int().min(3).max(16).default(6),
  }),
  targetingMode: z
    .enum(["EXPLICIT_ORIENTATION", "LOOK_AT_POINT", "LOOK_AT_NODE", "TRACKED_NODE"])
    .default("EXPLICIT_ORIENTATION"),
  targetNodeId: EntityIdSchema.optional(),
  target: Vector3Schema.optional(),
  upVector: Vector3Schema.default({ x: 0, y: 1, z: 0 }),
  framing: z
    .strictObject({
      safeArea: z.strictObject({ x: UnitIntervalSchema, y: UnitIntervalSchema }).default({ x: 0.9, y: 0.9 }),
      guide: z.enum(["NONE", "CENTER", "RULE_OF_THIRDS", "HEADROOM", "LOOK_ROOM"]).default("NONE"),
      outputAspectRatio: z.number().finite().positive().optional(),
    })
    .default({ safeArea: { x: 0.9, y: 0.9 }, guide: "NONE" }),
  matchProvenance: z
    .strictObject({
      referenceId: EntityIdSchema.optional(),
      sourceViewId: z.string().min(1),
      method: z.enum(["USER_PROVIDED", "ROLE_ASSUMED_TURNTABLE", "GEOMETRIC", "UNKNOWN"]),
      confidence: UnitIntervalSchema,
      evidence: z.array(z.string().min(1)).max(128),
    })
    .optional(),
  metadata: JsonObjectSchema.default({}),
  importProvenance: ImportProvenanceSchema.optional(),
});

export const CameraPathSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  cameraId: EntityIdSchema,
  type: z.enum(["TIMELINE", "ORBIT", "DOLLY", "STATIC"]),
  timelineId: EntityIdSchema.optional(),
  targetNodeId: EntityIdSchema.optional(),
  target: Vector3Schema.optional(),
  startPosition: Vector3Schema.optional(),
  endPosition: Vector3Schema.optional(),
  orbit: z
    .strictObject({
      radius: z.number().finite().positive().max(1_000_000),
      startAzimuth: z.number().finite(),
      endAzimuth: z.number().finite(),
      elevation: z
        .number()
        .finite()
        .min(-Math.PI / 2)
        .max(Math.PI / 2),
    })
    .optional(),
  easing: EasingSchema.default({ type: "LINEAR" }),
  metadata: JsonObjectSchema.default({}),
});

export const CinematicTransitionSchema = z.strictObject({
  type: z.enum(["CUT", "DISSOLVE", "FADE"]),
  duration: NonNegativeSchema.max(10),
  easing: EasingSchema.default({ type: "LINEAR" }),
});
export const CinematicShotSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  cameraId: EntityIdSchema,
  startTime: NonNegativeSchema,
  duration: z.number().finite().positive().max(86_400),
  timelineId: EntityIdSchema.optional(),
  cameraPathId: EntityIdSchema.optional(),
  transitionIn: CinematicTransitionSchema.default({ type: "CUT", duration: 0, easing: { type: "LINEAR" } }),
  composition: z
    .strictObject({
      subjectNodeId: EntityIdSchema.optional(),
      guide: z.enum(["NONE", "CENTER", "RULE_OF_THIRDS", "HEADROOM", "LOOK_ROOM"]),
      desiredCoverage: UnitIntervalSchema.optional(),
      safeMargin: UnitIntervalSchema.default(0.05),
    })
    .default({ guide: "NONE", safeMargin: 0.05 }),
  lightingRigId: EntityIdSchema.optional(),
  metadata: JsonObjectSchema.default({}),
});
export const CinematicSequenceSchema = z.strictObject({
  id: EntityIdSchema,
  version: SemverSchema,
  name: z.string().min(1),
  sceneId: EntityIdSchema,
  shotIds: z.array(EntityIdSchema).min(1).max(256),
  duration: z.number().finite().positive().max(86_400),
  allowGaps: z.boolean().default(false),
  metadata: JsonObjectSchema.default({}),
});
export const LightSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  type: z.enum(["DIRECTIONAL", "POINT", "SPOT", "AREA", "HEMISPHERE", "ENVIRONMENT", "EMISSIVE", "VOLUMETRIC", "HDRI"]),
  transform: TransformSchema,
  color: ColorSchema,
  intensity: NonNegativeSchema,
  temperatureKelvin: z.number().finite().min(1_000).max(40_000).optional(),
  exposure: z.number().finite().min(-20).max(20).optional(),
  assetId: EntityIdSchema.optional(),
  targetNodeId: EntityIdSchema.optional(),
  range: z.number().finite().positive().optional(),
  innerConeAngle: z
    .number()
    .finite()
    .nonnegative()
    .max(Math.PI / 2)
    .optional(),
  outerConeAngle: z
    .number()
    .finite()
    .positive()
    .max(Math.PI / 2)
    .optional(),
  castShadow: z.boolean().optional(),
  shape: z.enum(["RECTANGLE", "DISK", "ELLIPSE", "SPHERE"]).optional(),
  size: z.strictObject({ width: z.number().finite().positive(), height: z.number().finite().positive() }).optional(),
  shadow: z
    .strictObject({
      enabled: z.boolean(),
      mode: z.enum(["DYNAMIC", "BAKED", "HYBRID"]),
      mapSize: z.number().int().min(128).max(16_384),
      bias: z.number().finite().min(-1).max(1),
      normalBias: z.number().finite().min(0).max(10),
      radius: z.number().finite().nonnegative().max(100),
      contact: z.boolean(),
      cascadeCount: z.number().int().min(1).max(8).optional(),
    })
    .optional(),
  volumetric: z
    .strictObject({
      enabled: z.boolean(),
      density: z.number().finite().nonnegative().max(100),
      anisotropy: z.number().finite().min(-1).max(1),
    })
    .optional(),
  metadata: JsonObjectSchema.default({}),
  importProvenance: ImportProvenanceSchema.optional(),
});

export const EnvironmentSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  type: z.enum(["HDRI", "SKY", "STUDIO", "FOG", "VOLUME", "GROUND"]),
  assetId: EntityIdSchema.optional(),
  color: ColorSchema,
  intensity: NonNegativeSchema,
  rotation: Vector3Schema,
  backgroundIntensity: NonNegativeSchema,
  reflectionIntensity: NonNegativeSchema,
  visibleToCamera: z.boolean(),
  fog: z
    .strictObject({
      density: z.number().finite().nonnegative().max(100),
      startDistance: z.number().finite().nonnegative(),
      endDistance: z.number().finite().positive(),
      color: ColorSchema,
    })
    .optional(),
  metadata: JsonObjectSchema,
});

export const LightingProfileSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  target: z.enum(["REALTIME", "OFFLINE", "MOBILE"]),
  maxActiveLights: z.number().int().min(1).max(256),
  maxShadowLights: z.number().int().min(0).max(64),
  shadowMapSize: z.number().int().min(128).max(16_384),
  shadowMode: z.enum(["DISABLED", "DYNAMIC", "BAKED", "HYBRID", "PATH_TRACED"]),
  reflectionMode: z.enum(["DISABLED", "ENVIRONMENT", "PROBES", "PLANAR", "SCREEN_SPACE", "PATH_TRACED"]),
  volumetrics: z.boolean(),
  environmentResolution: z.number().int().min(64).max(16_384),
  bakePolicy: z.enum(["NONE", "OPTIONAL", "REQUIRED"]),
  metadata: JsonObjectSchema,
});

export const ReflectionProbeSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  type: z.enum(["CUBEMAP", "PLANAR", "IRRADIANCE"]),
  transform: TransformSchema,
  bounds: Bounds3DSchema.optional(),
  resolution: z.number().int().min(64).max(8_192),
  updateMode: z.enum(["BAKED", "ON_DEMAND", "REALTIME"]),
  assetId: EntityIdSchema.optional(),
  influence: UnitIntervalSchema,
  metadata: JsonObjectSchema,
});

export const LightingRigSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  type: z.enum([
    "THREE_POINT",
    "PRODUCT",
    "CHARACTER",
    "RIM",
    "SOFTBOX",
    "NEON",
    "CINEMATIC",
    "DAY",
    "NIGHT",
    "STUDIO",
    "CUSTOM",
  ]),
  lightIds: z.array(EntityIdSchema).min(1).max(256),
  environmentId: EntityIdSchema.optional(),
  reflectionProbeIds: z.array(EntityIdSchema).max(64),
  profileIds: z.array(EntityIdSchema).min(1).max(16),
  referenceId: EntityIdSchema.optional(),
  metadata: JsonObjectSchema,
});

export const LightingBakeSchema = z.strictObject({
  id: EntityIdSchema,
  name: z.string().min(1),
  type: z.enum(["LIGHTMAP", "REFLECTION_PROBE", "AMBIENT_OCCLUSION", "SHADOW", "EMISSION"]),
  sceneId: EntityIdSchema,
  lightingRigId: EntityIdSchema,
  profileId: EntityIdSchema,
  sourceDocumentVersion: z.number().int().positive(),
  sourceLightIds: z.array(EntityIdSchema).max(256),
  assetId: EntityIdSchema,
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/i),
  metadata: JsonObjectSchema,
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
      emissiveColor: ColorSchema.optional(),
      normalScale: z.number().finite().nonnegative().optional(),
      occlusionStrength: z.number().finite().nonnegative().optional(),
      alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]).optional(),
      alphaCutoff: UnitIntervalSchema.optional(),
      doubleSided: z.boolean().optional(),
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
      texCoord: z.number().int().nonnegative().optional(),
      sourceTextureIndex: z.number().int().nonnegative().optional(),
      sourceImageIndex: z.number().int().nonnegative().optional(),
      scale: z.number().finite().optional(),
      strength: z.number().finite().optional(),
      sampler: z
        .strictObject({
          magFilter: z.string().optional(),
          minFilter: z.string().optional(),
          wrapS: z.string(),
          wrapT: z.string(),
        })
        .optional(),
    }),
  ),
  shader: z.strictObject({ language: z.string().min(1), sourceAssetId: EntityIdSchema }).optional(),
  metadata: JsonObjectSchema,
  importProvenance: ImportProvenanceSchema.optional(),
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

export interface CanonicalDesignDocument {
  schemaVersion: string;
  migrationVersion: number;
  documentVersion: number;
  parentVersionId: string | null;
  metadata: z.infer<typeof DocumentMetadataSchema>;
  rootNodeIds: string[];
  pages: string[];
  nodes: Record<string, DesignNode>;
  assets: Record<string, z.infer<typeof AssetSchema>>;
  components: Record<string, z.infer<typeof ComponentSchema>>;
  tokens: Record<string, z.infer<typeof TokenSchema>>;
  typography: Record<string, z.infer<typeof TypographyRecordSchema>>;
  timelines: Record<string, z.infer<typeof TimelineSchema>>;
  stateMachines: Record<string, z.infer<typeof AnimationStateMachineSchema>>;
  cameras: Record<string, z.infer<typeof CameraSchema>>;
  cameraPaths: Record<string, z.infer<typeof CameraPathSchema>>;
  cinematicShots: Record<string, z.infer<typeof CinematicShotSchema>>;
  cinematicSequences: Record<string, z.infer<typeof CinematicSequenceSchema>>;
  lights: Record<string, z.infer<typeof LightSchema>>;
  environments: Record<string, z.infer<typeof EnvironmentSchema>>;
  lightingRigs: Record<string, z.infer<typeof LightingRigSchema>>;
  lightingProfiles: Record<string, z.infer<typeof LightingProfileSchema>>;
  reflectionProbes: Record<string, z.infer<typeof ReflectionProbeSchema>>;
  lightingBakes: Record<string, z.infer<typeof LightingBakeSchema>>;
  materials: Record<string, z.infer<typeof MaterialSchema>>;
  references: Record<string, z.infer<typeof ReferenceRecordSchema>>;
  validations: Record<string, z.infer<typeof ValidationRecordSchema>>;
  exports: Record<string, z.infer<typeof ExportRecordSchema>>;
  settings: z.infer<typeof SettingsSchema>;
}

const CanonicalDesignDocumentSchemaValue: z.ZodType<CanonicalDesignDocument> = z.strictObject({
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
  stateMachines: z.record(z.string(), AnimationStateMachineSchema),
  cameras: z.record(z.string(), CameraSchema),
  cameraPaths: z.record(z.string(), CameraPathSchema).default({}),
  cinematicShots: z.record(z.string(), CinematicShotSchema).default({}),
  cinematicSequences: z.record(z.string(), CinematicSequenceSchema).default({}),
  lights: z.record(z.string(), LightSchema),
  environments: z.record(z.string(), EnvironmentSchema).default({}),
  lightingRigs: z.record(z.string(), LightingRigSchema).default({}),
  lightingProfiles: z.record(z.string(), LightingProfileSchema).default({}),
  reflectionProbes: z.record(z.string(), ReflectionProbeSchema).default({}),
  lightingBakes: z.record(z.string(), LightingBakeSchema).default({}),
  materials: z.record(z.string(), MaterialSchema),
  references: z.record(z.string(), ReferenceRecordSchema),
  validations: z.record(z.string(), ValidationRecordSchema),
  exports: z.record(z.string(), ExportRecordSchema),
  settings: SettingsSchema,
});
export const CanonicalDesignDocumentSchema: z.ZodType<CanonicalDesignDocument> = CanonicalDesignDocumentSchemaValue;

export type AssetRecord = z.infer<typeof AssetSchema>;
export type ReferenceRecord = z.infer<typeof ReferenceRecordSchema>;
export type TextStyle = z.infer<typeof TextStyleSchema>;
export type Transform = z.infer<typeof TransformSchema>;
export type Quaternion = z.infer<typeof QuaternionSchema>;
export type Bounds3D = z.infer<typeof Bounds3DSchema>;
export type CoordinateSystem3D = z.infer<typeof CoordinateSystem3DSchema>;
export type GeometryReference = z.infer<typeof GeometryReferenceSchema>;
export type CameraRecord = z.infer<typeof CameraSchema>;
export type CameraPathRecord = z.infer<typeof CameraPathSchema>;
export type CinematicShotRecord = z.infer<typeof CinematicShotSchema>;
export type CinematicSequenceRecord = z.infer<typeof CinematicSequenceSchema>;
export type LightRecord = z.infer<typeof LightSchema>;
export type EnvironmentRecord = z.infer<typeof EnvironmentSchema>;
export type LightingRigRecord = z.infer<typeof LightingRigSchema>;
export type LightingProfileRecord = z.infer<typeof LightingProfileSchema>;
export type ReflectionProbeRecord = z.infer<typeof ReflectionProbeSchema>;
export type LightingBakeRecord = z.infer<typeof LightingBakeSchema>;
export type MaterialRecord = z.infer<typeof MaterialSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;
export type TimelineTrack = z.infer<typeof TrackSchema>;
export type TimelineKeyframe = z.infer<typeof KeyframeSchema>;
export type AnimationEasing = z.infer<typeof EasingSchema>;
export type AnimationStateMachine = z.infer<typeof AnimationStateMachineSchema>;
export type Length = z.infer<typeof LengthSchema>;
