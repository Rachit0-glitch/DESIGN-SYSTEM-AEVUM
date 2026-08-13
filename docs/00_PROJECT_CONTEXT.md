# AEVUM AI Reconstruction Engine — Project Context

## 1. Purpose of This Document

This document is the canonical project context for the AEVUM AI Reconstruction Engine.

It preserves the product vision, system identity, operating philosophy, architectural direction, quality standards, major capabilities, system boundaries, and long-term intent of the project.

All remaining specification files must remain consistent with this document.

The following files expand this context into implementation detail:

- `01_PRODUCT_REQUIREMENTS.md`
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

This file defines what the product is and what must never be lost while the implementation evolves.

---

## 2. Product Name

**AEVUM AI Reconstruction Engine**

---

## 3. Product Definition

The AEVUM AI Reconstruction Engine is an AI-controlled visual reconstruction and production system.

It is designed to convert visual references into structured, editable, production-ready outputs across 2D, 3D, animation, web, and creative-design workflows.

The system is not primarily a manual design editor.

It is not a simple website builder.

It is not a basic screenshot-to-code tool.

It is not only an image generator.

It is not only a 3D modelling tool.

It is not a chatbot placed on top of a canvas.

It is a complete AI-native production engine controlled through MCP.

The system should be able to:

- Analyze visual references
- Understand structure and hierarchy
- Reconstruct editable layers
- Rebuild responsive layouts
- Recreate typography
- Extract and process assets
- Generate and refine 3D models
- Create materials and textures
- Build rigs and animations
- Control cameras and lighting
- Produce cinematic sequences
- Validate results against references
- Correct visual errors iteratively
- Export the final result into multiple production stacks
- Export maximally editable Canva designs
- Preserve one consistent source of truth throughout the workflow

---

## 4. Core Product Goal

The main goal is to create a system that can receive a visual reference and transform it into a high-quality, editable, technically correct, and production-ready reconstruction.

Supported reference types include:

- Website screenshots
- UI designs
- Posters
- Branding references
- Product images
- Character references
- Interior references
- Environment references
- 3D model turnarounds
- Front, side, back, and top views
- Videos
- Motion references
- Existing website renders
- Imported 3D scenes and models

The final output may include:

- Editable structured layers
- Responsive web layouts
- Reusable components
- Design tokens
- Production-ready website code
- High-fidelity 2D designs
- Advanced motion design
- High-quality 3D models
- Multi-mesh assets
- Rigged characters
- Character animations
- PBR textures and materials
- 3D scenes
- Camera sequences
- Lighting rigs
- Cinematic renders
- Interactive web experiences
- Optimized web assets
- Maximally editable Canva documents
- Validation reports
- Similarity scores
- Difference heatmaps
- Export compatibility reports

The system must preserve visual accuracy and editability at the same time.

A result is not considered complete merely because it looks approximately similar in a single screenshot.

A professional result should preserve:

- Visual hierarchy
- Layout logic
- Layer structure
- Typography
- Spacing
- Alignment
- Effects
- Materials
- Motion intent
- Camera intent
- Lighting intent
- Responsive behaviour
- Semantic structure
- Export behaviour
- Editability
- Performance

---

## 5. AI-Controlled, Not AI-Embedded

The system must be controlled through MCP.

The core product must not depend on embedding a model API directly into the application.

The AI agent should operate the engine using structured tools, commands, resources, and project state.

The engine should remain compatible with multiple MCP-capable clients, including:

- Codex
- Claude
- Future MCP-compatible agents

The architecture must not be tightly coupled to one model vendor.

External AI services may be connected for specialized tasks such as:

- Generative fill
- Image generation
- Upscaling
- Segmentation
- Texture generation
- 3D generation
- Motion analysis
- Video processing

These integrations must remain modular and replaceable.

The following systems must remain provider-independent:

- Canonical design document
- Command engine
- 2D renderer
- 3D renderer
- Asset system
- Animation system
- Validation system
- MCP bridge
- Export system
- Project persistence

---

## 6. Maximum Fidelity Philosophy

The primary AEVUM quality mode is:

**Maximum Fidelity**

Maximum Fidelity means the engine does not perform one reconstruction pass and stop.

It follows an iterative process:

```text
Analyze reference
→ Build structured reconstruction
→ Render
→ Compare against reference
→ Generate difference measurements
→ Identify responsible elements
→ Apply corrections
→ Render again
→ Repeat until completion criteria are met
```

Maximum Fidelity should include:

- Full-resolution analysis
- Region-by-region reconstruction
- Detailed editable layer separation
- Exact uploaded fonts
- Accurate glyph measurement
- Fine typography correction
- Detailed masks
- Complex effects
- Structured asset extraction
- Responsive reconstruction
- Advanced animation
- Detailed 3D geometry
- Clean topology
- PBR materials
- Multi-angle 3D validation
- Camera matching
- Lighting matching
- Cinematic camera sequences
- Repeated render-and-compare passes
- Code-render comparison
- Canva-layer validation
- No arbitrary low iteration limit

The system may also support:

### Draft

- Fast reconstruction
- Basic layers
- Limited validation
- Lower render quality
- Reduced processing
- Placeholder-friendly workflow

### High Quality

- Detailed layer separation
- Typography matching
- Asset processing
- Responsive layouts
- Multiple validation passes
- Optimized 3D
- Export validation

### Maximum Fidelity

- Highest reconstruction quality
- Deep layer separation
- Accurate typography
- Detailed materials
- Advanced lighting
- Multi-angle consistency
- Repeated correction cycles
- Highest-quality exports

Maximum Fidelity is the default design philosophy even when a faster mode is selected.

---

## 7. Editable Reconstruction Principle

The system must reconstruct visual references into independent editable objects wherever practical.

It must not flatten complete designs into a single image unless:

- The source itself is raster-only
- The effect cannot be represented reliably
- The target export format does not support the effect
- Flattening is explicitly requested
- Flattening is necessary as an optimized fallback

Supported editable elements include:

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

Every element should preserve relevant properties such as:

- Position
- Dimensions
- Rotation
- Scale
- Skew
- Pivot
- Hierarchy
- Z-order
- Opacity
- Blend mode
- Masks
- Filters
- Effects
- Constraints
- Responsive overrides
- Animation bindings
- Source-reference relationship
- Confidence score
- Export behaviour

Complex visuals must not be converted into crude vectors merely to claim editability.

Editability must remain meaningful.

---

## 8. One Canonical Design Document

The project must use one versioned canonical design document.

This document is the single source of truth for:

- 2D rendering
- 3D rendering
- Responsive behaviour
- Animation
- Interaction
- MCP control
- Undo and redo
- Validation
- Code export
- Canva export
- Asset processing
- Scene inspection
- Project persistence

The canonical design document must be renderer-independent.

It must not assume that every element becomes:

- HTML
- CSS
- SVG
- Canvas
- WebGL
- Three.js
- React Three Fiber
- Raster imagery
- Canva-native content

Each renderer and exporter must interpret the same document according to the strengths and limitations of its target.

This is the core requirement that makes multi-stack export possible.

---

## 9. Hybrid 2D Rendering

The system must support a hybrid rendering architecture.

It should use the most suitable technology for each visual element.

Supported rendering modes include:

- DOM
- CSS
- SVG
- Canvas
- WebGL
- Raster compositing

Examples:

- Semantic text should remain native text where practical.
- Responsive interface layout should use DOM and CSS where practical.
- Editable vectors should use SVG or vector-native structures.
- Heavy pixel processing may use Canvas or WebGL.
- Custom effects may use shaders.
- Unsupported effects may use raster fallbacks.
- One composition may use several rendering modes together.

The engine must preserve:

- Accuracy
- Editability
- Accessibility
- Responsive behaviour
- Performance
- Export compatibility

---

## 10. Professional 2D Design Requirements

The 2D system must support professional website, UI, poster, brand, editorial, and motion design.

Required layout systems include:

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
- Landscape and portrait variants
- Reduced-motion alternatives

The engine should detect and reconstruct:

- Sections
- Frames
- Navigation
- Text
- Buttons
- Cards
- Images
- Icons
- Shapes
- Gradients
- Shadows
- Glows
- Blur
- Masks
- Perspective
- Overlapping layers
- Repeated components
- Spacing systems
- Alignment
- Visual hierarchy
- Foreground objects
- Background objects

Mobile and tablet designs must be intelligently reconstructed.

The system must not simply shrink the desktop layout.

---

## 11. Typography as a Core System

Typography quality is one of the most important requirements of AEVUM.

Typography must not be treated as a decorative afterthought.

Supported font formats include:

- WOFF2
- WOFF
- TTF
- OTF
- Variable fonts

Typography controls include:

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

Font-identification results must use honest labels:

```text
EXACT
LIKELY_MATCH
CLOSE_SUBSTITUTE
UNKNOWN
OUTLINED_FROM_REFERENCE
```

The engine must never claim an exact font match without access to the real font or strong verifiable evidence.

When an exact font is unavailable, the engine should:

- Report uncertainty
- Select the closest practical substitute
- Correct measurable typography properties
- Offer outline reconstruction when appropriate
- Preserve the source reference for later replacement

---

## 12. Vector and Shape Requirements

The vector engine should support professional control.

Required capabilities include:

- Bézier paths
- Node-level path editing
- Boolean operations
- Compound paths
- Variable-width strokes
- Multiple strokes
- Gradient strokes
- Path offset
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

The vector system must remain compatible with:

- Animation
- Validation
- Responsive transformation
- MCP editing
- Code export
- Canva export

---

## 13. Asset Intelligence

The engine must preserve original assets and generate structured derivatives.

Required asset capabilities include:

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
- Duplicate asset detection
- Responsive crop generation
- WebP optimization
- AVIF optimization

3D asset support includes:

- Texture folders
- PBR maps
- HDRI environments
- Model files
- Rig data
- Animation files
- Material libraries
- LOD variants
- Compressed web variants

The original source must never be destroyed during processing.

Every derivative should remain traceable to its source.

---

## 14. Advanced Effects and Materials

The 2D system should support:

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

The 3D material system should support:

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

---

## 15. Animation as a Shared System

Animation must be a first-class part of the canonical design document.

The system should support:

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

Animatable properties include:

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

Interaction triggers include:

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
- Keyboard interaction
- Form state
- Route change
- Audio progress
- Video progress
- Data state
- Custom events

The same canonical animation data should be convertible into different export technologies.

---

## 16. Professional 3D Capability

The 3D subsystem is a major part of the product.

It must support professional asset creation, refinement, animation, rendering, and web delivery.

The system should be able to:

- Import models
- Inspect scenes
- Generate models from text
- Generate models from reference images
- Reconstruct models from multiple views
- Build multi-mesh models
- Separate model parts
- Name meshes
- Create hierarchies
- Set real-world scale
- Correct orientation
- Center models
- Create accurate pivots
- Refine geometry
- Retopologize meshes
- Generate UVs
- Create PBR textures
- Build materials
- Rig characters
- Correct skin weights
- Animate characters
- Simulate physics
- Match lighting
- Build environments
- Create camera paths
- Produce cinematic sequences
- Validate renders against references
- Optimize assets for real-time web use

Supported imports should include:

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

---

## 17. 3D Geometry and Topology Quality

The 3D system must not treat placeholder geometry as a finished result.

Final-quality 3D assets must prioritize:

- Correct proportions
- Clean silhouettes
- Multi-mesh structure
- Descriptive mesh names
- Real-world scale
- Correct orientation
- Clean pivots
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
- LOD generation

Mesh-editing capabilities should include:

- Vertex control
- Edge control
- Face control
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

---

## 18. UV, Texturing, and PBR

The system should support:

- Automatic UV unwrapping
- Manual seam control
- UV island packing
- UDIM
- Texel-density control
- Overlap detection
- Distortion detection
- Multi-material UV handling

Texture channels include:

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

AI-assisted texturing may include:

- Texture generation from references
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

## 19. Rigging and Character Animation

The system should support:

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

Character animation capabilities include:

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

---

## 20. Camera and Cinematography

Camera control is a core system.

Supported camera properties include:

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

Supported camera movement includes:

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

The system should support:

- Bézier camera paths
- Editable motion paths
- Look-at targets
- Multiple camera targets
- Speed ramps
- Banking
- Collision avoidance
- Automatic framing
- Subject tracking
- Camera cuts
- Camera blending
- Shot timelines
- Responsive camera variants

AI cinematography should understand:

- Shot intent
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

## 21. Lighting, Environments, and Simulation

Supported lights include:

- Directional lights
- Point lights
- Spot lights
- Area lights
- Hemisphere lights
- Environment lights
- HDRI
- Emissive geometry
- Volumetric lights

The system should support:

- Reference-light matching
- Studio lighting
- Product lighting
- Character lighting
- Rim lighting
- Three-point lighting
- Neon lighting
- Softbox lighting
- Cinematic lighting
- Day and night environments
- Animated lights
- Light sweeps
- Dynamic shadows
- Contact shadows
- Reflection probes
- Light baking
- Shadow optimization

Environment features include:

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
- Collision objects
- Occlusion systems

Simulation support includes:

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

Expensive simulations should be baked or simplified when required for web export.

---

## 22. Visual Validation

Validation is a core product capability.

The engine must compare generated output against the source reference.

2D comparison includes:

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

Inspection modes include:

- Side-by-side
- Overlay
- Flicker comparison
- Difference heatmap
- Edge-only mode
- Typography-only mode
- Layer-only rendering
- Zoomed-region rendering

3D validation includes:

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

For multi-view reconstruction:

```text
Front reference
Side reference
Back reference
Top reference
        ↓
One consistent 3D model
        ↓
Render all available views
        ↓
Compare
        ↓
Refine
```

The engine should report measurable scores rather than vague claims.

Example:

```json
{
  "overallSimilarity": 0.972,
  "layoutSimilarity": 0.991,
  "typographySimilarity": 0.948,
  "colorSimilarity": 0.982,
  "assetSimilarity": 0.963
}
```

---

## 23. Autonomous Correction Loop

The validation system should be able to identify the visual elements responsible for differences.

The correction workflow should follow:

```text
Render
→ Measure
→ Rank visual errors
→ Identify responsible nodes
→ Generate correction commands
→ Apply transaction
→ Render again
→ Accept or roll back
```

Corrections should remain:

- Structured
- Reversible
- Traceable
- Validated
- Limited to responsible elements
- Compatible with undo and redo

---

## 24. Production Code Export

The system must export designs into widely used production technologies.

Core supported outputs include:

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

The export architecture must be extensible so additional popular stacks can be added without changing the canonical document model.

Potential additional adapters may include:

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

The system must not create unrelated exports independently.

All exports must derive from the same canonical design document.

Each exporter must preserve as much as practical of:

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

## 25. 3D Web Export

3D export should include:

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

Supported web optimization includes:

- Polygon analysis
- Automatic decimation
- LODs
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

## 26. Canva Export

Canva export should maximize editability.

Export levels include:

1. Native editable text, vectors, shapes, and images
2. Separate editable visual layers
3. Flattened unsupported effects only

For 3D scenes:

- Main 3D render may become a separate image or video layer
- Shadows should remain separate where practical
- Glow should remain separate where practical
- Text should remain native
- Buttons should remain native
- UI should remain editable
- Multiple camera renders may become separate Canva pages

The export should report the result transparently.

Example:

```text
Native editable elements: 72%
Editable media layers: 23%
Flattened unsupported effects: 5%
```

The system must never claim full editability when unsupported elements were flattened.

---

## 27. MCP Control Domains

The complete engine should be controllable through MCP.

Core MCP domains include:

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

Important 3D commands include:

```text
three.import_model
three.generate_model
three.inspect_scene
three.create_mesh
three.modify_mesh
three.retopologize
three.unwrap_uv
three.optimize_model

material.create
material.apply
material.match_reference
material.generate_textures

rig.create
rig.bind
rig.correct_weights
rig.retarget_animation

camera.create
camera.set_properties
camera.create_path
camera.add_keyframes
camera.track_object
camera.preview_shot
camera.create_sequence

lighting.create
lighting.match_reference
lighting.create_rig

render.render_frame
render.render_turntable
render.render_sequence

compare.compare_3d_render
compare.compare_reference_angles

export.glb
export.react_three_fiber
export.threejs
```

Every MCP command should use typed schemas, predictable responses, explicit errors, permission controls, and transaction support.

---

## 28. Command-Driven Architecture

All meaningful changes should be represented as structured commands.

Examples:

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

The command layer should support:

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

Direct uncontrolled mutation of project state should be avoided.

---

## 29. Deterministic Rendering

Rendering should be deterministic wherever practical.

The same:

- Document version
- Asset version
- Font version
- Renderer version
- Seed
- Viewport
- Quality mode

should produce the same output.

Determinism is necessary for:

- Pixel comparison
- Regression testing
- Export validation
- Reproducibility
- Reliable autonomous correction

Time, randomness, physics, shaders, asynchronous assets, and font loading must be controlled during validation renders.

---

## 30. Performance and Production Quality

High fidelity does not remove the need for performance.

The engine should support separate master and delivery representations.

Examples:

- High-resolution source model
- Retopologized real-time model
- High-resolution textures
- Compressed web textures
- Full simulation
- Baked simulation
- Advanced shader
- Mobile fallback
- Interactive 3D scene
- Static-image fallback

Performance systems should include:

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
- Accessibility fallbacks

Optimization must not silently destroy the master source.

---

## 31. Non-Negotiable Product Principles

The following principles must remain consistent throughout the project:

1. The system is AI-controlled through MCP.
2. The system is not primarily a manual editor.
3. One canonical design document controls all outputs.
4. 2D and 3D are first-class systems.
5. Editable reconstruction is preferred over flattening.
6. Complex visuals must not be reduced to crude approximations.
7. Typography is a core fidelity system.
8. The system must report font uncertainty honestly.
9. Reconstruction must use iterative validation.
10. 3D output must meet professional geometry, topology, UV, material, rigging, lighting, and camera standards.
11. Multi-angle 3D references must produce one consistent model.
12. Mobile layouts must be intentionally reconstructed.
13. Animation must remain structured and exportable.
14. Every export must derive from the canonical document.
15. Export support must include popular 2D and 3D web stacks.
16. Canva export must report what remains editable.
17. Validation scores must be measurable.
18. Corrections must be reversible and traceable.
19. Maximum Fidelity is the primary production philosophy.
20. No feature should be marked complete without validation and testing.

---

## 32. System Boundaries

The first version should focus on the reconstruction engine and production pipeline.

The product does not need to become a complete replacement for every feature of:

- Figma
- Canva
- Blender
- After Effects
- Cinema 4D
- Unreal Engine
- Unity

Instead, it should orchestrate the essential capabilities required for AI-controlled reconstruction and export.

External tools may be integrated where they offer stronger professional capabilities.

Examples:

- Blender may be used for advanced modelling, sculpting, rigging, baking, and simulation.
- Three.js may be used for browser 3D runtime.
- React Three Fiber may be used for React-based 3D export.
- Browser rendering may be used for deterministic 2D validation.
- External image tools may be used for segmentation, fill, and enhancement.

The AEVUM engine remains responsible for:

- Canonical project state
- Tool orchestration
- Structured commands
- Validation
- Export
- Consistency
- Traceability

---

## 33. Long-Term Product Direction

The long-term system should become an AI-native design compiler.

It should be able to:

- Understand visual intent
- Reconstruct visual systems
- Produce editable source structures
- Generate production code
- Build professional 3D assets
- Animate complete experiences
- Validate accuracy automatically
- Export into many target environments
- Continue improving a design through AI-directed iteration

The product should eventually support a workflow where a user can provide:

- A screenshot
- A visual reference
- A video
- A character turnaround
- A 3D model
- An existing website

and instruct the AI to recreate, refine, animate, optimize, validate, and export the result without manually operating every design tool.

---

## 34. Documentation Consistency Rules

All future Markdown files must use the same terminology defined here.

The following names are canonical:

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

When a detailed specification changes a canonical principle, this file must also be updated.

No implementation document should silently contradict this context.

`11_ROADMAP_AND_STATUS.md` must record major scope changes and architectural decisions.

---

## 35. Final Project Statement

The AEVUM AI Reconstruction Engine is intended to become a professional AI-controlled system for reconstructing, producing, validating, and exporting high-fidelity 2D and 3D visual experiences.

Its success depends on five foundations:

1. A renderer-independent canonical design document
2. Professional 2D and 3D production systems
3. Structured MCP control
4. Iterative visual validation
5. Reliable multi-stack export

Every future implementation decision should protect these foundations.

## 36. Phase 22 Maximum Fidelity Integration

Maximum Fidelity is now a measurable cross-domain workflow, not an appearance claim. Reference evidence is
normalized, canonical state is projected and rasterized, pixel and structural differences are attributed, and only
bounded Command Engine corrections may persist. Scores retain domain, coverage, confidence, provenance, and
unsupported-feature evidence. Phase 23 is AEVUM Studio; Phase 24 owns production hardening and release readiness.

## 37. Phase 23 AEVUM Studio

AEVUM Studio exposes the validated engines as one professional creation environment. The desktop editor combines a
canonical layers tree, Hybrid 2D viewport, precise properties, registered assets, responsive previews, Animation Core
timeline evaluation, canonical 3D inspection, Maximum Fidelity evidence, and structured AI operations. It preserves
one project identity across 2D, 3D, animation, fidelity, and AI workspaces.

Studio state is explicitly split: document content remains canonical and Command Engine controlled; selection, zoom,
pan, active tools, open panels, and drag previews remain local transient state. The application is not a new renderer,
project store, or AI write path.
