# AEVUM AI Reconstruction Engine — Design Document Model

## 1. Purpose

This document defines the Canonical Design Document used by the AEVUM AI Reconstruction Engine.

It is the authoritative schema contract for all structured project data.

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`

The Canonical Design Document shall represent:

- 2D design structure
- 3D scene structure
- Typography
- Assets
- Components
- Variants
- Layout constraints
- Responsive overrides
- Animation
- Interaction
- Materials
- Textures
- Cameras
- Lighting
- Rigging
- Physics metadata
- Validation metadata
- Export metadata
- Project versioning

This document defines the shape and meaning of project data. It does not define the implementation details of the renderer, MCP server, validation engine, or exporters beyond the data contracts they consume.

---

## 2. Canonical Model Principles

The Canonical Design Document shall follow these principles:

1. It is the single source of truth for project state.
2. It is renderer-independent.
3. It is exporter-independent.
4. It supports both 2D and 3D as first-class systems.
5. It supports structured editability.
6. It supports stable identifiers.
7. It supports schema versioning and migrations.
8. It supports deterministic rendering.
9. It supports command-driven mutations.
10. It supports partial loading.
11. It supports asset provenance.
12. It supports responsive overrides.
13. It supports reusable components.
14. It supports animation bindings.
15. It supports validation references.
16. It supports export capability metadata.
17. It does not store unbounded binary data directly.
18. It keeps high-resolution master assets separate from delivery variants.
19. It preserves uncertainty and inference confidence.
20. It remains serializable and portable.

---

## 3. Document Identity

The root document shall include:

```ts
interface CanonicalDesignDocument {
  documentId: string;
  projectId: string;
  schemaVersion: string;
  documentVersion: number;
  parentVersionId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: ActorRef;
  updatedBy: ActorRef;
  title: string;
  description?: string;
  qualityMode: QualityMode;
  settings: DocumentSettings;
  rootNodeIds: string[];
  nodes: Record<string, DesignNode>;
  assets: Record<string, AssetRecord>;
  components: Record<string, ComponentDefinition>;
  timelines: Record<string, TimelineDefinition>;
  tokens: DesignTokenCollection;
  references: Record<string, ReferenceRecord>;
  validations: Record<string, ValidationRecord>;
  exports: Record<string, ExportRecord>;
  metadata: DocumentMetadata;
}
```

Required root properties shall include:

- Stable document ID
- Stable project ID
- Schema version
- Document version
- Parent version
- Creation metadata
- Modification metadata
- Quality mode
- Root nodes
- Node registry
- Asset registry
- Component registry
- Timeline registry
- Design tokens
- Reference records
- Validation records
- Export records

---

## 4. Identifier Requirements

All entities shall use stable, globally unique identifiers.

Recommended prefixes:

```text
doc_
project_
node_
asset_
component_
variant_
timeline_
track_
keyframe_
reference_
validation_
export_
material_
texture_
mesh_
camera_
light_
rig_
bone_
constraint_
simulation_
token_
```

Identifiers shall:

- Remain stable across document versions
- Never depend on array position
- Never be regenerated during serialization
- Be unique within a project
- Support cross-entity references
- Support diffing
- Support command targeting
- Support validation attribution
- Support export mapping

Deleted identifiers shall not be immediately reused.

---

## 5. Quality Mode

```ts
type QualityMode =
  | "DRAFT"
  | "HIGH_QUALITY"
  | "MAXIMUM_FIDELITY";
```

The document-level quality mode shall define the default quality expectation.

Individual jobs may request a temporary execution profile, but they shall not silently weaken stored project quality requirements.

---

## 6. Actor References

```ts
interface ActorRef {
  actorId: string;
  actorType: "USER" | "MCP_AGENT" | "SYSTEM" | "WORKER" | "PLUGIN";
  displayName?: string;
  provider?: string;
}
```

Actors shall be recorded for:

- Creation
- Updates
- Commands
- Validation
- Export
- Automated correction
- External tool operations

---

## 7. Document Settings

```ts
interface DocumentSettings {
  defaultViewport: ViewportSpec;
  supportedViewports: ViewportSpec[];
  defaultColorSpace: ColorSpace;
  defaultUnit: UnitSystem;
  defaultFrameRate: number;
  defaultTimebase: number;
  deterministicSeed: number;
  reducedMotionPolicy: ReducedMotionPolicy;
  assetPolicy: AssetPolicy;
  renderPolicy: RenderPolicy;
  exportPolicy: ExportPolicy;
}
```

The settings shall define project-wide defaults without preventing node-level overrides.

---

## 8. Unit System

```ts
type UnitSystem =
  | "PX"
  | "REM"
  | "EM"
  | "PERCENT"
  | "VW"
  | "VH"
  | "MM"
  | "CM"
  | "M"
  | "IN"
  | "PT"
  | "WORLD_UNIT";
```

2D and 3D systems shall use explicit units.

3D nodes shall include real-world scale metadata where available.

---

## 9. Color Spaces

```ts
type ColorSpace =
  | "SRGB"
  | "LINEAR_SRGB"
  | "DISPLAY_P3"
  | "ACESCG"
  | "REC709"
  | "REC2020";
```

Color definitions shall include color-space context.

Color conversion shall not be implicit during validation.

---

## 10. Base Node Contract

All nodes shall extend a shared base contract.

```ts
interface BaseNode {
  id: string;
  type: DesignNodeType;
  name: string;
  parentId?: string;
  childIds: string[];
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  transform: TransformData;
  dimensions?: DimensionData;
  constraints?: ConstraintSet;
  responsive?: ResponsiveOverrideSet;
  animationBindings?: AnimationBinding[];
  sourceLinks?: SourceReferenceLink[];
  validation?: NodeValidationMetadata;
  export?: NodeExportMetadata;
  tags?: string[];
  customData?: Record<string, unknown>;
}
```

All nodes shall preserve:

- Identity
- Type
- Name
- Hierarchy
- Visibility
- Lock state
- Opacity
- Blend mode
- Transform
- Dimensions
- Constraints
- Responsive data
- Animation bindings
- Source-reference relationships
- Validation metadata
- Export metadata

---

## 11. Node Type Registry

```ts
type DesignNodeType =
  | "PAGE"
  | "FRAME"
  | "GROUP"
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "SHAPE"
  | "VECTOR"
  | "SVG"
  | "MASK"
  | "EFFECT"
  | "COMPONENT_INSTANCE"
  | "CANVAS_LAYER"
  | "WEBGL_LAYER"
  | "SCENE_3D"
  | "MODEL_3D"
  | "MESH_3D"
  | "MATERIAL_3D"
  | "CAMERA_3D"
  | "LIGHT_3D"
  | "ENVIRONMENT_3D"
  | "RIG_3D"
  | "BONE_3D"
  | "PARTICLE_SYSTEM_3D"
  | "PHYSICS_OBJECT_3D"
  | "AUDIO"
  | "GUIDE"
  | "ANNOTATION";
```

New node types shall be added through schema version updates.

Unknown node types shall not be silently discarded.

---

## 12. Transform Model

```ts
interface TransformData {
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  skew?: Vector2;
  pivot: Vector3;
  anchor?: Vector2;
  transformOrigin?: Vector3;
  matrixOverride?: number[];
  coordinateSpace: CoordinateSpace;
}
```

```ts
type CoordinateSpace =
  | "LOCAL"
  | "PARENT"
  | "WORLD"
  | "VIEWPORT"
  | "SCREEN";
```

Requirements:

- 2D nodes may use x and y while preserving z for compositing.
- 3D nodes shall use full 3D transforms.
- Pivot and origin shall be explicit.
- Matrix overrides shall be optional.
- Exporters shall resolve transforms without mutating source values.

---

## 13. Dimension Model

```ts
interface DimensionData {
  width: LengthValue;
  height: LengthValue;
  depth?: LengthValue;
  minWidth?: LengthValue;
  maxWidth?: LengthValue;
  minHeight?: LengthValue;
  maxHeight?: LengthValue;
  aspectRatio?: number;
}
```

```ts
interface LengthValue {
  value: number;
  unit: UnitSystem;
  mode?: "FIXED" | "HUG" | "FILL" | "AUTO" | "FLUID";
}
```

Dimensions shall support fixed, intrinsic, flexible, and responsive sizing.

---

## 14. Page Node

```ts
interface PageNode extends BaseNode {
  type: "PAGE";
  pageKind: "WEB" | "MOBILE" | "POSTER" | "CANVA_PAGE" | "SCENE" | "CUSTOM";
  background?: Paint[];
  viewport?: ViewportSpec;
  route?: RouteMetadata;
}
```

Page nodes shall define top-level design surfaces.

---

## 15. Frame Node

```ts
interface FrameNode extends BaseNode {
  type: "FRAME";
  layout: LayoutDefinition;
  clipping: boolean;
  background?: Paint[];
  strokes?: StrokeStyle[];
  effects?: EffectStyle[];
  semanticRole?: string;
}
```

Frames shall support:

- Auto layout
- Grid
- Constraint layout
- Absolute positioning
- Clipping
- Backgrounds
- Effects
- Semantic roles

---

## 16. Group Node

```ts
interface GroupNode extends BaseNode {
  type: "GROUP";
  isolation: boolean;
  passThroughBlend: boolean;
}
```

Groups shall preserve structural organization without necessarily creating a layout context.

---

## 17. Layout Definition

```ts
type LayoutDefinition =
  | AbsoluteLayout
  | FlexLayout
  | GridLayout
  | ConstraintLayout
  | FlowLayout
  | StackLayout
  | FreeLayout;
```

### 17.1 Absolute Layout

```ts
interface AbsoluteLayout {
  type: "ABSOLUTE";
}
```

### 17.2 Flex Layout

```ts
interface FlexLayout {
  type: "FLEX";
  direction: "ROW" | "COLUMN";
  wrap: "NO_WRAP" | "WRAP" | "WRAP_REVERSE";
  gap: LengthValue;
  rowGap?: LengthValue;
  columnGap?: LengthValue;
  justifyContent: string;
  alignItems: string;
  alignContent?: string;
}
```

### 17.3 Grid Layout

```ts
interface GridLayout {
  type: "GRID";
  columns: GridTrack[];
  rows: GridTrack[];
  gap: LengthValue;
  rowGap?: LengthValue;
  columnGap?: LengthValue;
  autoFlow?: string;
  subgridColumns?: boolean;
  subgridRows?: boolean;
}
```

### 17.4 Constraint Layout

```ts
interface ConstraintLayout {
  type: "CONSTRAINT";
  solver: "LINEAR" | "CASSOWARY" | "CUSTOM";
  rules: ConstraintRule[];
}
```

The layout model shall preserve intent, not only computed coordinates.

---

## 18. Constraint Model

```ts
interface ConstraintSet {
  horizontal?: HorizontalConstraint;
  vertical?: VerticalConstraint;
  depth?: DepthConstraint;
  aspectRatioLocked?: boolean;
  maintainProportions?: boolean;
  customRules?: ConstraintRule[];
}
```

Supported constraints shall include:

- Left
- Right
- Top
- Bottom
- Center
- Scale
- Stretch
- Fixed
- Relative
- Aspect ratio
- Minimum and maximum bounds
- Parent-relative constraints
- Sibling-relative constraints

---

## 19. Responsive Overrides

```ts
interface ResponsiveOverrideSet {
  breakpoints: Record<string, NodeOverride>;
  containerQueries?: Record<string, NodeOverride>;
  orientations?: Partial<Record<"PORTRAIT" | "LANDSCAPE", NodeOverride>>;
  reducedMotionOverride?: NodeOverride;
  qualityProfileOverrides?: Partial<Record<QualityMode, NodeOverride>>;
}
```

Overrides may modify:

- Visibility
- Transform
- Dimensions
- Layout
- Typography
- Asset crop
- Effects
- Animation
- Camera
- Lighting
- 3D quality
- Export behaviour

Responsive overrides shall store only changed values.

Canonical schema `1.2.0` types visibility, transform, dimensions, constraints, layout, child order, typography,
asset identity, crop, fit, active camera, reduced-motion behaviour, and namespaced delivery metadata. Responsive
child order must be an exact permutation of canonical children, so viewport ordering never corrupts canonical
hierarchy.

Resolution precedence is device category, viewport ID, explicit breakpoint ID, ordered container queries,
orientation, reduced motion, then quality profile. The Scene Runtime retains both canonical and resolved nodes for
traceable attribution.

---

## 20. Viewport Model

```ts
interface ViewportSpec {
  id: string;
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  orientation: "PORTRAIT" | "LANDSCAPE";
  category: "DESKTOP" | "TABLET" | "MOBILE" | "CUSTOM";
}
```

---

## 21. Text Node

```ts
interface TextNode extends BaseNode {
  type: "TEXT";
  content: string;
  runs: TextRun[];
  paragraphStyle: ParagraphStyle;
  textBox: TextBoxBehavior;
  pathId?: string;
  textTransform?: TextTransformDefinition;
}
```

```ts
interface TextRun {
  start: number;
  end: number;
  style: TextStyle;
}
```

The text model shall support per-character and mixed-font styling.

---

## 22. Text Style

```ts
interface TextStyle {
  fontAssetId?: string;
  fontFamily: string;
  fontMatchStatus: FontMatchStatus;
  weight: number;
  width?: number;
  stretch?: number;
  style: "NORMAL" | "ITALIC" | "OBLIQUE";
  obliqueAngle?: number;
  size: LengthValue;
  lineHeight: LineHeightValue;
  letterSpacing?: LengthValue;
  wordSpacing?: LengthValue;
  baselineShift?: LengthValue;
  kerning?: boolean;
  ligatures?: boolean;
  openTypeFeatures?: Record<string, boolean | number>;
  variableAxes?: Record<string, number>;
  textTransform?: string;
  fills?: Paint[];
  strokes?: StrokeStyle[];
  effects?: EffectStyle[];
  opacity?: number;
}
```

```ts
type FontMatchStatus =
  | "EXACT"
  | "LIKELY_MATCH"
  | "CLOSE_SUBSTITUTE"
  | "UNKNOWN"
  | "OUTLINED_FROM_REFERENCE";
```

The font status shall remain honest and inspectable.

---

## 23. Paragraph Style

```ts
interface ParagraphStyle {
  alignment: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFY";
  verticalAlignment?: "TOP" | "CENTER" | "BOTTOM";
  paragraphSpacingBefore?: LengthValue;
  paragraphSpacingAfter?: LengthValue;
  firstLineIndent?: LengthValue;
  hangingIndent?: LengthValue;
  listStyle?: ListStyle;
  direction?: "LTR" | "RTL" | "AUTO";
  hyphenation?: boolean;
}
```

---

## 24. Image Node

```ts
interface ImageNode extends BaseNode {
  type: "IMAGE";
  assetId: string;
  crop?: CropDefinition;
  objectFit: "FILL" | "CONTAIN" | "COVER" | "NONE" | "SCALE_DOWN";
  objectPosition?: Vector2;
  colorAdjustments?: ColorAdjustmentSet;
  masks?: MaskReference[];
}
```

The original image asset shall remain immutable.

---

## 25. Video Node

```ts
interface VideoNode extends BaseNode {
  type: "VIDEO";
  assetId: string;
  posterAssetId?: string;
  playback: VideoPlaybackSettings;
  crop?: CropDefinition;
  masks?: MaskReference[];
}
```

Playback settings shall include:

- Autoplay
- Loop
- Muted
- Start time
- End time
- Playback rate
- Trigger
- Scrubbing mode

---

## 26. Shape Node

```ts
interface ShapeNode extends BaseNode {
  type: "SHAPE";
  shapeType:
    | "RECTANGLE"
    | "ELLIPSE"
    | "POLYGON"
    | "STAR"
    | "LINE"
    | "ARC"
    | "CUSTOM";
  geometry: ShapeGeometry;
  fills: Paint[];
  strokes: StrokeStyle[];
  effects: EffectStyle[];
  cornerRadius?: CornerRadius;
}
```

---

## 27. Vector Node

```ts
interface VectorNode extends BaseNode {
  type: "VECTOR";
  pathData: VectorPathData;
  fills: Paint[];
  strokes: StrokeStyle[];
  effects: EffectStyle[];
  fillRule: "NONZERO" | "EVENODD";
}
```

Vector data shall support:

- Nodes
- Handles
- Closed paths
- Compound paths
- Boolean history
- Variable stroke width
- Morph compatibility metadata

---

## 28. SVG Node

```ts
interface SvgNode extends BaseNode {
  type: "SVG";
  assetId?: string;
  inlineSource?: string;
  sanitized: boolean;
  optimized: boolean;
  editableStructure?: VectorNode[];
}
```

SVG content shall be sanitized before rendering or export.

---

## 29. Mask Model

```ts
interface MaskNode extends BaseNode {
  type: "MASK";
  maskType: "ALPHA" | "LUMINANCE" | "CLIP" | "DEPTH" | "CUSTOM";
  sourceNodeId: string;
  inverted: boolean;
  feather?: LengthValue;
}
```

Masks shall support nested and animated use.

---

## 30. Paint Model

```ts
type Paint =
  | SolidPaint
  | LinearGradientPaint
  | RadialGradientPaint
  | ConicGradientPaint
  | MeshGradientPaint
  | ImagePaint
  | VideoPaint
  | PatternPaint
  | ShaderPaint;
```

All paints shall include:

- Enabled state
- Opacity
- Blend mode
- Color space
- Transform where applicable

---

## 31. Stroke Model

```ts
interface StrokeStyle {
  enabled: boolean;
  width: LengthValue;
  alignment: "INSIDE" | "CENTER" | "OUTSIDE";
  cap: "BUTT" | "ROUND" | "SQUARE";
  join: "MITER" | "ROUND" | "BEVEL";
  miterLimit?: number;
  dashPattern?: number[];
  paint: Paint;
  variableWidthProfile?: VariableWidthPoint[];
}
```

---

## 32. Effect Model

```ts
type EffectStyle =
  | DropShadowEffect
  | InnerShadowEffect
  | BlurEffect
  | BackgroundBlurEffect
  | BloomEffect
  | GlowEffect
  | ChromaticAberrationEffect
  | RefractionEffect
  | ReflectionEffect
  | DisplacementEffect
  | GrainEffect
  | NoiseEffect
  | HalftoneEffect
  | VignetteEffect
  | ColorGradeEffect
  | CustomShaderEffect;
```

Every effect shall include:

- Enabled state
- Ordered position
- Parameters
- Blend behaviour
- Render compatibility metadata
- Export compatibility metadata

---

## 33. Component Definition

```ts
interface ComponentDefinition {
  id: string;
  name: string;
  rootNodeId: string;
  propertyDefinitions: ComponentPropertyDefinition[];
  variants: ComponentVariant[];
  slots?: ComponentSlot[];
  metadata?: Record<string, unknown>;
}
```

Components shall support:

- Reusable instances
- Variants
- Properties
- Slots
- Overrides
- Nested components
- Export mappings

---

## 34. Component Instance

```ts
interface ComponentInstanceNode extends BaseNode {
  type: "COMPONENT_INSTANCE";
  componentId: string;
  variantId?: string;
  propertyValues: Record<string, unknown>;
  nodeOverrides?: Record<string, NodeOverride>;
}
```

Instances shall preserve links to source components.

---

## 35. Design Tokens

```ts
interface DesignTokenCollection {
  colors: Record<string, DesignToken>;
  spacing: Record<string, DesignToken>;
  typography: Record<string, DesignToken>;
  radii: Record<string, DesignToken>;
  shadows: Record<string, DesignToken>;
  motion: Record<string, DesignToken>;
  breakpoints: Record<string, DesignToken>;
  materials: Record<string, DesignToken>;
  custom: Record<string, DesignToken>;
}
```

```ts
interface DesignToken {
  id: string;
  name: string;
  value: unknown;
  modes?: Record<string, unknown>;
  description?: string;
}
```

Tokens shall support multiple modes such as:

- Light
- Dark
- Mobile
- Desktop
- Brand variants
- Quality profiles

---

## 36. Asset Record

```ts
interface AssetRecord {
  id: string;
  name: string;
  type: AssetType;
  mimeType: string;
  sourceUri: string;
  contentHash: string;
  byteSize: number;
  width?: number;
  height?: number;
  depth?: number;
  duration?: number;
  frameRate?: number;
  colorSpace?: ColorSpace;
  sourceAssetId?: string;
  derivatives: AssetDerivative[];
  provenance: AssetProvenance;
  license?: AssetLicense;
  processingHistory: AssetProcessingRecord[];
  validationStatus?: string;
  metadata?: Record<string, unknown>;
}
```

Asset types shall include:

- Image
- Video
- Audio
- Font
- SVG
- GLB
- GLTF
- FBX
- OBJ
- STL
- USD
- USDZ
- HDRI
- Generic binary

---

## 37. Asset Derivatives

```ts
interface AssetDerivative {
  assetId: string;
  purpose:
    | "THUMBNAIL"
    | "RESPONSIVE_CROP"
    | "WEB_OPTIMIZED"
    | "MASK"
    | "DEPTH_MAP"
    | "NORMAL_MAP"
    | "HEIGHT_MAP"
    | "PBR_MAP"
    | "LOD"
    | "COMPRESSED_MODEL"
    | "BAKED_ANIMATION"
    | "CANVA_LAYER"
    | "OTHER";
  transformation: Record<string, unknown>;
}
```

Original assets shall not be overwritten.

---

## 38. Reference Record

```ts
interface ReferenceRecord {
  id: string;
  name: string;
  assetId: string;
  referenceType:
    | "SCREENSHOT"
    | "UI"
    | "POSTER"
    | "BRANDING"
    | "PRODUCT"
    | "CHARACTER"
    | "INTERIOR"
    | "ENVIRONMENT"
    | "TURNAROUND"
    | "MOTION"
    | "WEBSITE_RENDER"
    | "MODEL"
    | "OTHER";
  role?: "PRIMARY" | "SECONDARY" | "ANGLE" | "MOTION" | "STYLE";
  viewport?: ViewportSpec;
  cameraHint?: CameraHint;
  regions?: ReferenceRegion[];
  metadata?: Record<string, unknown>;
}
```

References shall support region annotations and multiple views.

---

## 39. Source Reference Links

```ts
interface SourceReferenceLink {
  referenceId: string;
  regionId?: string;
  confidence: number;
  relationship:
    | "RECONSTRUCTED_FROM"
    | "STYLE_MATCH"
    | "ASSET_EXTRACTED_FROM"
    | "CAMERA_MATCH"
    | "MOTION_MATCH"
    | "MATERIAL_MATCH"
    | "LIGHTING_MATCH";
}
```

Confidence shall be normalized between 0 and 1.

---

## 40. 3D Scene Node

```ts
interface Scene3DNode extends BaseNode {
  type: "SCENE_3D";
  worldSettings: WorldSettings;
  activeCameraId?: string;
  environmentId?: string;
  physicsWorld?: PhysicsWorldSettings;
  renderSettings?: SceneRenderSettings;
}
```

A 3D scene shall contain:

- Models
- Meshes
- Lights
- Cameras
- Environment
- Particles
- Physics objects
- Rigs
- Animation bindings

---

## 41. 3D Model Node

```ts
interface Model3DNode extends BaseNode {
  type: "MODEL_3D";
  sourceAssetId?: string;
  meshIds: string[];
  rigId?: string;
  lodGroup?: LodGroup;
  realWorldScale?: RealWorldScale;
  optimizationProfile?: OptimizationProfile;
}
```

A model may contain multiple named meshes.

---

## 42. Mesh Node

```ts
interface Mesh3DNode extends BaseNode {
  type: "MESH_3D";
  geometryAssetId: string;
  materialIds: string[];
  topology: TopologyMetadata;
  uvSets: UvSetMetadata[];
  morphTargets?: MorphTargetMetadata[];
  skinBinding?: SkinBinding;
  lodLevel?: number;
  castShadow: boolean;
  receiveShadow: boolean;
}
```

Topology metadata shall include:

- Vertex count
- Edge count
- Face count
- Triangle count
- Quad ratio
- Manifold status
- Normal status
- Tangent status
- Duplicate geometry status
- Hole status
- Intersection warnings
- Deformation readiness

---

## 43. Material Node

```ts
interface Material3DNode extends BaseNode {
  type: "MATERIAL_3D";
  materialType:
    | "PBR"
    | "UNLIT"
    | "GLASS"
    | "FABRIC"
    | "SKIN"
    | "HAIR"
    | "LIQUID"
    | "VOLUME"
    | "CUSTOM_SHADER";
  properties: MaterialProperties;
  textureBindings: TextureBinding[];
  shaderGraph?: ShaderGraph;
}
```

Material properties shall support:

- Base color
- Roughness
- Metalness
- Normal strength
- Height
- Displacement
- Ambient occlusion
- Emission
- Opacity
- Transmission
- IOR
- Clearcoat
- Anisotropy
- Subsurface scattering
- Iridescence

---

## 44. Texture Binding

```ts
interface TextureBinding {
  assetId: string;
  channel:
    | "BASE_COLOR"
    | "ROUGHNESS"
    | "METALLIC"
    | "NORMAL"
    | "HEIGHT"
    | "DISPLACEMENT"
    | "AO"
    | "EMISSION"
    | "OPACITY"
    | "SSS"
    | "CLEARCOAT"
    | "TRANSMISSION"
    | "ANISOTROPY"
    | "CUSTOM";
  uvSet?: number;
  colorSpace?: ColorSpace;
  transform?: TextureTransform;
}
```

---

## 45. Camera Node

```ts
interface Camera3DNode extends BaseNode {
  type: "CAMERA_3D";
  projection: "PERSPECTIVE" | "ORTHOGRAPHIC";
  focalLength?: number;
  fieldOfView?: number;
  sensorWidth?: number;
  sensorHeight?: number;
  aperture?: number;
  focusDistance?: number;
  depthOfField?: DepthOfFieldSettings;
  nearClip: number;
  farClip: number;
  lensShift?: Vector2;
  roll?: number;
  exposure?: number;
  targetNodeId?: string;
  constraints?: CameraConstraint[];
  shotMetadata?: ShotMetadata;
}
```

Camera nodes shall support responsive overrides and animation.

---

## 46. Camera Paths

```ts
interface CameraPathDefinition {
  id: string;
  name: string;
  points: CameraPathPoint[];
  interpolation: "LINEAR" | "BEZIER" | "CATMULL_ROM";
  banking?: boolean;
  collisionAvoidance?: boolean;
  lookAtTargets?: CameraTargetBinding[];
  speedProfile?: SpeedProfile;
}
```

Camera paths shall support:

- Dolly
- Orbit
- Arc
- Fly-through
- Product reveal
- Follow camera
- Turntable
- Scroll control
- Cursor control
- Cinematic sequence

---

## 47. Light Node

```ts
interface Light3DNode extends BaseNode {
  type: "LIGHT_3D";
  lightType:
    | "DIRECTIONAL"
    | "POINT"
    | "SPOT"
    | "AREA"
    | "HEMISPHERE"
    | "ENVIRONMENT"
    | "EMISSIVE_GEOMETRY"
    | "VOLUMETRIC";
  color: ColorValue;
  intensity: number;
  temperature?: number;
  range?: number;
  angle?: number;
  penumbra?: number;
  shadow?: ShadowSettings;
  targetNodeId?: string;
}
```

---

## 48. Environment Node

```ts
interface Environment3DNode extends BaseNode {
  type: "ENVIRONMENT_3D";
  environmentType:
    | "HDRI"
    | "SKY"
    | "FOG"
    | "VOLUME"
    | "TERRAIN"
    | "ROOM"
    | "PROCEDURAL"
    | "CUSTOM";
  assetId?: string;
  settings: Record<string, unknown>;
}
```

---

## 49. Rig Node

```ts
interface Rig3DNode extends BaseNode {
  type: "RIG_3D";
  rootBoneId: string;
  boneIds: string[];
  controls: RigControl[];
  constraints: RigConstraint[];
  bindPoseAssetId?: string;
  compatibilityProfile?: string;
}
```

The rig model shall support:

- IK
- FK
- IK/FK switching
- Pole targets
- Facial controls
- Finger controls
- Accessory bones
- Cloth bones
- Hair bones

---

## 50. Bone Node

```ts
interface Bone3DNode extends BaseNode {
  type: "BONE_3D";
  parentBoneId?: string;
  restTransform: TransformData;
  inverseBindMatrix?: number[];
  deforming: boolean;
}
```

---

## 51. Particle System Node

```ts
interface ParticleSystem3DNode extends BaseNode {
  type: "PARTICLE_SYSTEM_3D";
  emitter: ParticleEmitterDefinition;
  particle: ParticleDefinition;
  forces: ParticleForce[];
  simulationMode: "REALTIME" | "BAKED";
  bakedAssetId?: string;
}
```

---

## 52. Physics Object Node

```ts
interface PhysicsObject3DNode extends BaseNode {
  type: "PHYSICS_OBJECT_3D";
  bodyType: "STATIC" | "DYNAMIC" | "KINEMATIC";
  collider: ColliderDefinition;
  mass?: number;
  friction?: number;
  restitution?: number;
  damping?: DampingSettings;
  simulationId?: string;
}
```

---

## 53. Audio Node

```ts
interface AudioNode extends BaseNode {
  type: "AUDIO";
  assetId: string;
  playback: AudioPlaybackSettings;
  spatial?: SpatialAudioSettings;
}
```

Audio may drive animation and interaction.

---

## 54. Timeline Definition

```ts
interface TimelineDefinition {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  timeScale: number;
  loopMode: "NONE" | "LOOP" | "PING_PONG";
  loopRegion?: TimeRange;
  labels: TimelineLabel[];
  tracks: TimelineTrack[];
  nestedTimelineIds?: string[];
  triggerBindings?: TriggerBinding[];
}
```

The timeline model shall remain runtime-independent.

Canonical schema `1.3.0` stores immutable versioned timelines with a driver type, bounded duration and time scale,
loop policy, tracks, clips, markers, triggers, events, labels, and an optional reduced-motion timeline reference. Tracks
declare a canonical animated-property category and a schema-aware property path. Easing is a discriminated,
library-independent record supporting named curves, cubic Bezier, deterministic spring metadata, and steps.

---

## 55. Timeline Track

```ts
interface TimelineTrack {
  id: string;
  name: string;
  targetId: string;
  propertyPath: string;
  valueType: AnimationValueType;
  keyframes: Keyframe[];
  muted?: boolean;
  locked?: boolean;
}
```

Property paths shall be stable and schema-aware.

---

## 56. Keyframes

```ts
interface Keyframe {
  id: string;
  time: number;
  value: unknown;
  interpolation:
    | "STEP"
    | "LINEAR"
    | "BEZIER"
    | "SPRING"
    | "HOLD"
    | "CUSTOM";
  easing?: EasingDefinition;
  tangents?: KeyframeTangents;
  metadata?: Record<string, unknown>;
}
```

---

## 57. Animation Bindings

Canonical schema `1.3.0` also stores versioned state machines as a root registry. Each machine contains a stable initial
state, state entry and exit actions, deterministic-priority transitions, typed triggers, data-only guards, and actions.
State and transition records are canonical data; current playback state remains runtime state and is never persisted
into the Canonical Design Document during evaluation.

```ts
interface AnimationBinding {
  timelineId: string;
  trackIds?: string[];
  activation:
    | "AUTO"
    | "TRIGGER"
    | "SCROLL"
    | "INTERACTION"
    | "STATE"
    | "MANUAL";
}
```

---

## 58. Interaction Triggers

```ts
type TriggerType =
  | "PAGE_LOAD"
  | "SCROLL"
  | "SCROLL_VELOCITY"
  | "SCROLL_DIRECTION"
  | "VIEWPORT_ENTRY"
  | "VIEWPORT_EXIT"
  | "CLICK"
  | "HOVER"
  | "DRAG"
  | "HOLD"
  | "CURSOR_MOVE"
  | "KEYBOARD"
  | "FORM_STATE"
  | "ROUTE_CHANGE"
  | "AUDIO_PROGRESS"
  | "VIDEO_PROGRESS"
  | "DATA_STATE"
  | "CUSTOM_EVENT";
```

Triggers shall reference explicit targets and actions.

---

## 59. State Model

```ts
interface InteractionStateMachine {
  id: string;
  name: string;
  states: InteractionState[];
  transitions: StateTransition[];
  initialStateId: string;
}
```

State machines may control:

- Component variants
- Visibility
- Animation
- Camera
- Material
- Lighting
- Data-driven UI

---

## 60. Validation Metadata

```ts
interface NodeValidationMetadata {
  status?: "UNVALIDATED" | "PASS" | "WARN" | "FAIL";
  lastValidationId?: string;
  metrics?: Record<string, number>;
  issues?: ValidationIssueRef[];
}
```

Validation metadata shall be summary data only.

Full reports shall remain separate records.

---

## 61. Validation Record

```ts
interface ValidationRecord {
  id: string;
  documentVersion: number;
  referenceIds: string[];
  rendererVersion: string;
  viewport?: ViewportSpec;
  cameraId?: string;
  qualityMode: QualityMode;
  seed: number;
  metrics: ValidationMetricSet;
  thresholds: ValidationThresholdSet;
  status: "PASS" | "WARN" | "FAIL";
  differenceAssetIds?: string[];
  issueIds?: string[];
  createdAt: string;
}
```

Validation records shall be immutable.

---

## 62. Export Metadata

```ts
interface NodeExportMetadata {
  preferredRepresentation?: string;
  flattenPolicy?: "NEVER" | "WHEN_REQUIRED" | "ALWAYS";
  semanticRole?: string;
  accessibility?: AccessibilityMetadata;
  targetOverrides?: Record<string, Record<string, unknown>>;
}
```

Node export metadata shall guide exporters without coupling the node to one target.

---

## 63. Export Record

```ts
interface ExportRecord {
  id: string;
  documentVersion: number;
  exporterId: string;
  exporterVersion: string;
  target: string;
  options: Record<string, unknown>;
  artifactAssetIds: string[];
  capabilityReport: ExportCapabilityReport;
  validationId?: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
}
```

---

## 64. Export Capability Report

```ts
interface ExportCapabilityReport {
  nativeMappings: ExportMapping[];
  adaptedMappings: ExportMapping[];
  flattenedMappings: ExportMapping[];
  unsupportedMappings: ExportMapping[];
  warnings: string[];
  editability?: {
    nativeEditablePercent: number;
    layeredMediaPercent: number;
    flattenedPercent: number;
  };
}
```

Canva and code exporters shall use this report.

---

## 65. Accessibility Metadata

```ts
interface AccessibilityMetadata {
  role?: string;
  label?: string;
  description?: string;
  altText?: string;
  tabIndex?: number;
  focusable?: boolean;
  keyboardActions?: string[];
  aria?: Record<string, string | number | boolean>;
}
```

Accessibility data shall remain part of the Canonical Design Document.

---

## 66. Route Metadata

```ts
interface RouteMetadata {
  path: string;
  title?: string;
  description?: string;
  layoutId?: string;
  loadingStateId?: string;
  errorStateId?: string;
}
```

Route data shall support web export.

---

## 67. Provenance and Inference

Inferred data shall include:

```ts
interface InferenceMetadata {
  source: "REFERENCE_ANALYSIS" | "AI_PROVIDER" | "USER" | "SYSTEM";
  confidence: number;
  modelOrTool?: string;
  createdAt: string;
  notes?: string;
}
```

The document shall never erase uncertainty introduced during reconstruction.

---

## 68. Custom Data

Custom data shall be namespaced.

Example:

```json
{
  "customData": {
    "aevum.validation.regionPriority": "high",
    "plugin.example.setting": true
  }
}
```

Unnamespaced arbitrary custom properties shall be prohibited.

---

## 69. Serialization Format

The default serialization format should be JSON-compatible.

The system may support:

- JSON
- Binary serialization
- Compressed archives
- Partial document chunks

The canonical logical model shall remain format-independent.

Binary assets shall be referenced by asset IDs and URIs, not embedded directly in normal document JSON.

---

## 70. Partial Loading

Large projects shall support partial loading.

Possible chunks include:

- Pages
- 3D scenes
- Assets
- Timelines
- Validation records
- Export records
- Component libraries

Partial loading shall preserve reference integrity.

---

## 71. Schema Versioning

The document shall include:

```text
schemaVersion
documentVersion
```

Schema version changes shall define:

- Migration ID
- Source version
- Target version
- Forward migration
- Validation
- Rollback policy where practical

No migration shall silently discard unsupported data.

---

## 72. Document Versioning

Every accepted transaction shall produce a new document version.

Versions shall reference:

- Parent version
- Command IDs
- Actor
- Timestamp
- Validation summary
- Asset manifest
- Schema version

Snapshots may be created for performance.

The command log remains the source of mutation history.

---

## 73. Immutability Rules

The following shall be immutable after creation:

- Original asset bytes
- Validation records
- Export records
- Historical document versions
- Historical command records

New derivatives or versions shall be created instead of overwriting history.

---

## 74. Document Validation Rules

A document shall be considered structurally valid when:

- All IDs are unique
- All references resolve
- Parent-child relationships are consistent
- No illegal cycles exist
- Node types match their payload
- Required assets exist
- Required timelines exist
- Required materials exist
- Required cameras exist
- Required rigs exist
- Numeric values are finite
- Opacity values are within range
- Colors are valid
- Transform matrices are valid
- Responsive override keys are valid
- Export metadata is namespaced
- Custom data is namespaced
- Schema version is supported

---

## 75. Hierarchy Rules

The hierarchy shall enforce:

- A node has at most one parent
- Root nodes have no parent
- Child IDs match parent references
- Cycles are prohibited
- Bone hierarchies are acyclic
- Component instance relationships do not create recursive loops without explicit support
- Scene ownership remains explicit

---

## 76. 2D and 3D Integration Rules

2D and 3D may coexist in one document.

Supported relationships include:

- 3D scene embedded in a 2D frame
- 2D labels attached to 3D objects
- 2D UI controlling 3D cameras
- Scroll timelines controlling 3D scenes
- 3D renders used as 2D assets
- Camera outputs mapped to Canva pages
- 2D masks applied over 3D render layers
- 3D depth data used by 2D effects

Cross-system references shall use stable IDs.

---

## 77. Determinism Metadata

The document shall store or reference:

- Deterministic seed
- Renderer compatibility version
- Required font versions
- Required asset hashes
- Simulation bake references
- Animation frame rate
- Timebase
- Quality profile

This metadata shall support reproducible renders.

---

## 78. Master and Delivery Variants

Models, textures, images, and animations shall distinguish between:

- Master
- Authoring
- Validation
- Web delivery
- Mobile delivery
- Canva
- Static fallback

Variants shall be represented as asset derivatives or optimization profiles.

The master source shall never be silently replaced.

---

## 79. Model Optimization Profile

```ts
interface OptimizationProfile {
  profileId: string;
  purpose: "MASTER" | "AUTHORING" | "WEB" | "MOBILE" | "CANVA" | "FALLBACK";
  maxTriangles?: number;
  maxTextureSize?: number;
  compression?: string[];
  lodLevels?: number;
  materialMerge?: boolean;
  geometryInstancing?: boolean;
}
```

---

## 80. Node Naming Rules

Node names should be:

- Human-readable
- Stable where possible
- Descriptive
- Unique among close siblings where practical

Examples:

```text
Hero Section
Primary Navigation
CTA Button
Character Body
Left Hand
Studio Key Light
Hero Camera
```

Machine IDs remain authoritative.

---

## 81. Confidence and Completion

Reconstructed properties may include confidence values.

Completion shall not be inferred only from presence.

Examples:

- A font can be present but not exact.
- A model can exist but fail topology checks.
- A camera can exist but not match the reference.
- A Canva export can exist but contain flattened regions.

Validation and capability reports shall remain separate from structural completeness.

---

## 82. Unsupported Data Handling

When a subsystem encounters unsupported data, it shall:

- Preserve the source data
- Report the unsupported capability
- Avoid silent deletion
- Generate a fallback where allowed
- Record the fallback in export or validation metadata

---

## 83. Example Minimal Document

```json
{
  "documentId": "doc_01",
  "projectId": "project_01",
  "schemaVersion": "1.0.0",
  "documentVersion": 1,
  "createdAt": "2026-08-01T00:00:00.000Z",
  "updatedAt": "2026-08-01T00:00:00.000Z",
  "createdBy": {
    "actorId": "user_01",
    "actorType": "USER"
  },
  "updatedBy": {
    "actorId": "user_01",
    "actorType": "USER"
  },
  "title": "Example Project",
  "qualityMode": "MAXIMUM_FIDELITY",
  "settings": {
    "defaultViewport": {
      "id": "desktop",
      "name": "Desktop",
      "width": 1440,
      "height": 900,
      "deviceScaleFactor": 1,
      "orientation": "LANDSCAPE",
      "category": "DESKTOP"
    },
    "supportedViewports": [],
    "defaultColorSpace": "SRGB",
    "defaultUnit": "PX",
    "defaultFrameRate": 60,
    "defaultTimebase": 1000,
    "deterministicSeed": 42,
    "reducedMotionPolicy": "GENERATE_ALTERNATIVE",
    "assetPolicy": {},
    "renderPolicy": {},
    "exportPolicy": {}
  },
  "rootNodeIds": ["node_page"],
  "nodes": {
    "node_page": {
      "id": "node_page",
      "type": "PAGE",
      "name": "Home",
      "childIds": [],
      "visible": true,
      "locked": false,
      "opacity": 1,
      "blendMode": "NORMAL",
      "transform": {
        "position": {"x": 0, "y": 0, "z": 0},
        "rotation": {"x": 0, "y": 0, "z": 0},
        "scale": {"x": 1, "y": 1, "z": 1},
        "pivot": {"x": 0, "y": 0, "z": 0},
        "coordinateSpace": "LOCAL"
      },
      "pageKind": "WEB"
    }
  },
  "assets": {},
  "components": {},
  "timelines": {},
  "tokens": {
    "colors": {},
    "spacing": {},
    "typography": {},
    "radii": {},
    "shadows": {},
    "motion": {},
    "breakpoints": {},
    "materials": {},
    "custom": {}
  },
  "references": {},
  "validations": {},
  "exports": {},
  "metadata": {}
}
```

---

## 84. Schema Package Requirements

The `packages/document-model` package shall provide:

- TypeScript types
- Runtime schemas
- JSON Schema generation
- Validation utilities
- Migration utilities
- Stable ID utilities
- Reference integrity checks
- Diff utilities
- Patch utilities
- Serialization utilities
- Test fixtures
- Version compatibility checks

Runtime schemas shall not rely only on TypeScript compile-time types.

---

## 85. Command Compatibility

Every mutable field shall have a defined command path.

Examples:

```text
node.create
node.update
node.delete
node.reparent
node.set_responsive_override
text.update_content
text.update_run
asset.register
component.create
timeline.create
timeline.add_keyframe
mesh.assign_material
camera.set_properties
light.set_properties
rig.bind
validation.attach_summary
export.attach_metadata
```

The model shall not require direct state mutation.

---

## 86. Export Compatibility

The Canonical Design Document shall support export without becoming coupled to any single target.

Target-specific logic shall live in:

- Export adapters
- Node export metadata
- Capability reports
- Fallback policies

The core document shall not contain React components, CSS strings, Three.js objects, or Canva API objects as canonical state.

---

## 87. Renderer Compatibility

The document shall not store live renderer instances.

Examples of prohibited canonical data:

- DOM nodes
- Three.js object instances
- Canvas contexts
- WebGL handles
- Browser event objects
- Blender runtime objects

These may exist only in runtime projections.

---

## 88. Validation Compatibility

Validation systems shall be able to trace errors back to:

- Node IDs
- Asset IDs
- Camera IDs
- Material IDs
- Timeline IDs
- Reference regions

Every generated render region should preserve mapping metadata where practical.

---

## 89. Security Requirements

The model shall prevent unsafe embedded content.

Requirements include:

- SVG sanitization status
- Shader validation metadata
- Script prohibition in canonical nodes
- External URI validation
- Namespaced custom data
- File-reference validation
- Restricted plugin metadata

Executable code shall not be stored as trusted canonical state without sandbox classification.

---

## 90. Design Document Acceptance Criteria

The Canonical Design Document shall be considered implementation-ready when it can represent:

- A complete responsive website
- Editable text and vectors
- Advanced 2D effects
- Components and variants
- Multiple viewports
- Interaction states
- Multi-track animation
- A complete 3D scene
- Multi-mesh models
- PBR materials
- Textures
- Cameras
- Lights
- Rigs
- Character animation
- Physics metadata
- Validation reports
- Export capability metadata
- Canva editability reports
- Multiple document versions
- Asset provenance
- Deterministic render settings

---

## 91. Final Model Statement

The Canonical Design Document is the central contract of the AEVUM AI Reconstruction Engine.

It shall represent the full editable state of 2D design, 3D production, animation, interaction, validation, and export while remaining independent from any specific renderer, frontend framework, 3D runtime, AI provider, or creative platform.
