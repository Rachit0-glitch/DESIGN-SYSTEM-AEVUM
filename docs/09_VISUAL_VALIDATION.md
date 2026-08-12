# AEVUM AI Reconstruction Engine — Visual Validation

## 1. Purpose

This document defines the Visual Validation system of the AEVUM AI Reconstruction Engine.

It is authoritative for:

- Reference comparison
- Deterministic render preparation
- 2D validation
- Typography validation
- Layout validation
- Asset validation
- Effect validation
- Responsive validation
- Animation validation
- 3D geometry validation
- Camera validation
- Material validation
- Lighting validation
- Multi-angle validation
- Turntable validation
- Heatmaps
- Region scoring
- Thresholds
- Completion rules
- Regression testing
- Autonomous correction inputs
- Validation reports
- Export validation
- Performance validation

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`
- `03_DESIGN_DOCUMENT_MODEL.md`
- `04_RECONSTRUCTION_PIPELINE.md`
- `05_TYPOGRAPHY_AND_ASSETS.md`
- `06_ANIMATION_AND_RENDERING.md`
- `07_3D_ENGINE_AND_CINEMATICS.md`
- `08_MCP_SPECIFICATION.md`

Visual Validation shall remain an independent subsystem.

It shall measure rendered output against references and shall not silently mutate project state.

All corrections shall be proposed through structured commands.

---

## 2. Core Principles

The Visual Validation system shall follow these principles:

1. Completion shall be measurable.
2. Validation shall use deterministic renders.
3. Validation shall compare rendered output, not only document properties.
4. 2D and 3D validation shall be first-class.
5. Whole-frame scores alone are insufficient.
6. Region-level scoring is required.
7. Typography shall have dedicated metrics.
8. Camera, materials, and lighting shall be evaluated separately.
9. Unsupported features shall be reported.
10. Validation records shall be immutable.
11. Validation results shall be traceable to a document version.
12. Comparison settings shall be explicit.
13. High-priority regions may use stricter thresholds.
14. One improved region shall not conceal a degraded region.
15. Autonomous correction shall use validation evidence.
16. Validation shall support both fidelity and export-readiness checks.
17. Performance validation shall remain separate from visual similarity.
18. Human review shall remain available for ambiguous results.
19. Maximum Fidelity may use repeated validation passes.
20. No result shall be declared exact without supporting evidence.

---

## 2.1 Phase 7 Deterministic Foundation

Phase 7 implements the first production validation foundation in `packages/validation` and the in-memory orchestration
boundary in `apps/validation-worker`.

The implemented path is:

```text
Validation Task
-> Reference Snapshot
-> Scene Projection and Render Graph Evidence
-> Region and Structural Comparison
-> Replaceable Raster Comparison
-> Attributed Differences
-> Deterministic Region Heatmaps
-> Immutable Validation Report
-> Non-Executable Correction Plan
```

Validation tasks and reports are tied to exact project, document version, reference, source asset, viewport, renderer
version, projection fingerprint, Render Graph fingerprint, quality mode, deterministic seed, and threshold profile.
Reference regions preserve both source-analysis region identity and unique canonical node identity so multiple nodes
derived from one source region remain traceable without identity collisions.

The initial raster adapter computes deterministic normalized RGBA mean absolute error when buffers are available.
When only checksums are available, it emits explicitly marked placeholder evidence. Phase 7 heatmaps are deterministic
region-cell evidence, not rasterized pixel heatmaps. SSIM, LPIPS, and true raster heatmaps remain replaceable future
adapters.

Every reported difference identifies its canonical source node, validation region, property, expected value, actual
value, severity, confidence, score, threshold, and correction category. Suggested corrections are validated
`node.update` payloads tied to the expected document version, but remain `executable: false` and require future Command
Engine review. The validation package neither imports the Command Engine nor mutates canonical state.

The Phase 7 worker is intentionally in-memory and non-deployable. It has no server, queue listener, start command, or
Railway activation.

---

## 3. Validation Objectives

The Visual Validation system shall determine:

- How similar the reconstruction is to the reference
- Which regions differ
- Which nodes are likely responsible
- Whether typography is accurate
- Whether layout is accurate
- Whether colors and effects are accurate
- Whether responsive variants remain correct
- Whether animation timing and motion are accurate
- Whether a 3D model is consistent across views
- Whether camera matching is accurate
- Whether materials match
- Whether lighting matches
- Whether export output matches the canonical render
- Whether completion thresholds are satisfied
- Whether additional correction passes are useful

---

## 4. Validation Categories

The system shall support:

### 4.1 Structural Validation

Checks the Canonical Design Document and entity relationships.

### 4.2 Visual Validation

Compares rendered output with visual references.

### 4.3 Behavioural Validation

Checks animation, interaction, triggers, and state transitions.

### 4.4 3D Validation

Checks geometry, topology, UVs, materials, cameras, lighting, and scenes.

### 4.5 Export Validation

Checks generated target output.

### 4.6 Performance Validation

Checks delivery budgets and runtime performance.

### 4.7 Accessibility Validation

Checks applicable accessibility requirements.

---

## 5. Validation Record

Every validation run shall create an immutable Validation Record.

```ts
interface ValidationRecord {
  id: string;
  projectId: string;
  documentId: string;
  documentVersion: number;
  validationType: ValidationType;
  referenceIds: string[];
  rendererVersion: string;
  runtimeVersion?: string;
  exporterId?: string;
  exporterVersion?: string;
  viewport?: ViewportSpec;
  cameraId?: string;
  timelineId?: string;
  time?: number;
  frame?: number;
  qualityMode: QualityMode;
  deterministicSeed: number;
  metrics: ValidationMetricSet;
  thresholds: ValidationThresholdSet;
  regions: ValidationRegionResult[];
  issues: ValidationIssue[];
  differenceAssetIds: string[];
  status: "PASS" | "WARN" | "FAIL";
  createdAt: string;
  createdBy: ActorRef;
}
```

---

## 6. Validation Inputs

A validation run may require:

- Reference ID
- Reference region
- Render asset
- Render configuration
- Document version
- Viewport
- Camera
- Timeline
- Time
- Frame
- Quality mode
- Metric set
- Metric weights
- Threshold profile
- Region definitions
- Color space
- Alignment policy
- Ignore masks
- Priority masks

---

## 7. Deterministic Render Requirements

Validation renders shall pin:

- Document version
- Schema version
- Asset hashes
- Font hashes
- Renderer version
- Browser version
- Runtime version
- Viewport
- Device scale factor
- Camera
- Lighting
- Timeline
- Time
- Frame
- Random seed
- Physics timestep
- Simulation cache
- Quality mode
- Color space
- Tone mapping
- Exposure
- Post-processing
- Reduced-motion state

The system shall wait for:

- Fonts
- Images
- Videos
- Models
- Textures
- Shaders
- Layout stabilization
- Animation initialization
- Physics initialization
- Required asynchronous resources

---

## 8. Reference Preparation

Before comparison, the system shall inspect the reference for:

- Resolution
- Aspect ratio
- Crop
- Rotation
- Color space
- Compression artifacts
- Noise
- Browser chrome
- Device frame
- Background
- Transparency
- Perspective
- Camera metadata
- Motion blur
- Depth of field
- Lighting variation

Reference preparation shall produce derivatives without modifying the original.

---

## 9. Alignment

The system shall align reference and render before comparison.

Alignment modes may include:

- Exact pixel alignment
- Translation-only
- Scale and translation
- Perspective alignment
- Camera-matched alignment
- Landmark alignment
- Region alignment

Alignment shall be recorded.

The system shall avoid over-aligning in ways that hide layout errors.

---

## 10. Ignore Masks

Ignore masks may exclude:

- Dynamic timestamps
- User-specific data
- Live video
- Ads
- Browser UI
- Cursor
- Non-deterministic particle regions
- Explicitly unsupported regions

Ignore masks shall be visible in the report.

They shall not be used to conceal important errors.

---

## 11. Priority Regions

Priority regions may include:

- Logo
- Heading
- Face
- Product silhouette
- CTA
- Hero object
- Navigation
- Critical material region
- Camera focal region

Priority regions may use:

- Higher metric weights
- Stricter thresholds
- Additional comparison passes
- Mandatory human review

---

## 12. 2D Metric Set

2D comparison shall support:

- Raw pixel difference
- Mean absolute error
- Root mean square error
- Perceptual similarity
- Structural similarity
- Multi-scale structural similarity
- Edge similarity
- Silhouette similarity
- Bounding-box similarity
- Alignment similarity
- Spacing similarity
- Typography similarity
- Baseline similarity
- Color similarity
- Gradient similarity
- Shadow similarity
- Glow similarity
- Blur similarity
- Asset similarity
- Region similarity

No single metric shall be treated as universally sufficient.

---

## 13. Raw Pixel Difference

Raw pixel difference shall measure exact per-channel difference.

It is useful for:

- Deterministic regression
- Flat-color UI
- Exact alignment
- Stable effects

It is sensitive to:

- Anti-aliasing
- Color-management differences
- Subpixel text rendering
- Noise
- Compression

Raw difference shall be interpreted with other metrics.

---

## 14. Perceptual Similarity

Perceptual similarity shall estimate visible difference.

It shall account for:

- Local contrast
- Visual salience
- Texture
- Human perception
- Small color variation
- Anti-aliasing differences

The implementation shall record metric version and settings.

---

## 15. Structural Similarity

Structural similarity shall compare:

- Luminance
- Contrast
- Structure

It shall support:

- Whole-image SSIM
- Region SSIM
- Multi-scale SSIM

---

## 16. Edge Comparison

Edge comparison shall detect:

- Shape differences
- Misalignment
- Missing borders
- Incorrect silhouettes
- Typography contour mismatch
- Vector path mismatch

Edge extraction settings shall be pinned.

---

## 17. Silhouette Comparison

Silhouette comparison shall be used for:

- Isolated objects
- Characters
- Products
- 3D renders
- Large shapes
- Masks

Metrics may include:

- Intersection over Union
- Boundary distance
- Chamfer distance
- Hausdorff distance
- Contour similarity

---

## 18. Bounding-Box Comparison

Bounding-box validation shall compare:

- Position
- Width
- Height
- Aspect ratio
- Center
- Rotation
- Parent-relative placement

It shall support:

- Node boxes
- Text boxes
- Asset boxes
- Component boxes
- Region boxes

---

## 19. Alignment Comparison

Alignment validation shall check:

- Left edges
- Right edges
- Top edges
- Bottom edges
- Centers
- Baselines
- Grid lines
- Repeated columns
- Repeated rows

---

## 20. Spacing Comparison

Spacing validation shall measure:

- Padding
- Margin
- Gaps
- Row spacing
- Column spacing
- Paragraph spacing
- Card spacing
- Section spacing
- Repeated rhythm

The system shall distinguish systematic spacing errors from isolated errors.

---

## 21. Color Comparison

Color validation shall compare:

- Solid fills
- Dominant colors
- Local colors
- Color clusters
- Brand palette
- Alpha
- Color-space conversion

Metrics may include:

- Delta E
- RGB distance
- Lab distance
- Histogram similarity

Color comparison shall use controlled color management.

---

## 22. Gradient Comparison

Gradient validation shall compare:

- Type
- Angle
- Center
- Radius
- Stops
- Stop colors
- Stop positions
- Opacity
- Spread
- Mesh points where applicable

---

## 23. Shadow Comparison

Shadow validation shall compare:

- Offset
- Blur radius
- Spread
- Color
- Opacity
- Softness
- Direction
- Contact region
- Inner versus outer shadow

---

## 24. Glow and Bloom Comparison

Glow validation shall compare:

- Radius
- Intensity
- Color
- Threshold
- Falloff
- Layer relationship

Bloom validation shall distinguish source emission from post-processing bloom.

---

## 25. Blur Comparison

Blur validation shall compare:

- Blur type
- Radius
- Direction
- Motion vector
- Background versus foreground blur
- Edge preservation

---

## 26. Asset Similarity

Asset similarity shall compare:

- Subject identity
- Crop
- Scale
- Perspective
- Color
- Detail
- Segmentation
- Mask
- Relighting
- Texture

The system shall distinguish asset mismatch from layout mismatch.

---

## 27. Typography Validation

Typography shall have a dedicated validation subsystem.

It shall compare:

- Font match status
- Glyph silhouette
- Character width
- Word width
- Line width
- Line breaks
- Baseline
- Cap height
- X-height
- Line height
- Letter spacing
- Word spacing
- Kerning
- Paragraph spacing
- Alignment
- Weight
- Width
- Slant
- Fill
- Stroke
- Effects
- Text block dimensions

---

## 28. Typography Validation Levels

Typography validation shall support:

- Text-block level
- Line level
- Word level
- Character level
- Baseline-only mode
- Outline-only mode
- Fill-only mode
- Effect-only mode

---

## 29. Font Identity Validation

The report shall preserve:

```text
EXACT
LIKELY_MATCH
CLOSE_SUBSTITUTE
UNKNOWN
OUTLINED_FROM_REFERENCE
```

A high visual score shall not silently convert a substitute to `EXACT`.

---

## 30. Line-Break Validation

Line-break validation shall compare:

- Number of lines
- Character ranges per line
- Word wrapping
- Hyphenation
- Truncation
- Ellipsis
- Widow and orphan differences where applicable

---

## 31. Baseline Validation

Baseline validation shall compare:

- Baseline position
- Baseline consistency
- Mixed-font baseline shift
- Superscript
- Subscript
- Vertical alignment

---

## 32. Responsive Validation

Responsive validation shall test:

- Desktop
- Tablet
- Mobile
- Portrait
- Landscape
- Container-query states
- Reduced-motion state
- High-density displays

It shall compare:

- Layout
- Reordering
- Visibility
- Typography
- Crops
- Components
- Animation
- Camera
- 3D quality profile

---

## 33. Breakpoint Completeness

A responsive project shall fail completeness when:

- Required breakpoints are missing
- Important nodes overflow
- Text becomes unreadable
- Controls overlap
- Assets crop incorrectly
- Camera framing fails
- 3D performance fallback is absent
- Reduced-motion alternative is absent where required

---

## 34. Behavioural Validation

Behavioural validation shall test:

- Page-load animation
- Scroll animation
- Scroll ranges
- Pinning
- Hover
- Click
- Drag
- Hold
- Keyboard
- Route changes
- State transitions
- Audio synchronization
- Video synchronization
- Custom events

---

## 35. Timeline Validation

Timeline validation shall inspect:

- Duration
- Frame rate
- Keyframe order
- Keyframe values
- Easing
- Nested timelines
- Labels
- Loop regions
- Trigger bindings
- Target paths
- Conflicting tracks
- Missing targets

---

## 36. Motion Similarity

Motion comparison may measure:

- Object trajectories
- Timing
- Velocity
- Acceleration
- Easing
- Rotation
- Scale
- Opacity
- Path shape
- Pause timing
- Contact timing
- Camera movement
- Loop continuity

---

## 37. Frame-Sampled Validation

Animation validation may sample:

- Start
- End
- Timeline labels
- Keyframes
- Motion extrema
- Contact frames
- Scene cuts
- Evenly spaced frames
- High-error frames

Maximum Fidelity may render full sequences.

---

## 38. Optical Flow Comparison

Motion references may use optical flow to compare:

- Direction
- Magnitude
- Velocity fields
- Camera movement
- Object movement
- Secondary motion

Optical flow settings shall be versioned.

---

## 39. Interaction Validation

Interaction validation shall confirm:

- Trigger activates
- Correct target changes
- Correct timeline plays
- Reverse behaviour works
- State transitions are valid
- Keyboard equivalent exists where required
- Reduced-motion behaviour works
- Focus state remains correct

---

## 40. 3D Validation Scope

3D validation shall include:

- File integrity
- Scene hierarchy
- Geometry
- Topology
- UVs
- Materials
- Textures
- Rigging
- Skinning
- Animation
- Camera
- Lighting
- Environment
- Physics
- Performance
- Multi-angle visual comparison

---

## 41. Geometry Validation

Geometry validation shall inspect:

- Silhouette
- Proportions
- Volume
- Part placement
- Thickness
- Symmetry
- Curvature
- Edge position
- Surface continuity
- Landmarks
- Holes
- Intersections
- Duplicate geometry
- Normals
- Tangents

---

## 42. Topology Validation

Topology validation shall inspect:

- Vertex count
- Edge count
- Face count
- Triangle count
- Quad ratio
- N-gons
- Poles
- Non-manifold edges
- Boundary edges
- Duplicate vertices
- Overlapping faces
- Hidden intersections
- Edge flow
- Subdivision readiness
- Deformation readiness
- LOD readiness

---

## 43. UV Validation

UV validation shall inspect:

- Missing UVs
- Overlaps
- Distortion
- Stretch
- Packing efficiency
- Texel-density consistency
- Padding
- Island orientation
- UDIM assignment
- Material conflicts

---

## 44. Texture Validation

Texture validation shall inspect:

- Correct channel
- Correct color space
- Resolution
- Bit depth
- Seam quality
- UV alignment
- Tiling
- Compression artifacts
- Normal orientation
- PBR plausibility
- Missing maps

---

## 45. Rig Validation

Rig validation shall inspect:

- Bone hierarchy
- Missing bones
- Duplicate bones
- Rest pose
- Bind pose
- Constraints
- IK chains
- FK chains
- Pole targets
- Control ranges
- Retargeting metadata
- Export compatibility

---

## 46. Skinning Validation

Skinning validation shall inspect:

- Weight normalization
- Maximum influences
- Detached vertices
- Weight leaks
- Symmetry
- Pose deformation
- Volume loss
- Pinching
- Penetration

---

## 47. Character Animation Validation

Character animation validation shall compare:

- Root motion
- Joint trajectories
- Foot contact
- Hand contact
- Balance
- Pose timing
- Loop continuity
- Ground interaction
- Facial motion
- Lip sync
- Limb penetration

---

## 48. Camera Validation

Camera validation shall compare:

- Projection
- Position
- Rotation
- Quaternion
- Focal length
- Field of view
- Sensor
- Subject distance
- Horizon
- Vanishing points
- Crop
- Roll
- Lens shift
- Depth of field
- Focus distance
- Framing

Camera error shall be separated from geometry error.

---

## 49. Material Validation

Material validation shall compare:

- Base color
- Roughness
- Metalness
- Reflectivity
- Transparency
- IOR
- Emission
- Subsurface scattering
- Clearcoat
- Anisotropy
- Iridescence
- Micro-surface detail

---

## 50. Lighting Validation

Lighting validation shall compare:

- Direction
- Size
- Intensity
- Color
- Temperature
- Shadow softness
- Fill ratio
- Rim light
- Contact shadow
- Reflection source
- Environment contribution
- Volumetric contribution

---

## 51. Shadow Validation in 3D

3D shadow validation shall inspect:

- Position
- Shape
- Contact
- Softness
- Direction
- Opacity
- Occlusion
- Light relationship

---

## 52. Reflection Validation

Reflection validation shall inspect:

- Reflection direction
- Intensity
- Blur
- Environment source
- Material response
- Continuity
- Probe placement

---

## 53. Multi-Angle Validation

For each view:

```text
Load matched camera
→ Render
→ Align
→ Compare silhouette
→ Compare landmarks
→ Compare proportions
→ Compare materials
→ Compare lighting
→ Record score
```

The aggregate report shall include:

- Per-view score
- Worst-view score
- Average score
- Weighted score
- Cross-view consistency
- Conflicting corrections

---

## 54. Cross-View Consistency

The system shall detect when a correction improves one angle but degrades another.

Cross-view correction shall optimize:

- Aggregate score
- Priority views
- Worst-view threshold
- Landmark consistency
- Silhouette consistency

---

## 55. Turntable Validation

Turntable validation shall inspect:

- Silhouette continuity
- Surface continuity
- Texture seams
- Material consistency
- Part alignment
- Reflection continuity
- Hidden geometry
- LOD transitions
- Camera stability

---

## 56. Camera-Angle Comparison

Camera-angle comparison shall compare:

- Azimuth
- Elevation
- Roll
- Subject framing
- Distance
- Focal characteristics

---

## 57. Proportion Comparison

Proportion validation shall use:

- Landmark distances
- Ratios
- Bounding volumes
- Section widths
- Section heights
- Limb lengths
- Product dimensions
- Symmetry

---

## 58. Landmark Comparison

Landmarks shall be weighted by importance.

Examples:

- Eyes
- Jaw
- Shoulders
- Hands
- Mechanical openings
- Product corners
- Logo positions
- Surface transitions

---

## 59. Region Definitions

A Validation Region may be:

- Rectangle
- Polygon
- Mask
- Node-derived region
- Reference annotation
- Object ID region
- Material ID region
- Text range
- Camera focal region

---

## 60. Region Result

```ts
interface ValidationRegionResult {
  regionId: string;
  name: string;
  priority: number;
  metrics: Record<string, number>;
  weightedScore: number;
  threshold: number;
  status: "PASS" | "WARN" | "FAIL";
  responsibleEntityIds?: string[];
  differenceAssetIds?: string[];
}
```

---

## 61. Score Normalization

Scores shall normally use a 0–1 range:

```text
0.0 = no similarity
1.0 = perfect similarity under the selected metric
```

The report shall state when a metric uses a different range.

---

## 62. Metric Weighting

Overall similarity may be computed from weighted metrics.

Example:

```json
{
  "layout": 0.25,
  "typography": 0.20,
  "color": 0.10,
  "asset": 0.15,
  "effects": 0.10,
  "structure": 0.10,
  "priorityRegions": 0.10
}
```

Weights shall be explicit and profile-specific.

---

## 63. Example Similarity Report

```json
{
  "overallSimilarity": 0.972,
  "layoutSimilarity": 0.991,
  "typographySimilarity": 0.948,
  "colorSimilarity": 0.982,
  "assetSimilarity": 0.963,
  "effectsSimilarity": 0.956
}
```

The report shall also include the worst regions.

---

## 64. Threshold Profiles

The system shall support threshold profiles such as:

### Draft

- Lower overall threshold
- Limited region requirements
- Warnings allowed

### High Quality

- Strong overall threshold
- Strong typography and layout requirements
- Limited failures allowed

### Maximum Fidelity

- High overall threshold
- Strict priority-region thresholds
- Strict typography threshold
- Strict worst-region threshold
- Required multi-angle consistency
- Required export validation

Threshold values shall be configurable and versioned.

---

## 65. Completion Rules

Completion shall require more than a high average score.

Possible rules:

- Overall score passes
- Layout score passes
- Typography score passes
- No critical region fails
- Worst-region score passes
- Required viewports pass
- Required 3D views pass
- Structural validation passes
- Export-readiness passes
- Unsupported features are acknowledged
- Performance profile exists
- Accessibility requirements pass where applicable

---

## 66. Validation Status

```text
PASS
WARN
FAIL
```

### PASS

All required thresholds and completion rules are satisfied.

### WARN

Output is usable but contains documented limitations.

### FAIL

One or more mandatory requirements are not satisfied.

---

## 67. Validation Issues

```ts
interface ValidationIssue {
  id: string;
  code: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  category: string;
  message: string;
  metric?: string;
  score?: number;
  threshold?: number;
  regionId?: string;
  entityIds?: string[];
  suggestedCorrectionTypes?: string[];
}
```

---

## 68. Difference Heatmaps

The system shall generate:

- Raw difference heatmap
- Perceptual heatmap
- Edge heatmap
- Typography heatmap
- Layout heatmap
- Color heatmap
- 3D silhouette heatmap
- Landmark heatmap
- Material heatmap
- Lighting heatmap

Heatmaps shall use legends and normalized ranges.

---

## 69. Inspection Modes

The validation interface shall support:

- Side-by-side
- Overlay
- Flicker
- Difference heatmap
- Edge-only
- Typography-only
- Layer-only
- Mask-only
- Object-ID view
- Material-ID view
- Depth view
- Normal view
- Zoomed region
- Responsive breakpoint comparison
- Multi-angle view
- Turntable comparison

---

## 70. Flicker Comparison

Flicker comparison shall alternate reference and render at a controlled rate.

It is useful for:

- Alignment
- Typography
- Proportion
- Camera
- Shape differences

---

## 71. Overlay Comparison

Overlay comparison shall support:

- Opacity control
- Blend modes
- Difference mode
- Alignment guides
- Region clipping
- Color-channel isolation

---

## 72. Node Attribution

The system should map pixels or regions back to:

- Node ID
- Text run
- Asset ID
- Material ID
- Mesh ID
- Camera ID
- Light ID
- Timeline ID
- Keyframe ID

Possible methods include:

- Object ID pass
- Layer ID pass
- Material ID pass
- DOM region map
- SVG map
- Scene metadata

---

## 73. Error Diagnosis

Validation diagnosis shall identify likely causes.

Examples:

- Node positioned incorrectly
- Wrong font
- Incorrect line height
- Wrong crop
- Wrong gradient angle
- Missing shadow
- Incorrect material roughness
- Incorrect focal length
- Incorrect camera distance
- Wrong light direction
- Mesh proportion error
- Animation timing error

---

## 74. Diagnosis Ranking

Issues shall be ranked by:

- Severity
- Visual impact
- Region priority
- Confidence
- Fixability
- Dependency risk
- Number of affected viewports
- Number of affected views

---

## 75. Autonomous Correction Input

Validation shall produce correction-ready data.

Example:

```json
{
  "issueId": "issue_42",
  "responsibleEntityIds": ["node_title"],
  "suggestedCorrectionTypes": [
    "typography.adjust_font_size",
    "typography.adjust_letter_spacing"
  ],
  "expectedImpact": 0.018,
  "confidence": 0.88
}
```

The validation subsystem shall not apply the correction directly.

---

## 76. Correction Evaluation

After a proposed correction:

```text
Render candidate
→ Revalidate
→ Compare previous score
→ Compare affected regions
→ Check regressions
→ Accept or reject
```

A correction shall be rejected if it:

- Reduces critical-region score
- Breaks structure
- Breaks responsive variants
- Reduces export compatibility
- Violates locked constraints
- Introduces new critical issues

---

## 77. Convergence Tracking

The system shall track:

- Pass number
- Overall score
- Metric scores
- Worst-region score
- Issue count
- Critical issue count
- Accepted corrections
- Rejected corrections
- Score gain
- Score plateau
- Regression events

---

## 78. Plateau Detection

The system may declare a plateau when:

- Multiple passes produce negligible gain
- Remaining errors are unsupported
- Remaining errors require missing source information
- Conflicting references prevent improvement
- Resource limits are reached

Plateau shall not be reported as success unless thresholds pass.

---

## 79. Regression Validation

Regression validation shall compare a new version against:

- Approved baseline
- Previous version
- Export baseline
- Browser baseline
- Mobile baseline
- 3D turntable baseline

Regression reports shall identify changed regions.

---

## 80. Golden Baselines

Golden baselines shall be versioned.

A baseline shall include:

- Document version
- Renderer version
- Browser version
- Asset hashes
- Font hashes
- Viewport
- Camera
- Time
- Seed
- Color space
- Quality profile

---

## 81. Export Validation

Export validation shall follow:

```text
Generate target
→ Install dependencies
→ Build
→ Launch
→ Render known states
→ Compare with canonical render
→ Inspect runtime errors
→ Inspect accessibility
→ Inspect performance
→ Produce report
```

---

## 82. Code-Render Comparison

Code-render comparison shall validate:

- Layout
- Typography
- Assets
- Effects
- Animation states
- Responsive behaviour
- 3D scene
- Camera
- Lighting
- Interactions

Successful compilation alone shall not count as success.

---

## 83. Canva Validation

Canva validation shall inspect:

- Native editable text
- Native vectors
- Native shapes
- Separate images
- Separate shadows
- Separate glows
- Layer order
- Flattened regions
- Font availability
- Multiple camera pages
- Page dimensions
- Visual similarity

---

## 84. Canva Editability Report

The report shall include:

```text
Native editable elements: 72%
Editable media layers: 23%
Flattened unsupported effects: 5%
```

Percentages shall be calculated from explicit mappings.

---

## 85. 3D Web Validation

3D web validation shall inspect:

- Model loading
- Texture loading
- Material loading
- Camera behaviour
- Lighting behaviour
- Animation playback
- Interaction
- Frame rate
- Draw calls
- Texture memory
- Initial load
- Progressive loading
- Mobile quality
- Static fallback

---

## 86. Performance Validation

Performance validation shall remain separate from visual similarity.

It shall report:

- Average FPS
- Minimum FPS
- Frame-time percentiles
- CPU time
- GPU time
- Draw calls
- Triangle count
- Texture memory
- Initial load size
- Total asset size
- Time to interactive
- Shader compile time
- Peak memory

---

## 87. Performance Budgets

Profiles may define:

- Maximum frame time
- Maximum draw calls
- Maximum triangles
- Maximum texture memory
- Maximum initial load
- Maximum total load
- Maximum shader complexity
- Maximum particle count

---

## 88. Accessibility Validation

Applicable exports shall validate:

- Semantic structure
- Keyboard navigation
- Focus visibility
- Alt text
- ARIA
- Contrast
- Reduced motion
- Pausable motion
- Flashing limits
- Non-WebGL fallback

---

## 89. Validation Jobs

Long-running validation shall use jobs.

Examples:

- Full-page comparison
- Multi-breakpoint validation
- Full animation sequence
- Multi-angle 3D validation
- Turntable validation
- Export build validation
- Maximum Fidelity pass

Jobs shall support:

- Progress
- Cancellation
- Retry
- Checkpoints
- Partial results
- Result resources

---

## 90. MCP Validation Tools

Validation MCP tools shall include:

```text
compare.compare_2d_render
compare.compare_typography
compare.compare_layout
compare.compare_assets
compare.compare_3d_render
compare.compare_reference_angles
compare.compare_turntable
compare.generate_heatmap
compare.get_report
compare.list_issues
compare.validate_export
compare.validate_performance
```

---

## 91. Validation Tool Response

A comparison response shall include:

- Validation ID
- Status
- Overall score
- Metric scores
- Region scores
- Thresholds
- Issues
- Difference assets
- Responsible entities
- Suggested correction types
- Document version
- Reference versions
- Renderer versions

---

## 92. Validation Permissions

Permissions may include:

```text
validation.read
validation.execute
validation.manage_baselines
validation.delete_noncanonical_output
```

Historical Validation Records shall not be deleted by standard write permissions.

---

## 93. Validation Security

The system shall:

- Sandbox export validation
- Sanitize references
- Restrict untrusted code
- Restrict external URLs
- Control resource usage
- Prevent cross-workspace access
- Preserve audit logs
- Avoid exposing secret paths

---

## 94. Validation Caching

The system may cache:

- Render outputs
- Edge maps
- Masks
- Typography measurements
- Alignment transforms
- Metric results
- Region crops
- Object-ID passes

Cache keys shall include all output-affecting inputs.

---

## 95. Validation Observability

The system shall record:

- Validation duration
- Render duration
- Metric duration
- Region count
- Image resolution
- Frame count
- View count
- GPU use
- CPU use
- Memory
- Cache hits
- Failures
- Score progression

---

## 96. Human Review

Human review shall be supported when:

- References conflict
- Font remains unknown
- Camera estimate is ambiguous
- Materials are ambiguous
- Lighting is stylized
- Validation metrics disagree
- High score does not reflect perceived quality
- Low score is caused by harmless renderer variance
- Required fallback needs approval

Human review decisions shall be recorded.

---

## 97. Validation Failure Classes

Failure classes include:

- Reference missing
- Render missing
- Determinism failure
- Alignment failure
- Metric failure
- Unsupported comparison
- Camera mismatch
- Asset mismatch
- Font mismatch
- Multi-view conflict
- Export runtime failure
- Resource exhaustion
- Corrupt difference output

---

## 98. Validation Testing Requirements

Testing shall include:

- Metric unit tests
- Alignment tests
- Color-management tests
- Typography fixtures
- Layout fixtures
- Edge fixtures
- Shadow fixtures
- Responsive fixtures
- Animation fixtures
- Camera fixtures
- Material fixtures
- Lighting fixtures
- Multi-angle fixtures
- Turntable fixtures
- Export validation fixtures
- Performance fixtures
- Regression baseline tests
- Determinism tests
- Error attribution tests

---

## 99. Acceptance Criteria

The Visual Validation system shall be implementation-ready when it can:

- Create immutable Validation Records
- Produce deterministic comparison renders
- Align reference and output
- Compare raw pixels
- Compare perceptually
- Compare structure
- Compare edges
- Compare silhouettes
- Compare layout
- Compare spacing
- Compare typography
- Compare colors
- Compare gradients
- Compare shadows and effects
- Validate responsive breakpoints
- Validate animation
- Validate 3D geometry
- Validate topology and UVs
- Validate cameras
- Validate materials
- Validate lighting
- Validate multiple views
- Validate turntables
- Produce heatmaps
- Attribute errors to entities
- Produce correction-ready issues
- Validate exports
- Validate performance
- Apply completion thresholds
- Track convergence
- Detect plateaus
- Support regression baselines

---

## 100. Final Visual Validation Statement

Visual Validation is the measurement and quality-control system of the AEVUM AI Reconstruction Engine.

It shall provide deterministic, region-aware, typography-aware, responsive, motion-aware, and multi-angle 3D comparison while producing immutable evidence, actionable issue attribution, export verification, and completion decisions for the Maximum Fidelity workflow.

## 101. Phase 20 Lighting Validation Implementation

Phase 20 provides a dedicated deterministic lighting report with separate lighting and material
scores. It measures key direction, color temperature, key-to-fill ratio, active and shadow light
counts, reflection probes, environment availability, shadow quality, and reflection quality.
Material issues are attributed to the material domain and do not silently reduce the lighting score.

Correction entries are bounded proposals only. They identify the canonical light and property; they
never mutate the document and must be applied through the Command Engine by an approved workflow.
