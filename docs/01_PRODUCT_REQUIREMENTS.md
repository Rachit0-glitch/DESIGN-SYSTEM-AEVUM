# AEVUM AI Reconstruction Engine — Product Requirements

## 1. Purpose

This document defines the functional and non-functional product requirements for the AEVUM AI Reconstruction Engine.

It is the authoritative specification for what the product must do.

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`

The remaining technical documents must implement the requirements defined here:

- `02_SYSTEM_ARCHITECTURE.md`
- `03_DESIGN_DOCUMENT_MODEL.md`
- `04_RECONSTRUCTION_PIPELINE.md`
- `05_TYPOGRAPHY_AND_ASSETS.md`
- `06_ANIMATION_AND_RENDERING.md`
- `07_3D_ENGINE_AND_CINEMATICS.md`
- `08_MCP_SPECIFICATION.md`
- `09_VISUAL_VALIDATION.md`
- `10_EXPORT_SYSTEM.md`
- `11_ROADMAP_AND_STATUS.md`

This document describes product behaviour, supported workflows, quality expectations, inputs, outputs, and acceptance criteria. It does not prescribe low-level implementation unless the requirement itself depends on a specific architectural principle already established in `00_PROJECT_CONTEXT.md`.

---

## 2. Product Objective

The AEVUM AI Reconstruction Engine shall convert visual references into structured, editable, production-ready 2D and 3D outputs.

The product shall support:

- Editable 2D reconstruction
- Responsive interface reconstruction
- High-fidelity typography
- Structured asset extraction
- Advanced effects
- Complex animation
- Professional 3D modelling
- UV and texture creation
- PBR materials
- Rigging
- Character animation
- Physics and simulation
- Lighting
- Camera control
- AI cinematography
- 2D and 3D visual validation
- Autonomous correction loops
- Multi-stack production export
- Maximally editable Canva export
- MCP-based AI control

The system shall preserve one Canonical Design Document as the source of truth for all internal rendering, editing, validation, and export operations.

---

## 3. Product Principles

The following product principles are mandatory:

1. The system shall be AI-controlled through MCP.
2. The system shall not depend on an embedded model API for its core operation.
3. The system shall not treat flattening as the default reconstruction method.
4. The system shall preserve editable structure wherever practical.
5. The system shall treat 2D and 3D as first-class systems.
6. The system shall use iterative visual validation.
7. The system shall report uncertainty honestly.
8. The system shall preserve original source assets.
9. The system shall generate production-ready exports from the Canonical Design Document.
10. The system shall support extensible exporter adapters.
11. The system shall support Maximum Fidelity as its primary quality philosophy.
12. The system shall not mark output complete without validation.

---

## 4. Target Users

The system shall support the needs of:

- AI agents operating through MCP
- Design-focused developers
- Frontend developers
- Creative technologists
- Agencies
- Motion designers
- 3D artists
- Product designers
- Brand designers
- Technical directors
- Website production teams
- Visualization teams
- Users without advanced manual design or 3D expertise

The product shall prioritize AI-driven production while preserving enough structured output for expert inspection, editing, and handoff.

---

## 5. Primary Use Cases

The system shall support the following primary use cases:

### 5.1 Screenshot-to-Editable Design

The user provides a website screenshot, UI design, poster, or brand reference.

The engine shall reconstruct:

- Frames
- Sections
- Text
- Images
- Shapes
- Vectors
- Icons
- Components
- Effects
- Layout systems
- Responsive behaviour
- Reusable design tokens

### 5.2 Screenshot-to-Code

The user provides a design reference.

The engine shall reconstruct the design and export production-ready code into supported stacks.

### 5.3 Reference-to-Canva

The user provides a reference design.

The engine shall create a maximally editable Canva representation and report which elements remain native, layered media, or flattened.

### 5.4 Multi-View 3D Reconstruction

The user provides front, side, back, top, or additional reference views.

The engine shall generate one consistent 3D model and validate all available angles.

### 5.5 Existing 3D Model Refinement

The user provides a GLB, GLTF, FBX, OBJ, STL, USD, USDZ, or Blender-compatible source.

The engine shall inspect, repair, refine, retopologize, retexture, relight, rig, animate, and optimize the model where required.

### 5.6 Motion Reconstruction

The user provides a video or motion reference.

The engine shall analyze motion timing, movement, camera behaviour, and object animation, then reconstruct the motion in a structured timeline.

### 5.7 Cinematic 3D Sequence Creation

The user provides a scene, product, character, or direction.

The engine shall create cameras, paths, lighting, shot timelines, and cinematic motion.

### 5.8 Responsive Website Production

The user provides one or more desktop references.

The engine shall create desktop, tablet, mobile, landscape, portrait, and reduced-motion variants.

---

## 6. Supported Inputs

The system shall accept:

- PNG
- JPG
- JPEG
- WebP
- AVIF
- SVG
- GIF
- Video files
- Website screenshots
- Full-page captures
- UI references
- Posters
- Brand references
- Product images
- Character references
- Interior references
- Environment references
- 3D turnarounds
- Motion references
- Existing website renders
- HTML
- CSS
- JavaScript
- TypeScript
- React source
- Next.js source
- GLB
- GLTF
- FBX
- OBJ
- STL
- USD
- USDZ where practical
- Blender scene conversions
- Texture folders
- HDRI files
- Font files
- Existing project documents

The system shall support multiple references in one reconstruction task.

The system shall retain source-to-output relationships for all references.

---

## 7. Reference Analysis Requirements

The system shall analyze references for:

- Sections
- Frames
- Groups
- Text
- Navigation
- Buttons
- Cards
- Images
- Videos
- Icons
- Shapes
- Vectors
- Gradients
- Shadows
- Glows
- Blur
- Masks
- Perspective
- Layer overlap
- Repeated components
- Spacing systems
- Alignment
- Visual hierarchy
- Foreground objects
- Background objects
- Camera angle
- Lens characteristics
- Lighting direction
- Material properties
- Motion timing
- Object trajectories
- Character movement
- Scene depth
- Responsive intent

The system shall generate confidence scores for inferred properties.

The system shall preserve uncertainty rather than inventing false certainty.

---

## 8. Editable Reconstruction Requirements

The system shall reconstruct each detected object as an independent editable layer wherever practical.

Supported editable layer types shall include:

- Page
- Frame
- Group
- Text
- Image
- Video
- Shape
- Vector
- SVG
- Effect
- Mask
- Component
- Instance
- Canvas layer
- WebGL layer
- Animation timeline
- 3D scene
- 3D model
- Mesh
- Material
- Texture
- Rig
- Bone
- Camera
- Light
- Environment
- Particle system
- Physics object

Each layer shall support applicable properties including:

- Position
- Dimensions
- Rotation
- Scale
- Skew
- Pivot
- Parenting
- Z-order
- Opacity
- Blend mode
- Masks
- Filters
- Effects
- Constraints
- Responsive overrides
- Animations
- Export behaviour
- Validation metadata
- Source-reference links

The system shall preserve meaningful editability.

The system shall not convert complex imagery into low-quality vector approximations solely to increase an editability percentage.

---

## 9. Canonical Design Document Requirements

The Canonical Design Document shall be the authoritative project representation.

It shall contain:

- 2D nodes
- 3D nodes
- Scene hierarchy
- Layer hierarchy
- Assets
- Typography
- Design tokens
- Components
- Variants
- Constraints
- Responsive overrides
- Animation data
- Interaction triggers
- Camera data
- Lighting data
- Material data
- Rigging data
- Physics metadata
- Validation metadata
- Export metadata
- Version metadata

The Canonical Design Document shall remain renderer-independent.

It shall not assume that a node must be rendered as one specific technology.

All renderers and exporters shall derive from this document.

---

## 10. 2D Rendering Requirements

The system shall support hybrid 2D rendering using:

- DOM
- CSS
- SVG
- Canvas
- WebGL
- Raster compositing

The engine shall be able to combine these methods in one composition.

The rendering system shall support:

- Frames
- Groups
- Transform hierarchies
- Clipping
- Masks
- Multiple fills
- Multiple strokes
- Gradients
- Mesh gradients
- Shadows
- Blur
- Blend modes
- Displacement
- Grain
- Noise
- Halftone
- Refraction
- Reflection
- Custom shader effects
- Layer-only rendering
- Region rendering
- High-resolution rendering

The system shall choose the most appropriate rendering method for each element.

---

## 11. Layout Requirements

The system shall support:

- Flexbox
- CSS Grid
- Subgrid
- Absolute positioning
- Fixed positioning
- Sticky positioning
- Constraint-based layout
- Auto layout
- Content hugging
- Fill container
- Fluid sizing
- Aspect-ratio constraints
- Container queries
- Custom breakpoints
- Fluid typography
- Fluid spacing
- Responsive cropping
- Responsive reordering
- Device-specific visibility
- Mobile regeneration
- Tablet regeneration
- Landscape variants
- Portrait variants
- Reduced-motion alternatives

The system shall infer:

- Container boundaries
- Grid structure
- Alignment rules
- Spacing scales
- Repeated components
- Fixed versus fluid relationships
- Intrinsic sizing
- Responsive intent

The system shall not merely scale desktop layouts down for mobile.

---

## 12. Typography Requirements

Supported font formats shall include:

- WOFF2
- WOFF
- TTF
- OTF
- Variable fonts

The typography engine shall support:

- Font family
- Weight
- Width
- Stretch
- Italic
- Oblique angle
- Font size
- Line height
- Letter spacing
- Word spacing
- Kerning
- Ligatures
- Baseline shift
- Paragraph spacing
- Text alignment
- Text transformation
- Variable font axes
- OpenType features
- Stylistic alternates
- Swashes
- Small caps
- Tabular numbers
- Per-character styling
- Mixed fonts
- Gradient text
- Stroke text
- Masked text
- Text on path
- Text perspective
- Text distortion
- Text-to-vector conversion

The font matching system shall classify results as:

```text
EXACT
LIKELY_MATCH
CLOSE_SUBSTITUTE
UNKNOWN
OUTLINED_FROM_REFERENCE
```

The system shall not claim `EXACT` without access to the real font or verifiable evidence.

The engine shall compare:

- Glyph dimensions
- Line breaks
- Baselines
- Kerning
- Tracking
- Line height
- Text block dimensions
- Weight
- Width
- Slant
- Optical appearance

---

## 13. Vector Requirements

The vector engine shall support:

- Bézier paths
- Node editing
- Boolean operations
- Compound paths
- Variable-width strokes
- Multiple strokes
- Gradient strokes
- Path offsets
- Corner smoothing
- Shape morphing
- SVG import
- SVG optimization
- Vector tracing
- Perspective warp
- Mesh warp
- Envelope distortion
- Text outline conversion
- Reusable vector symbols

Vector content shall remain compatible with:

- Animation
- Responsive transformation
- Validation
- MCP control
- Code export
- Canva export

---

## 14. Asset Processing Requirements

The system shall support:

- Subject segmentation
- Background removal
- Object extraction
- Object removal
- Generative fill through connected tools
- Cropping
- Perspective correction
- Relighting
- Color replacement
- Denoising
- Sharpening
- Upscaling
- Texture recovery
- Mask generation
- Depth-map generation
- Normal-map generation
- Height-map generation
- Material-map generation
- Image vectorization
- Duplicate detection
- Responsive crop generation
- WebP optimization
- AVIF optimization

The system shall preserve original source assets.

All derivative assets shall remain traceable to their originals.

---

## 15. Effects Requirements

The system shall support:

- Solid fills
- Linear gradients
- Radial gradients
- Conic gradients
- Mesh gradients
- Image fills
- Video fills
- Pattern fills
- Shader fills
- Multiple fills
- Multiple strokes
- Drop shadows
- Inner shadows
- Background blur
- Gaussian blur
- Directional blur
- Motion blur
- Bloom
- Glow
- Chromatic aberration
- Refraction
- Reflection
- Glass distortion
- Displacement
- Grain
- Noise
- Halftone
- Vignette
- Color grading
- Curves
- Blend modes
- Alpha masks
- Luminance masks
- Clipping paths
- Custom shader effects

Unsupported effects shall use documented fallbacks.

---

## 16. Animation Requirements

The animation system shall support:

- Multi-track timelines
- Property keyframes
- Nested timelines
- Timeline labels
- Loop regions
- Time scaling
- Reverse playback
- Time remapping
- Graph editing
- Custom Bézier easing
- Springs
- Bounce
- Elastic motion
- Inertia
- Overshoot
- Staggering
- Motion paths

Animatable properties shall include:

- Position
- Rotation
- Scale
- Skew
- Opacity
- Blur
- Colors
- Gradient stops
- Masks
- Paths
- Shadows
- Typography
- Variable-font axes
- Stroke drawing
- Filters
- Camera values
- Lighting
- Material properties
- Shader uniforms
- Particle values

Interaction triggers shall include:

- Page load
- Scroll
- Scroll velocity
- Scroll direction
- Viewport entry
- Viewport exit
- Click
- Hover
- Drag
- Hold
- Cursor movement
- Keyboard input
- Form state
- Route change
- Audio progress
- Video progress
- Data state
- Custom events

Complex motion shall include:

- Scroll scrubbing
- Pinned sections
- Parallax
- Card stacking
- Text reveals
- Split-text animation
- SVG morphing
- Shape morphing
- Mask transitions
- Page transitions
- Shared-element transitions
- Particle animation
- Liquid effects
- Glitch effects
- Trail effects
- Magnetic elements
- Cursor-follow effects
- Audio-reactive motion
- Physics-based motion
- Procedural motion

---

## 17. 3D Import Requirements

The system shall support:

- GLB
- GLTF
- FBX
- OBJ
- STL
- USD
- USDZ where practical
- Blender scene conversion
- Texture folders
- HDRI environments

The system shall inspect imported scenes for:

- Scene hierarchy
- Mesh hierarchy
- Materials
- Textures
- Skeletons
- Animations
- Morph targets
- Cameras
- Lights
- Units
- Scale
- Orientation
- Pivots
- Normals
- Tangents
- UVs
- Polygon counts
- Draw calls
- Texture sizes
- Missing dependencies

---

## 18. AI 3D Generation Requirements

The system shall support:

- Text-to-3D generation
- Single-image 3D generation
- Multi-view 3D reconstruction
- Front-side-back reconstruction
- Turnaround-based reconstruction
- Multi-mesh generation
- Mesh separation
- Mesh naming
- Hierarchical structure
- Real-world scale
- Origin correction
- Pivot correction
- Orientation correction
- Reusable components

The system shall not treat crude box-based geometry as complete when the reference requires detailed form.

Generated models shall be refined through modelling and validation workflows.

---

## 19. Mesh Editing Requirements

The system shall support:

- Vertex editing
- Edge editing
- Face editing
- Extrusion
- Inset
- Bevel
- Loop cuts
- Subdivision
- Solidify
- Boolean operations
- Retopology
- Decimation
- Remeshing
- Symmetry
- Mirroring
- Sculpt adjustments
- Surface smoothing
- Normal correction
- Tangent correction
- Mesh separation
- Mesh joining
- Pivot editing
- Origin correction
- LOD generation

---

## 20. Topology Requirements

Final-quality models shall prioritize:

- Quad-focused topology where appropriate
- Clean edge loops
- Deformation-friendly topology
- Correct normals
- Correct tangents
- No accidental duplicate geometry
- No unintended holes
- No hidden intersecting meshes
- No unnecessary polygons
- High-resolution master assets
- Optimized real-time variants
- LOD variants

The system shall provide topology diagnostics.

---

## 21. UV and Texture Requirements

The system shall support:

- Automatic UV unwrapping
- Manual seam control
- UV island packing
- UDIM
- Texel-density control
- Overlap detection
- Distortion detection
- Multi-material UV handling

Texture channels shall include:

- Base color
- Roughness
- Metallic
- Normal
- Height
- Displacement
- Ambient occlusion
- Emission
- Opacity
- Subsurface scattering
- Clearcoat
- Transmission
- Anisotropy

AI-assisted texturing shall support:

- Reference-based texture generation
- Material matching
- Surface damage
- Scratches
- Dirt
- Wear
- Fabric detail
- Skin detail
- Metal detail
- Procedural textures
- Seam correction
- Resolution enhancement
- Texture baking
- PBR validation

---

## 22. Material and Shader Requirements

The system shall support:

- PBR materials
- Node-based material graphs
- Metallic materials
- Matte materials
- Glass
- Frosted glass
- Plastic
- Rubber
- Fabric
- Skin
- Hair
- Liquid
- Emissive materials
- Holographic materials
- Iridescence
- Clearcoat
- Anisotropic reflections
- Subsurface scattering
- Procedural shaders
- Custom GLSL shaders
- Animated shader properties
- Material instancing
- Material libraries

The system shall estimate from references:

- Roughness
- Reflectivity
- Metalness
- Transparency
- Emission
- Surface response
- Micro-surface detail

---

## 23. Rigging Requirements

The system shall support:

- Skeleton generation
- Bone hierarchy
- Automatic rigging
- Manual rig adjustment
- IK
- FK
- IK/FK switching
- Constraints
- Pole targets
- Facial bones
- Facial blend shapes
- Morph targets
- Eye controls
- Jaw controls
- Finger controls
- Cloth bones
- Hair bones
- Accessory bones
- Skin weighting
- Weight-paint correction
- Deformation testing

---

## 24. Character Animation Requirements

The system shall support:

- Walk
- Run
- Jump
- Roll
- Salute
- Dance
- Combat
- Facial expressions
- Lip sync
- Hand gestures
- Custom motion from video
- Motion retargeting
- Motion blending
- Animation layering
- Root motion
- Loop correction
- Foot-lock correction
- Contact correction

The system shall support motion analysis from video references.

---

## 25. Camera Requirements

The system shall support:

- Position
- Rotation
- Focal length
- Field of view
- Sensor size
- Aperture
- Focus distance
- Depth of field
- Near clipping
- Far clipping
- Lens shift
- Camera roll
- Aspect ratio
- Exposure
- Motion blur
- Camera target
- Camera constraints

Supported camera movement shall include:

- Pan
- Tilt
- Dolly
- Truck
- Pedestal
- Orbit
- Arc shot
- Crane shot
- Push-in
- Pull-out
- Zoom
- Rack focus
- Handheld motion
- Camera shake
- Follow camera
- Chase camera
- Turntable camera
- Product orbit
- Fly-through
- Interior walkthrough
- Cinematic reveal
- Hero-object reveal
- Exploded-view camera
- Scroll-controlled camera
- Cursor-controlled camera

The camera system shall support:

- Bézier paths
- Editable motion paths
- Path constraints
- Look-at targets
- Multiple targets
- Smooth interpolation
- Speed ramps
- Ease-in and ease-out
- Banking
- Collision avoidance
- Camera bounds
- Automatic framing
- Subject tracking
- Object-focus transitions
- Multiple cameras
- Camera cuts
- Camera blending
- Shot timelines
- Shot naming
- Shot duration
- Responsive camera variants

---

## 26. AI Cinematography Requirements

The system shall understand and generate:

- Establishing shots
- Close-ups
- Macro shots
- Product beauty shots
- Hero reveals
- Detail shots
- Low-angle shots
- Top-down shots
- Side profiles
- Front turnarounds
- Back turnarounds
- Over-the-shoulder views
- Symmetrical compositions
- Dramatic perspective
- Minimal product shots
- Cinematic lighting sequences

The system shall analyze:

- Subject scale
- Visual hierarchy
- Focal points
- Rule of thirds
- Negative space
- Lens choice
- Camera distance
- Lighting direction
- Depth separation
- Motion pacing

---

## 27. Lighting Requirements

Supported lights shall include:

- Directional lights
- Point lights
- Spot lights
- Area lights
- Hemisphere lights
- Environment lights
- HDRI
- Emissive geometry
- Volumetric lights

The system shall support:

- Reference-light matching
- Studio lighting
- Product lighting
- Character lighting
- Rim lighting
- Three-point lighting
- Neon lighting
- Softbox lighting
- Cinematic lighting
- Day environments
- Night environments
- Animated lights
- Flicker
- Light sweeps
- Dynamic shadows
- Contact shadows
- Reflection probes
- Light baking
- Shadow optimization

---

## 28. Environment Requirements

The system shall support:

- Ground planes
- Rooms
- Buildings
- Landscapes
- Procedural environments
- Fog
- Volumetrics
- Clouds
- Sky systems
- Water
- Reflections
- Terrain
- Vegetation
- Scatter systems
- Scene props
- Background planes
- HDRI environments
- Scene-scale management
- Collision objects
- Occlusion systems

---

## 29. Physics and Simulation Requirements

The system shall support:

- Rigid-body physics
- Soft-body simulation
- Cloth simulation
- Hair simulation
- Rope simulation
- Spring systems
- Particle systems
- Gravity
- Wind
- Force fields
- Collision handling
- Fluid simulation
- Smoke
- Fire
- Destruction
- Object scattering
- Procedural movement

The system shall support baking or simplifying expensive simulations for web export.

---

## 30. Visual Validation Requirements

The system shall validate 2D output using:

- Raw pixel difference
- Perceptual similarity
- Structural similarity
- Edge comparison
- Shape silhouette comparison
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
- Responsive breakpoint comparison

Inspection modes shall include:

- Side-by-side
- Overlay
- Flicker comparison
- Difference heatmap
- Edge-only mode
- Typography-only mode
- Layer-only rendering
- Zoomed-region rendering

The system shall validate 3D output using:

- Silhouette comparison
- Camera-angle comparison
- Perspective comparison
- Proportion comparison
- Material comparison
- Lighting comparison
- Shadow comparison
- Reflection comparison
- Texture comparison
- Color comparison
- Landmark comparison
- Multi-angle comparison
- Turntable comparison

The system shall produce measurable scores.

---

## 31. Autonomous Correction Requirements

The system shall support the loop:

```text
Render
→ Measure
→ Rank errors
→ Identify responsible nodes
→ Generate correction commands
→ Apply transaction
→ Render again
→ Accept or roll back
```

Corrections shall be:

- Structured
- Reversible
- Traceable
- Validated
- Scoped to responsible elements
- Compatible with undo and redo

---

## 32. Quality Modes

The system shall support:

### Draft

- Fast reconstruction
- Basic layers
- Basic rendering
- Limited validation
- Reduced processing

### High Quality

- Detailed layer separation
- Typography matching
- Asset processing
- Multiple validation passes
- Responsive code
- Optimized 3D

### Maximum Fidelity

- Full-resolution analysis
- Region-by-region reconstruction
- Exact uploaded fonts
- Detailed typography
- Advanced effects
- Detailed materials
- Multi-angle 3D validation
- Advanced lighting
- Cinematic camera sequences
- Repeated render-and-compare cycles
- Code-render comparison
- Canva-layer validation
- No arbitrary low iteration limit

Maximum Fidelity shall remain the primary product mode.

---

## 33. Multi-Stack Export Requirements

The system shall export production-ready projects through pluggable exporters.

Initial official export targets shall include:

- HTML
- CSS
- JavaScript
- TypeScript
- React
- Next.js
- Tailwind CSS
- CSS Modules
- Styled Components
- Sass
- GSAP
- Framer Motion
- Three.js
- React Three Fiber
- WebGL
- GLSL
- Lottie
- Rive
- SVG
- Static assets
- GLB
- GLTF
- Video sequences
- Canva

The exporter system shall support future adapters without requiring changes to the Canonical Design Document.

Potential future adapters may include:

- Vue
- Nuxt
- Svelte
- SvelteKit
- Astro
- Angular
- Web Components
- Vanilla JavaScript
- Motion One
- Babylon.js
- WebGPU-based runtimes

Each exporter shall preserve as much as practical of:

- Layout
- Typography
- Responsiveness
- Components
- Animation
- Interactions
- Accessibility
- Assets
- 3D scenes
- Camera logic
- Lighting
- Performance fallbacks

---

## 34. 3D Web Export Requirements

3D exports shall include applicable components such as:

- Scene component
- Model loader
- Camera controller
- Lighting setup
- Animation mixer
- Scroll timeline
- Interaction logic
- Shader setup
- Post-processing
- Performance fallbacks
- Responsive quality profiles
- Static-image fallback
- Progressive loading
- Mobile variants

Optimization requirements shall include:

- Polygon analysis
- Automatic decimation
- LOD generation
- Draco compression
- Meshopt compression
- KTX2 texture compression
- Texture atlasing
- Texture-resolution variants
- Draw-call reduction
- Material merging
- Geometry instancing
- Occlusion culling
- Frustum culling
- Lazy loading
- Progressive loading
- Mobile quality profiles
- Memory-budget validation
- GPU profiling
- Frame-rate checking

---

## 35. Canva Export Requirements

Canva export shall maximize editability.

Export levels shall include:

1. Native editable text, vectors, shapes, and images
2. Separate editable visual layers
3. Flattened unsupported effects only

For 3D scenes:

- Main 3D render may be exported as image or video
- Shadows should remain separate where practical
- Glow should remain separate where practical
- Text shall remain native where supported
- Buttons shall remain native where supported
- UI shall remain editable where supported
- Multiple camera renders may become separate pages

The export shall report:

- Native editable percentage
- Editable media-layer percentage
- Flattened unsupported percentage

The system shall not claim full editability when flattening occurred.

---

## 36. MCP Requirements

The complete product shall be controllable through MCP.

Required domains shall include:

```text
reference.*
document.*
reconstruct.*
design.*
typography.*
assets.*
animation.*
three.*
camera.*
lighting.*
material.*
rig.*
simulation.*
render.*
compare.*
export.*
```

MCP commands shall use:

- Typed schemas
- Predictable responses
- Explicit errors
- Permission controls
- Transactions
- Auditability
- Idempotency where practical
- Version-aware operations

---

## 37. Command Requirements

All meaningful project changes shall be expressed as structured commands.

Examples include:

```text
node.create
node.update
node.delete
node.reparent
asset.import
timeline.add_keyframe
mesh.modify
camera.update
export.generate
```

The command system shall support:

- MCP operations
- Undo
- Redo
- Transactions
- Validation corrections
- Automation
- History
- Auditing
- Testing
- Future collaboration

---

## 38. Determinism Requirements

The system shall support deterministic rendering wherever practical.

The same:

- Document version
- Asset version
- Font version
- Renderer version
- Random seed
- Viewport
- Quality mode

shall produce the same output.

The system shall control:

- Time
- Randomness
- Physics
- Shader noise
- Asset loading
- Font loading
- Animation state
- Simulation state

during validation renders.

---

## 39. Performance Requirements

The system shall support separate master and delivery representations.

Examples include:

- High-resolution source models
- Retopologized real-time models
- High-resolution textures
- Compressed web textures
- Full simulations
- Baked simulations
- Advanced shaders
- Mobile fallbacks
- Interactive 3D scenes
- Static-image fallbacks

The system shall support:

- Render budgets
- Memory budgets
- Asset-size budgets
- Draw-call budgets
- Frame-rate targets
- GPU profiling
- Progressive loading
- Lazy loading
- Responsive quality profiles
- Reduced-motion support

Optimization shall not destroy or overwrite master assets.

---

## 40. Reliability Requirements

The system shall support:

- Project autosaving
- Crash recovery
- Versioned documents
- Asset integrity checks
- Export validation
- Recoverable transactions
- Undo and redo
- Error reporting
- Missing dependency reporting
- Corrupt asset detection
- Job retry policies
- Partial failure reporting

---

## 41. Security Requirements

The system shall support:

- MCP permission controls
- Workspace isolation
- Export sandboxing
- File-type validation
- Path traversal protection
- Restricted process execution
- Controlled external tool access
- Asset provenance
- Audit logs
- Secret isolation
- Safe plugin boundaries

---

## 42. Accessibility Requirements

Applicable web exports shall support:

- Semantic HTML
- Keyboard navigation
- Focus states
- Alt text
- ARIA where appropriate
- Reduced-motion alternatives
- Contrast checks
- Responsive text
- Accessible interaction fallbacks
- Non-WebGL fallbacks where practical

The system shall not sacrifice accessibility silently for visual fidelity.

---

## 43. Compatibility Requirements

The system shall support:

- Modern Chromium-based browsers
- Modern Safari
- Modern Firefox
- Desktop
- Tablet
- Mobile
- High-density displays
- Multiple aspect ratios
- Portrait
- Landscape

The system shall report unsupported target capabilities and generated fallbacks.

---

## 44. Acceptance Criteria

A feature shall not be considered complete unless:

- The feature is implemented
- The feature is documented
- The Canonical Design Document supports it
- MCP can operate it where applicable
- The renderer can reproduce it
- Validation can inspect it
- Exporters handle it or report a fallback
- Tests exist
- Failure states are handled
- Performance impact is measured
- The roadmap status is updated

A reconstruction shall not be considered complete unless:

- Editable structure is produced
- Visual similarity is measured
- Typography is validated
- Layout is validated
- Assets are traceable
- Responsive variants are tested
- Unsupported effects are reported
- Exports are validated

A 3D reconstruction shall not be considered complete unless:

- Proportions are validated
- Silhouette is validated
- Multi-angle consistency is checked
- Mesh structure is inspectable
- Normals are valid
- UVs are valid
- Materials are present
- Lighting is checked
- Camera matching is checked
- Web optimization status is reported

---

## 45. Product Success Criteria

The product shall be considered successful when it can reliably:

- Reconstruct complex 2D references into editable layers
- Reconstruct responsive layouts
- Match typography with measurable accuracy
- Preserve advanced effects
- Generate structured animations
- Reconstruct detailed multi-view 3D models
- Refine imported models professionally
- Produce valid rigs and character animation
- Create controlled camera sequences
- Match lighting and materials
- Validate output against references
- Improve results autonomously
- Export into multiple popular production stacks
- Produce maximally editable Canva output
- Operate fully through MCP
- Preserve consistency across all outputs

---

## 46. Out of Scope for Initial Completion

The initial product does not need to replace every feature of:

- Figma
- Canva
- Blender
- After Effects
- Cinema 4D
- Unreal Engine
- Unity

The first complete version does not require:

- A fully manual general-purpose editor
- Full multiplayer collaboration
- A plugin marketplace
- Built-in proprietary foundation models
- Complete game-engine replacement
- Unlimited simulation complexity
- Every possible frontend framework
- Every possible 3D format
- Every Canva effect as a native editable element

The system may use external professional tools while preserving AEVUM as the source of truth.

---

## 47. Requirement Consistency Rules

All technical documents shall use the same canonical terminology.

The following names are fixed:

- AEVUM AI Reconstruction Engine
- Maximum Fidelity
- Canonical Design Document
- MCP
- Hybrid 2D Renderer
- 3D Engine
- Reconstruction Pipeline
- Visual Validation
- Autonomous Correction Loop
- Multi-Stack Export
- Canva Export
- Command Engine

No later document may silently remove or weaken a requirement defined here.

Any approved scope change shall be reflected in:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `11_ROADMAP_AND_STATUS.md`

---

## 48. Final Requirement Statement

The AEVUM AI Reconstruction Engine shall operate as a professional AI-controlled design, reconstruction, validation, and export system.

Its core obligation is to convert references into structured, editable, accurate, and production-ready 2D and 3D outputs while preserving one Canonical Design Document across rendering, validation, MCP control, and multi-stack export.

## 49. Maximum Fidelity Requirements

AEVUM shall compare real RGBA output with normalized references, report local and global metrics, preserve separate
2D, responsive, motion, geometry, material, lighting, and camera scores, and lower completion confidence when
coverage is incomplete or a fallback is detected. Custom fonts must load from registered immutable assets. Automated
improvement must be bounded, non-regressive, protected-region aware, auditable, and Command Engine controlled.
