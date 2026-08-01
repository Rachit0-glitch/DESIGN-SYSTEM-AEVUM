# AEVUM AI Reconstruction Engine — Reconstruction Pipeline

## 1. Purpose

This document defines the end-to-end Reconstruction Pipeline of the AEVUM AI Reconstruction Engine.

It explains how visual references are converted into structured, editable, validated, and export-ready 2D and 3D project data.

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`
- `03_DESIGN_DOCUMENT_MODEL.md`

This document is authoritative for:

- Reference ingestion
- Reference preprocessing
- 2D structure detection
- Typography inference
- Asset extraction
- Layout reconstruction
- Responsive reconstruction
- Motion reconstruction
- 3D reconstruction
- Multi-view consistency
- Initial scene generation
- Render-and-compare cycles
- Autonomous correction
- Reconstruction confidence
- Failure handling
- Completion criteria

The Reconstruction Pipeline shall always produce structured proposals and commands compatible with the Canonical Design Document.

It shall not bypass the Command Engine or mutate project state directly.

---

## 2. Pipeline Objective

The Reconstruction Pipeline shall transform one or more visual references into a project that is:

- Structured
- Editable
- Inspectible
- Responsive
- Animatable
- Validatable
- Exportable
- Traceable to source references
- Compatible with 2D and 3D rendering
- Compatible with MCP control
- Compatible with Multi-Stack Export
- Compatible with Canva Export

The pipeline shall optimize for both:

- Visual fidelity
- Structural correctness

A reconstruction shall not be considered complete merely because one final screenshot appears similar.

The system shall also preserve:

- Layer hierarchy
- Layout intent
- Typography structure
- Asset provenance
- Responsive behaviour
- Animation intent
- 3D scene hierarchy
- Camera intent
- Lighting intent
- Export compatibility
- Validation history

---

## 3. Core Reconstruction Loop

The primary reconstruction loop shall be:

```text
Reference ingestion
→ Reference normalization
→ Analysis
→ Structural proposal
→ Canonical Design Document generation
→ Render
→ Compare
→ Diagnose
→ Correct
→ Render again
→ Repeat
→ Finalize
```

Maximum Fidelity mode shall permit repeated iterations without an arbitrary low pass limit.

The stopping condition shall be based on:

- Validation thresholds
- Error convergence
- Remaining unsupported features
- User-defined quality requirements
- Resource limits
- Explicit failure conditions

---

## 4. Reconstruction Modes

The pipeline shall support:

### 4.1 Draft

- Fast preprocessing
- Coarse segmentation
- Basic typography estimation
- Basic layer proposal
- Minimal correction passes
- Lower-quality 3D proxy generation
- Limited responsive inference
- Limited validation

### 4.2 High Quality

- Detailed segmentation
- Structured typography analysis
- Asset processing
- Responsive reconstruction
- Multiple validation passes
- Refined 3D geometry
- Material and lighting approximation
- Export-readiness checks

### 4.3 Maximum Fidelity

- Full-resolution analysis
- Region-by-region reconstruction
- Exact uploaded font usage
- Detailed typography correction
- Precise vector reconstruction
- Advanced mask and effect recreation
- Multi-angle 3D reconstruction
- Detailed materials
- Camera matching
- Lighting matching
- Repeated render-and-compare passes
- Code-render comparison
- Canva editability validation
- No arbitrary low iteration limit

The quality mode shall affect processing depth, not the logical structure of the pipeline.

---

## 5. Pipeline Stages

The complete pipeline shall consist of:

1. Task definition
2. Reference ingestion
3. Reference registration
4. Reference normalization
5. Reference segmentation
6. Semantic analysis
7. Typography analysis
8. Asset analysis
9. Layout inference
10. Component inference
11. Responsive inference
12. Motion analysis
13. 3D analysis
14. Reconstruction proposal
15. Command generation
16. Initial document creation
17. Render preparation
18. Deterministic rendering
19. Visual comparison
20. Error diagnosis
21. Autonomous correction
22. Export-readiness validation
23. Completion evaluation
24. Final reporting

Each stage shall produce inspectable outputs.

---

## 6. Task Definition

Before processing begins, the system shall define a Reconstruction Task.

```ts
interface ReconstructionTask {
  taskId: string;
  projectId: string;
  qualityMode: QualityMode;
  referenceIds: string[];
  targetOutputs: ReconstructionTarget[];
  requiredViewports?: ViewportSpec[];
  targetExporters?: string[];
  preserveEditability: boolean;
  allowFlattening: boolean;
  requested3DMode?: string;
  requestedMotionMode?: string;
  completionThresholds?: Record<string, number>;
  constraints?: Record<string, unknown>;
}
```

The task shall define:

- Primary references
- Secondary references
- Target outputs
- Required quality
- Allowed fallbacks
- Responsive requirements
- 3D requirements
- Animation requirements
- Export targets
- Validation thresholds

---

## 7. Reference Ingestion

The system shall ingest references including:

- PNG
- JPG
- JPEG
- WebP
- AVIF
- SVG
- GIF
- Video
- Website screenshots
- Full-page captures
- Existing website renders
- UI designs
- Posters
- Branding references
- Product images
- Character references
- Interior references
- Environment references
- 3D turnarounds
- Front, side, back, and top views
- GLB
- GLTF
- FBX
- OBJ
- STL
- USD
- USDZ where practical
- Blender scene conversions
- HTML
- CSS
- JavaScript
- TypeScript
- React source
- Next.js source
- Fonts
- Texture folders
- HDRIs

Every ingested reference shall be registered as an immutable Asset Record and a Reference Record.

---

## 8. Reference Registration

Each reference shall record:

- Stable reference ID
- Asset ID
- Reference type
- Primary or secondary role
- Viewport
- Aspect ratio
- Resolution
- Color space
- Camera hints
- Orientation
- Frame rate where applicable
- Duration where applicable
- Angle label where applicable
- Source provenance
- License metadata
- Ingestion timestamp

Multiple references shall be grouped into a reference set.

Example:

```text
Product Front
Product Side
Product Back
Product Top
Product Detail
Product Motion Reference
```

---

## 9. Reference Normalization

Normalization shall prepare references for consistent analysis.

Operations may include:

- Color-space normalization
- Orientation correction
- EXIF rotation handling
- Resolution registration
- Perspective normalization
- Frame extraction
- Video stabilization
- Deinterlacing
- Crop detection
- Border removal
- Browser chrome detection
- Device frame detection
- Screenshot stitching
- Background separation
- Alpha validation
- Noise estimation
- Compression artifact analysis

Original references shall remain unchanged.

Normalized variants shall be stored as derivatives.

---

## 10. Multi-Resolution Analysis

The pipeline shall analyze references at multiple scales.

Recommended passes include:

### Global pass

Detect:

- Overall composition
- Major sections
- Primary hierarchy
- Scene structure
- Main subject
- Camera composition

### Mid-level pass

Detect:

- Cards
- Components
- Groups
- Text blocks
- Repeated objects
- Material regions
- Model parts

### Fine pass

Detect:

- Glyph shape
- Border radius
- Small icons
- Texture details
- Edge loops
- Surface imperfections
- Fine masks
- Micro-spacing

Maximum Fidelity mode shall permit region-specific high-resolution passes.

---

## 11. 2D Segmentation

The pipeline shall segment 2D references into candidate regions.

Candidate types include:

- Page
- Frame
- Section
- Navigation
- Header
- Footer
- Text block
- Button
- Card
- Image
- Icon
- Shape
- Vector
- Background
- Foreground
- Decorative effect
- Mask
- Video region
- 3D render region
- Canvas region
- WebGL region

Each candidate shall include:

- Bounding box
- Polygon or mask
- Confidence
- Layer depth estimate
- Semantic type
- Parent candidate
- Child candidates
- Repetition metadata
- Occlusion metadata
- Source region

---

## 12. Layer Depth and Occlusion

The pipeline shall infer:

- Foreground versus background
- Layer order
- Occlusion relationships
- Mask relationships
- Clipping relationships
- Embedded content
- Overlapping sections
- Fixed and sticky elements
- Transparent overlays

The result shall be a proposed editable layer hierarchy.

The pipeline shall avoid flattening overlapping structures when independent layers can be recovered.

---

## 13. Semantic Analysis

The pipeline shall infer semantic roles such as:

- Primary navigation
- Secondary navigation
- Hero section
- CTA
- Card
- Form
- Gallery
- Testimonial
- Pricing section
- Footer
- Modal
- Tooltip
- Product viewer
- 3D viewport
- Video player
- Carousel
- Tab system
- Accordion

Semantic inference shall support:

- Better component generation
- Better accessibility
- Better export
- Better responsive reconstruction
- Better interaction reconstruction

Semantic roles shall include confidence metadata.

---

## 14. Text Detection

The pipeline shall detect:

- Text regions
- Line structure
- Paragraph structure
- Character ranges
- Mixed styles
- Text alignment
- Baseline
- Text direction
- Rotated text
- Curved text
- Text on path
- Distorted text
- Outlined text
- Masked text

Text detection shall preserve geometry even when OCR confidence is low.

---

## 15. Typography Analysis

Typography reconstruction shall analyze:

- Font family
- Font weight
- Font width
- Font style
- Font size
- Line height
- Letter spacing
- Word spacing
- Kerning
- Baseline
- Paragraph spacing
- Alignment
- OpenType features
- Variable font axes
- Per-character differences
- Stroke
- Fill
- Gradient
- Mask
- Perspective
- Distortion

The engine shall classify font confidence as:

```text
EXACT
LIKELY_MATCH
CLOSE_SUBSTITUTE
UNKNOWN
OUTLINED_FROM_REFERENCE
```

An exact match shall only be used when verifiable.

---

## 16. Font Search and Matching

The pipeline shall compare candidate fonts using:

- Glyph silhouette
- Character width
- Word width
- Cap height
- X-height
- Stroke contrast
- Terminal shape
- Serif structure
- Slant
- Curvature
- Numeral style
- Punctuation style
- Line wrapping
- Overall text block dimensions

When the original font is uploaded, it shall be preferred.

When unavailable, the pipeline shall:

- Select the closest valid substitute
- Report uncertainty
- Preserve original reference
- Permit later font replacement
- Use outline reconstruction only when appropriate

---

## 17. Asset Extraction

The pipeline shall detect and extract:

- Photographs
- Illustrations
- Logos
- Icons
- Backgrounds
- Textures
- Product images
- Character parts
- Shadows
- Glows
- Masks
- Reflections
- Transparent overlays
- Decorative assets

Asset extraction may use:

- Segmentation
- Alpha estimation
- Background removal
- Inpainting
- Object isolation
- Perspective correction
- Color separation
- Edge reconstruction
- Layer decomposition

Each extracted asset shall be registered with provenance.

---

## 18. Asset Reconstruction Strategy

The pipeline shall decide whether an asset should be represented as:

- Native text
- Native vector
- SVG
- Raster image
- Video
- Canvas layer
- WebGL effect
- 3D object
- Separate mask
- Separate shadow
- Separate glow
- Flattened fallback

The choice shall consider:

- Visual fidelity
- Editability
- Export target
- Animation
- Performance
- Accessibility
- Target-platform limitations

---

## 19. Vector Reconstruction

Vector reconstruction shall include:

- Edge tracing
- Path fitting
- Curve simplification
- Node placement
- Boolean structure
- Stroke inference
- Fill inference
- Gradient inference
- Corner smoothing
- Symmetry detection
- Reusable symbol detection
- Text outline recovery

The pipeline shall avoid excessive nodes.

Vector complexity shall be balanced against fidelity and editability.

---

## 20. Shape and Effect Reconstruction

The pipeline shall infer:

- Solid fills
- Gradients
- Mesh gradients
- Multiple fills
- Multiple strokes
- Border radius
- Drop shadows
- Inner shadows
- Blur
- Background blur
- Glow
- Bloom
- Grain
- Noise
- Refraction
- Reflection
- Displacement
- Color grading
- Blend modes
- Alpha masks
- Luminance masks

Effects shall be reconstructed structurally where supported.

Unsupported effects shall use documented fallback layers.

---

## 21. Layout Inference

The pipeline shall infer layout intent rather than only fixed coordinates.

It shall detect:

- Flex rows
- Flex columns
- CSS grids
- Subgrids
- Stacks
- Repeated spacing
- Padding
- Margins
- Gaps
- Alignment
- Content hugging
- Fill behaviour
- Fixed sizes
- Fluid sizes
- Aspect ratios
- Container boundaries
- Sticky elements
- Fixed elements
- Absolute overlays
- Constraint relationships

Each inferred rule shall have confidence metadata.

---

## 22. Constraint Inference

The pipeline shall infer:

- Left anchoring
- Right anchoring
- Top anchoring
- Bottom anchoring
- Centering
- Stretching
- Scaling
- Parent-relative positioning
- Sibling-relative positioning
- Minimum size
- Maximum size
- Aspect-ratio locks
- Content-driven sizing

Constraint inference shall support responsive reconstruction.

---

## 23. Component Detection

The pipeline shall identify repeated structures.

Examples:

- Buttons
- Cards
- Navigation items
- Product tiles
- Tags
- Testimonials
- Feature rows
- Form fields
- Icons
- Repeated scene objects
- Repeated materials

The engine shall propose:

- Component definitions
- Instances
- Variants
- Properties
- Slots
- Overrides

Component extraction shall preserve local differences.

---

## 24. Design Token Inference

The pipeline shall infer design tokens for:

- Colors
- Spacing
- Typography
- Radii
- Shadows
- Motion
- Breakpoints
- Materials

Token inference shall use clustering and repetition analysis.

The engine shall not force unrelated values into one token merely because they are numerically close.

---

## 25. Responsive Reconstruction

Responsive reconstruction shall analyze available references across viewports.

When multiple viewport references exist, the pipeline shall compare:

- Reordering
- Resizing
- Visibility
- Cropping
- Typography
- Spacing
- Layout changes
- Component changes
- Camera changes
- 3D quality changes
- Animation changes

When only a desktop reference exists, the pipeline shall infer mobile and tablet behaviour from:

- Semantic hierarchy
- Content priority
- Layout constraints
- Component patterns
- Minimum readable sizes
- Target export conventions

The system shall not merely shrink desktop output.

---

## 26. Responsive Confidence

Each responsive decision shall include:

- Inference source
- Confidence
- Rule type
- Affected breakpoints
- Fallback
- Validation status

Low-confidence mobile redesigns shall be reported clearly.

---

## 27. Video and Motion Analysis

Motion references shall be analyzed for:

- Frame rate
- Duration
- Scene cuts
- Camera movement
- Object movement
- Character movement
- Timing
- Acceleration
- Easing
- Motion paths
- Pauses
- Overlap
- Follow-through
- Secondary motion
- Loop points
- Contact events
- Scroll relationships
- Interaction triggers

The pipeline shall extract structured motion data rather than only reproducing video pixels.

---

## 28. 2D Motion Reconstruction

The pipeline shall reconstruct:

- Position animation
- Scale animation
- Rotation animation
- Opacity animation
- Mask animation
- Path morphing
- Stroke drawing
- Blur animation
- Color animation
- Gradient animation
- Text animation
- Split-text animation
- Scroll scrubbing
- Pinned sections
- Parallax
- Page transitions
- Shared-element transitions
- Particle motion
- Cursor effects

Motion shall be represented using canonical timelines, tracks, and triggers.

---

## 29. Character Motion Analysis

For character motion, the pipeline shall detect:

- Body landmarks
- Joint trajectories
- Root motion
- Foot contacts
- Hand contacts
- Weight shifts
- Rotations
- Pose transitions
- Facial movement
- Timing
- Balance
- Ground interaction

The system shall support:

- Motion retargeting
- Foot-lock correction
- Contact correction
- Loop correction
- Motion blending

---

## 30. 3D Reconstruction Entry Paths

The 3D pipeline shall support:

1. Text-to-3D
2. Single-image reconstruction
3. Multi-view reconstruction
4. Turnaround reconstruction
5. Existing-model refinement
6. Video-assisted reconstruction
7. Scene reconstruction
8. Product reconstruction
9. Character reconstruction
10. Interior reconstruction

Each path may use different analysis stages while producing the same Canonical Design Document structures.

---

## 31. Multi-View 3D Reconstruction

Multi-view reconstruction shall use all available views to produce one consistent model.

Canonical flow:

```text
Register views
→ Identify shared landmarks
→ Estimate camera parameters
→ Align views
→ Estimate scale
→ Reconstruct coarse volume
→ Refine silhouette
→ Build part hierarchy
→ Generate topology
→ Generate UVs
→ Generate materials
→ Render all views
→ Compare
→ Correct
```

The system shall not generate unrelated models for each angle.

---

## 32. Camera Estimation for 3D References

The pipeline shall estimate:

- Perspective versus orthographic projection
- Focal length
- Field of view
- Camera position
- Camera rotation
- Subject distance
- Lens distortion
- Horizon
- Vanishing points
- Framing
- Sensor approximation

Camera estimation shall be stored with confidence metadata.

Accurate camera matching is required for reliable proportion validation.

---

## 33. 3D Landmark Matching

The pipeline shall identify:

- Primary silhouette landmarks
- Symmetry axes
- Joint positions
- Hard-surface edges
- Repeated forms
- Feature points
- Openings
- Surface transitions
- Material boundaries

Landmarks shall be linked across reference views.

---

## 34. Coarse 3D Construction

Initial construction may use:

- Primitive fitting
- Volume estimation
- Depth estimation
- Multi-view geometry
- Procedural generation
- Existing 3D generation providers
- Blender operations

Coarse geometry shall be treated as an intermediate stage.

It shall not be marked final when the reference requires detailed modelling.

---

## 35. Mesh Part Segmentation

The pipeline shall separate logical parts.

Examples:

- Body
- Head
- Arms
- Hands
- Accessories
- Mechanical parts
- Glass
- Frame
- Buttons
- Wheels
- Doors
- Furniture
- Structural elements
- Replaceable components

Each part shall receive:

- Stable mesh ID
- Human-readable name
- Parent relationship
- Pivot
- Material assignment
- Animation relevance
- Export relevance

---

## 36. Topology Generation

Topology generation shall consider:

- Surface flow
- Deformation
- Hard-surface edges
- Subdivision
- Polygon density
- Real-time constraints
- UV layout
- Rigging
- LOD generation

Final topology checks shall include:

- Duplicate geometry
- Non-manifold geometry
- Holes
- Invalid normals
- Invalid tangents
- Hidden intersections
- Excessive density
- Poor edge flow
- Deformation risk

---

## 37. UV Reconstruction

The pipeline shall generate or repair:

- UV seams
- UV islands
- Packing
- Texel density
- UDIM layout
- Material regions
- Overlap handling
- Distortion reduction

UV output shall be validated before texturing.

---

## 38. Material Reconstruction

Material reconstruction shall estimate:

- Base color
- Roughness
- Metalness
- Normal detail
- Height detail
- Displacement
- AO
- Emission
- Opacity
- Transmission
- IOR
- Clearcoat
- Anisotropy
- Subsurface scattering
- Iridescence

Materials shall be separated where the reference shows distinct surface behaviour.

---

## 39. Texture Reconstruction

Texture reconstruction may use:

- Reference projection
- Multi-view texture fusion
- Procedural generation
- AI texture generation
- Texture painting
- Baking
- Seam correction
- Detail synthesis
- Upscaling
- Color matching

Texture outputs shall remain linked to their source references and processing history.

---

## 40. Rig Reconstruction

For characters or articulated products, the pipeline shall detect:

- Joint locations
- Bone hierarchy
- Mechanical pivots
- Deformation regions
- IK chains
- FK chains
- Facial regions
- Accessory bones
- Cloth or hair controls

The pipeline shall create a rig proposal and validate deformation.

---

## 41. Lighting Reconstruction

The pipeline shall estimate:

- Light direction
- Light size
- Light color
- Color temperature
- Intensity
- Shadow softness
- Environment contribution
- Reflection sources
- Rim lighting
- Fill lighting
- Key lighting
- Volumetric contribution

The system shall distinguish between:

- Scene lighting
- Baked texture lighting
- Composited post-processing
- Reference-only visual effects

---

## 42. Environment Reconstruction

Environment reconstruction may include:

- Ground plane
- Room
- Studio environment
- Landscape
- Sky
- HDRI
- Fog
- Volumetrics
- Water
- Terrain
- Props
- Background planes
- Reflection environment

The environment shall be reconstructed only to the level required by the reference and target output.

---

## 43. Camera Sequence Reconstruction

For video and cinematic references, the pipeline shall reconstruct:

- Camera paths
- Focal changes
- Focus changes
- Camera cuts
- Camera blending
- Tracking
- Orbit
- Dolly
- Push-in
- Pull-out
- Crane
- Handheld movement
- Camera shake
- Speed ramps
- Banking
- Framing changes

Camera data shall be stored in canonical camera nodes and timelines.

---

## 44. Initial Reconstruction Proposal

After analysis, the pipeline shall produce a Reconstruction Proposal.

```ts
interface ReconstructionProposal {
  proposalId: string;
  taskId: string;
  proposedNodes: unknown[];
  proposedAssets: unknown[];
  proposedComponents: unknown[];
  proposedTimelines: unknown[];
  proposedTokens: unknown[];
  confidenceSummary: Record<string, number>;
  unresolvedIssues: ReconstructionIssue[];
  requiredFallbacks: ReconstructionFallback[];
}
```

The proposal shall remain inspectable before application.

---

## 45. Command Generation

The pipeline shall convert the proposal into structured commands.

Examples:

```text
asset.register
node.create
node.reparent
text.update_content
text.update_run
component.create
timeline.create
timeline.add_keyframe
mesh.assign_material
camera.set_properties
light.set_properties
rig.bind
```

Commands shall be grouped into transactions.

Transactions shall support:

- Dry run
- Validation
- Rollback
- Partial rejection
- Audit metadata

---

## 46. Initial Document Creation

The initial Canonical Design Document shall include:

- Root pages or scenes
- Proposed hierarchy
- Assets
- Components
- Tokens
- Timelines
- References
- Source links
- Confidence metadata
- Quality mode
- Deterministic seed
- Initial export metadata
- Initial unresolved issues

The initial document shall be structurally valid before rendering.

---

## 47. Render Preparation

Before rendering, the system shall:

- Resolve assets
- Resolve fonts
- Resolve components
- Resolve variants
- Apply responsive overrides
- Resolve timelines
- Resolve transforms
- Validate camera
- Validate lighting
- Validate materials
- Validate scene hierarchy
- Validate missing dependencies
- Pin deterministic settings

---

## 48. Deterministic Render

Validation renders shall pin:

- Document version
- Asset versions
- Font versions
- Renderer version
- Browser version
- Viewport
- Device scale factor
- Time
- Animation frame
- Random seed
- Physics state
- Camera
- Lighting
- Quality mode

The renderer shall wait for all required assets before capture.

---

## 49. 2D Comparison

2D comparison shall include:

- Raw pixel difference
- Perceptual similarity
- Structural similarity
- Edge comparison
- Silhouette comparison
- Bounding-box comparison
- Alignment comparison
- Spacing comparison
- Typography comparison
- Baseline comparison
- Color comparison
- Gradient comparison
- Shadow comparison
- Glow comparison
- Blur comparison
- Asset similarity
- Region-specific comparison

---

## 50. 3D Comparison

3D comparison shall include:

- Silhouette comparison
- Camera-angle comparison
- Perspective comparison
- Proportion comparison
- Landmark comparison
- Material comparison
- Lighting comparison
- Shadow comparison
- Reflection comparison
- Texture comparison
- Color comparison
- Multi-angle comparison
- Turntable comparison

---

## 51. Region-Based Validation

Validation shall support:

- Whole-frame scoring
- Section scoring
- Layer scoring
- Text-region scoring
- Asset-region scoring
- Material-region scoring
- Camera-region scoring
- High-priority region scoring

Important regions may receive stricter thresholds.

---

## 52. Error Diagnosis

The pipeline shall map visual errors back to responsible entities.

Possible responsible entities include:

- Node
- Text run
- Asset
- Layout rule
- Constraint
- Effect
- Material
- Texture
- Mesh
- Camera
- Light
- Timeline
- Keyframe
- Rig
- Export mapping

The diagnosis system shall rank errors by:

- Visual impact
- Confidence
- Fixability
- Region importance
- Dependency risk

---

## 53. Autonomous Correction

The correction loop shall be:

```text
Validation report
→ Error ranking
→ Responsible entity mapping
→ Correction proposal
→ Dry-run transaction
→ Preview render
→ Revalidation
→ Accept or reject
```

Correction examples include:

- Adjusting position
- Adjusting dimensions
- Adjusting spacing
- Changing font candidate
- Correcting font size
- Correcting line height
- Adjusting crop
- Refining vector path
- Modifying shadow
- Correcting material roughness
- Adjusting camera focal length
- Adjusting camera position
- Adjusting light intensity
- Refining mesh proportions
- Modifying animation timing

---

## 54. Correction Safety

Autonomous corrections shall be:

- Structured
- Reversible
- Traceable
- Scoped
- Validated
- Transactional
- Compatible with undo and redo

The system shall reject corrections that:

- Reduce overall score materially
- Break structural validity
- Destroy editability without permission
- Introduce unsupported export behaviour
- Corrupt assets
- Violate locked-node constraints
- Exceed allowed scope

---

## 55. Convergence Tracking

The pipeline shall track:

- Similarity progression
- Error count progression
- Error severity progression
- Number of correction passes
- Accepted changes
- Rejected changes
- Score plateau
- Regression events

The system shall detect when additional passes are no longer producing meaningful improvement.

---

## 56. Human Review Points

The system may request review when:

- Font identity remains unknown
- Multiple valid layouts exist
- Mobile redesign confidence is low
- Source references conflict
- 3D views are inconsistent
- Materials are ambiguous
- Camera estimation is unstable
- Rig structure is uncertain
- Export target limitations require flattening
- Validation plateau remains below threshold

The system shall not pretend certainty in these cases.

---

## 57. Conflicting References

When references conflict, the pipeline shall:

- Identify the conflict
- Preserve each reference
- Rank reference priority
- Report the conflict
- Avoid silent averaging
- Use explicit policy or user direction

Examples:

- Different character proportions across views
- Different lighting across images
- Different font versions
- Different responsive states
- Different object details
- Inconsistent camera lenses

---

## 58. Reconstruction Failure Classes

Failure types include:

- Unsupported format
- Corrupt reference
- Missing asset
- Missing font
- Insufficient resolution
- Severe occlusion
- Conflicting references
- Unrecoverable text
- Low-confidence segmentation
- Unstable camera estimation
- Invalid 3D geometry
- Invalid UVs
- Invalid rig
- Render failure
- Validation failure
- Export incompatibility
- Resource exhaustion

Failures shall include machine-readable codes and suggested recovery actions.

---

## 59. Fallback Policies

Allowed fallbacks include:

- Rasterizing an unsupported effect
- Using a close font substitute
- Outlining text
- Using a static 3D render
- Baking animation
- Baking simulation
- Reducing material complexity
- Using mobile static fallback
- Using simplified geometry
- Flattening a Canva-only unsupported region

Every fallback shall be reported.

No fallback shall be silently presented as fully native.

---

## 60. Export-Readiness Validation

Before completion, the pipeline shall validate:

- Structural validity
- Asset availability
- Font availability
- Responsive completeness
- Animation completeness
- 3D scene completeness
- Camera validity
- Lighting validity
- Material validity
- Rig validity
- Performance profile availability
- Export capability mapping
- Fallback reporting
- Accessibility metadata
- Deterministic render readiness

---

## 61. Code-Render Validation

For code exports, the pipeline shall:

```text
Generate export
→ Install dependencies
→ Build
→ Run
→ Render target viewports
→ Compare against canonical render
→ Report differences
→ Correct exporter or document mapping
```

Code output shall not be considered valid based only on successful compilation.

---

## 62. Canva Validation

Canva export validation shall measure:

- Native editable elements
- Editable media layers
- Flattened unsupported effects
- Missing fonts
- Layer order
- Text editability
- Vector editability
- Image separation
- 3D media separation
- Page integrity

The export report shall provide percentages.

---

## 63. 3D Web Validation

3D web output shall validate:

- Model loading
- Material loading
- Animation playback
- Camera behaviour
- Lighting behaviour
- Frame rate
- Draw calls
- Texture memory
- Mobile quality profile
- Static fallback
- Progressive loading
- Interaction logic

---

## 64. Completion Criteria

A 2D reconstruction shall require:

- Structurally valid layers
- Traceable assets
- Typography status
- Layout validation
- Responsive validation
- Visual similarity report
- Unsupported-feature report
- Export-readiness report

A 3D reconstruction shall require:

- Consistent model proportions
- Valid mesh hierarchy
- Valid normals
- Valid UVs
- Material assignment
- Camera validation
- Lighting validation
- Multi-angle comparison
- Optimization status
- Export-readiness report

A motion reconstruction shall require:

- Structured timeline
- Correct target bindings
- Timing validation
- Trigger validation
- Rendered sequence validation
- Export capability report

---

## 65. Reconstruction Report

Every completed task shall produce a Reconstruction Report.

It shall include:

- Task ID
- Project ID
- Document version
- Quality mode
- References used
- Stages completed
- Confidence summary
- Similarity scores
- Correction passes
- Remaining issues
- Applied fallbacks
- Export readiness
- Performance status
- Completion status

---

## 66. Pipeline Auditability

The system shall preserve:

- Input references
- Intermediate analysis
- Proposals
- Commands
- Transactions
- Render outputs
- Validation reports
- Correction history
- Export reports
- Failures
- Fallbacks

Every significant output shall be traceable.

---

## 67. Pipeline Performance

The pipeline shall support:

- Parallel asset processing
- Parallel reference analysis
- Region-based processing
- Cached intermediate results
- Resumable jobs
- Checkpoints
- Worker specialization
- GPU acceleration
- CPU fallbacks
- Priority queues
- Cancellation

Maximum Fidelity jobs shall be resumable.

---

## 68. Pipeline Determinism

Deterministic stages shall pin:

- Model or tool version
- Provider configuration
- Seeds
- Reference versions
- Asset versions
- Renderer versions
- Camera
- Viewport
- Time
- Quality mode

Non-deterministic provider outputs shall be versioned and preserved.

---

## 69. Security

The pipeline shall:

- Validate input files
- Sanitize SVG
- Restrict external URLs
- Isolate archives
- Sandbox Blender execution
- Sandbox generated code
- Validate shaders
- Restrict plugins
- Preserve secrets outside project documents
- Record external provider usage

---

## 70. Testing Requirements

The Reconstruction Pipeline shall include:

- Unit tests
- Stage contract tests
- Fixture-based tests
- Golden-image tests
- Typography fixtures
- Layout fixtures
- Responsive fixtures
- Motion fixtures
- Multi-view 3D fixtures
- Camera matching fixtures
- Material matching fixtures
- Failure fixtures
- Regression tests
- Maximum Fidelity end-to-end tests

---

## 71. Acceptance Criteria

The Reconstruction Pipeline shall be considered implementation-ready when it can:

- Ingest all approved reference categories
- Register references and provenance
- Produce structured 2D proposals
- Infer typography with honest confidence
- Extract assets
- Infer layout
- Infer responsive behaviour
- Detect components
- Reconstruct motion
- Coordinate 3D reconstruction
- Produce commands
- Create a valid Canonical Design Document
- Render deterministically
- Compare output
- Diagnose differences
- Apply reversible corrections
- Validate export readiness
- Produce a complete report

---

## 72. Final Pipeline Statement

The Reconstruction Pipeline is the production workflow that converts visual references into structured, editable, validated, and export-ready AEVUM projects.

It shall combine 2D analysis, typography, asset extraction, responsive reconstruction, motion analysis, professional 3D reconstruction, deterministic rendering, visual comparison, and autonomous correction while preserving the Canonical Design Document as the single source of truth.
