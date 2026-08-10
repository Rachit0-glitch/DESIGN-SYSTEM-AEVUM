# AEVUM AI Reconstruction Engine — 3D Engine and Cinematics

## 1. Purpose

This document defines the complete 3D production, runtime, reconstruction, validation, and cinematography systems of the AEVUM AI Reconstruction Engine.

It is authoritative for:

- 3D scene representation
- Model import
- AI-assisted model generation
- Multi-view reconstruction
- Mesh construction
- Topology
- Retopology
- UVs
- Textures
- Materials
- Shaders
- Rigging
- Character animation
- Mechanical animation
- Physics
- Simulations
- Environments
- Lighting
- Cameras
- Camera paths
- Shot timelines
- AI cinematography
- Offline rendering
- Real-time rendering
- Web optimization
- Multi-angle validation
- 3D export readiness

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`
- `03_DESIGN_DOCUMENT_MODEL.md`
- `04_RECONSTRUCTION_PIPELINE.md`
- `05_TYPOGRAPHY_AND_ASSETS.md`
- `06_ANIMATION_AND_RENDERING.md`

The 3D Engine shall remain fully integrated with the Canonical Design Document, Command Engine, MCP, Reconstruction Pipeline, Visual Validation, and Multi-Stack Export systems.

---

## 2. Core Principles

The 3D Engine shall follow these principles:

1. 3D is a first-class system.
2. Placeholder geometry is not a finished model.
3. One consistent model shall represent all reference angles.
4. Multi-mesh structure is preferred when parts have separate visual, structural, or animation roles.
5. High-resolution master assets and optimized delivery assets shall remain separate.
6. Geometry, topology, UVs, materials, rigging, animation, lighting, and cameras shall all remain inspectable.
7. Blender may act as a professional execution backend but not the source of truth.
8. Browser 3D shall derive from the Canonical Design Document.
9. 3D reconstruction shall use repeated render-and-compare cycles.
10. Camera matching is required for reliable proportion validation.
11. Material and lighting matching are separate from geometry matching.
12. Web optimization shall not silently destroy the master model.
13. Cinematography shall preserve shot intent, not only coordinates.
14. Physics shall be baked or simplified when real-time delivery requires it.
15. Every fallback shall be reported.

---

## 3. 3D System Scope

The 3D system shall support:

- Product modelling
- Character modelling
- Hard-surface modelling
- Organic modelling
- Interior modelling
- Environment construction
- Scene assembly
- Imported model refinement
- Multi-view reconstruction
- Single-image reconstruction
- Video-assisted reconstruction
- Rigging
- Character animation
- Mechanical animation
- Cloth and hair systems
- Particles
- Simulations
- Lighting
- Cameras
- Cinematic sequences
- Interactive web scenes
- Turntable rendering
- Product visualization
- Hero-section 3D
- Exploded-view animation
- Scroll-controlled camera experiences

---

## 4. Supported 3D Inputs

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
- Rig files
- Animation files
- Motion references
- Character turnarounds
- Product turnarounds
- Front views
- Side views
- Back views
- Top views
- Detail references
- Video references
- Existing website 3D renders

---

## 5. 3D Import Pipeline

The import pipeline shall:

```text
Receive source
→ Validate format
→ Inspect metadata
→ Resolve dependencies
→ Detect units
→ Detect coordinate system
→ Detect up axis
→ Detect handedness
→ Inspect scene hierarchy
→ Inspect meshes
→ Inspect materials
→ Inspect textures
→ Inspect rigs
→ Inspect animation
→ Generate diagnostics
→ Register source asset
→ Create canonical scene proposal
```

The original imported file shall remain immutable.

---

## 6. Import Inspection

Import diagnostics shall include:

- File format
- File version
- Scene units
- Real-world scale
- Coordinate system
- Up axis
- Handedness
- Bounding box
- Mesh count
- Vertex count
- Edge count
- Face count
- Triangle count
- Material count
- Texture count
- Texture resolution
- UV sets
- Skeleton count
- Bone count
- Animation clips
- Morph targets
- Cameras
- Lights
- Missing files
- Broken references
- Invalid normals
- Invalid tangents
- Non-manifold geometry
- Hidden intersections
- Duplicate geometry
- Draw calls
- Estimated memory cost

---

## 7. Scene Normalization

The system shall normalize imported scenes by:

- Preserving original source
- Creating a working derivative
- Converting units
- Correcting orientation
- Centering where requested
- Correcting origin
- Correcting pivots
- Naming unnamed meshes
- Resolving hierarchy
- Registering materials
- Registering textures
- Fixing broken paths
- Removing accidental duplicates when approved
- Preserving meaningful instances

Normalization shall be reversible or reproducible.

---

## 8. AI-Assisted 3D Generation

The system shall support:

- Text-to-3D
- Single-image generation
- Multi-view generation
- Turnaround reconstruction
- Video-assisted reconstruction
- Existing-model completion
- Part generation
- Environment generation
- Prop generation

Generated outputs shall be treated as intermediate proposals until inspected and validated.

---

## 9. 3D Generation Quality Levels

### Draft

- Coarse geometry
- Basic proportions
- Minimal materials
- Proxy topology
- Fast preview

### High Quality

- Refined silhouette
- Multi-part structure
- Improved topology
- UVs
- PBR materials
- Basic validation
- Web-ready derivative

### Maximum Fidelity

- Multi-view consistency
- Detailed geometry
- Clean topology
- Deformation-ready structure
- Detailed UVs
- High-resolution textures
- PBR validation
- Camera matching
- Material matching
- Lighting matching
- Repeated multi-angle comparison
- High-resolution master
- Optimized delivery variants

---

## 10. Multi-View Reconstruction

The multi-view workflow shall be:

```text
Register views
→ Label view roles
→ Estimate camera for each view
→ Detect shared landmarks
→ Align views
→ Estimate real-world scale
→ Build coarse volume
→ Refine silhouette
→ Segment logical parts
→ Build topology
→ Generate UVs
→ Build materials
→ Render each view
→ Compare
→ Correct
→ Repeat
```

All views shall contribute to one model.

---

## 11. Reference View Roles

Views may be labeled:

- Front
- Back
- Left
- Right
- Top
- Bottom
- Three-quarter front
- Three-quarter back
- Detail
- Material
- Motion
- Lighting
- Proportion
- Style

Reference priority shall be explicit when views conflict.

---

## 12. Camera Estimation

For each reference view, the system shall estimate:

- Perspective or orthographic projection
- Focal length
- Field of view
- Camera position
- Camera rotation
- Subject distance
- Lens distortion
- Horizon line
- Vanishing points
- Framing
- Sensor approximation
- Crop
- Camera roll

Camera estimation shall include confidence metadata.

---

## 13. Landmark Detection

Landmarks shall include:

- Silhouette extrema
- Symmetry axis
- Joint locations
- Hard edges
- Openings
- Holes
- Surface breaks
- Repeated forms
- Feature points
- Material boundaries
- Texture landmarks
- Mechanical connection points

Landmarks shall be linked across views.

---

## 14. Volume Reconstruction

Coarse volume may be generated using:

- Primitive fitting
- Depth estimation
- Multi-view geometry
- Volumetric fusion
- Procedural forms
- Existing 3D generation models
- Blender geometry nodes
- Manual procedural templates

Coarse volume shall not be treated as final.

---

## 15. Mesh Structure

The model shall use separate meshes when required for:

- Independent animation
- Different materials
- Logical parts
- Replaceable components
- Rigging
- Mechanical pivots
- Optimization
- LOD control
- Export editability

Examples:

```text
Character_Head
Character_Torso
Character_LeftHand
Character_RightHand
Character_Accessory
Product_Body
Product_Glass
Product_Button
Product_Display
```

---

## 16. Mesh Naming

Mesh names shall be:

- Human-readable
- Stable
- Descriptive
- Consistent
- Hierarchically meaningful

Unnamed names such as:

```text
Cube.001
Object_47
Mesh123
```

shall be replaced in working derivatives.

---

## 17. Mesh Editing

The system shall support:

- Vertex editing
- Edge editing
- Face editing
- Extrusion
- Inset
- Bevel
- Loop cuts
- Knife operations
- Bridge
- Fill
- Subdivision
- Solidify
- Boolean
- Shrinkwrap
- Surface projection
- Lattice deformation
- Sculpting
- Symmetry
- Mirroring
- Remeshing
- Decimation
- Retopology
- Smoothing
- Normal correction
- Tangent correction
- Mesh separation
- Mesh joining
- Pivot editing
- Origin correction

---

## 18. Hard-Surface Modelling

Hard-surface requirements shall include:

- Clean planar surfaces
- Controlled bevels
- Consistent edge widths
- Correct panel gaps
- Mechanical separation
- Realistic thickness
- Correct booleans
- Stable subdivision
- Controlled shading
- Weighted normals where appropriate

---

## 19. Organic Modelling

Organic modelling requirements shall include:

- Anatomical proportion
- Surface continuity
- Sculpt detail
- Deformation-friendly topology
- Correct muscle flow
- Facial structure
- Hand and finger quality
- Cloth interaction
- Hair or fur structure where applicable

---

## 20. Character Modelling

Character models shall support:

- Full-body proportions
- Accurate head shape
- Facial features
- Hands
- Feet
- Clothing
- Accessories
- Separate animated parts
- Symmetry with intentional asymmetry
- Deformation-ready topology
- Facial rig compatibility
- Hair and cloth systems

---

## 21. Product Modelling

Product models shall support:

- Real-world dimensions
- Accurate silhouette
- Part separation
- Mechanical pivots
- Surface transitions
- Manufacturing details
- Labels and logos
- Glass
- Metal
- Plastic
- Rubber
- Fabric
- Fasteners
- Internal details where visible
- Exploded-view readiness

---

## 22. Topology Standards

Final topology shall prioritize:

- Quad-focused topology where appropriate
- Clean edge flow
- Deformation readiness
- Stable subdivision
- Controlled density
- Correct poles
- Minimal unnecessary loops
- No accidental duplicates
- No unintended holes
- No non-manifold regions
- No invalid normals
- No invalid tangents
- No hidden intersections
- No self-intersections where avoidable
- No unnecessary internal geometry

---

## 23. Topology Diagnostics

Diagnostics shall report:

- Vertex count
- Edge count
- Face count
- Triangle count
- Quad percentage
- N-gon count
- Pole count
- Non-manifold edges
- Boundary edges
- Duplicate vertices
- Overlapping faces
- Normal issues
- Tangent issues
- UV readiness
- Rigging readiness
- Subdivision readiness
- LOD readiness

---

## 24. Retopology

The system shall support:

- Automatic retopology
- Guided retopology
- Manual correction
- Surface-constrained retopology
- Quad remeshing
- Deformation-aware retopology
- Hard-surface retopology
- Density control
- Edge-loop preservation
- Feature-line preservation

Retopology shall produce a new derivative and preserve the source mesh.

---

## 25. LOD Generation

The system shall support:

- LOD0 master
- LOD1 high
- LOD2 medium
- LOD3 low
- Impostor or billboard fallback

LOD generation shall preserve:

- Silhouette
- UVs where practical
- Materials
- Rig compatibility
- Animation compatibility
- Pivot
- Bounding box

LOD thresholds shall be configurable.

---

## 26. UV System

The UV system shall support:

- Automatic unwrap
- Manual seam control
- Smart projection
- Cylindrical projection
- Spherical projection
- Planar projection
- Camera projection
- UDIM
- UV island packing
- Texel density
- UV pinning
- Overlap detection
- Distortion detection
- Mirrored UVs
- Multi-material UVs
- Multiple UV sets

---

## 27. UV Validation

UV validation shall inspect:

- Missing UVs
- Overlaps
- Distortion
- Stretching
- Wasted space
- Texel-density inconsistency
- Incorrect island orientation
- Insufficient padding
- Cross-material conflicts
- UDIM assignment

---

## 28. Texture Channels

The system shall support:

- Base color
- Roughness
- Metallic
- Normal
- Height
- Displacement
- Ambient occlusion
- Emission
- Opacity
- Subsurface
- Clearcoat
- Transmission
- Anisotropy
- Specular where required

---

## 29. Texture Generation

Texture generation may use:

- Projection from references
- Multi-view fusion
- Texture painting
- Procedural generation
- AI generation
- Baking
- Material libraries
- Photogrammetry-inspired workflows
- Seam correction
- Detail synthesis

---

## 30. Texture Quality

Textures shall preserve:

- Material identity
- Correct scale
- Surface detail
- Seam quality
- Color consistency
- Micro-surface response
- High-frequency detail
- Appropriate bit depth
- Correct color space
- Correct channel assignment

---

## 31. PBR Validation

PBR validation shall inspect:

- Physically plausible values
- Correct channel use
- Correct color spaces
- Normal orientation
- Roughness range
- Metalness logic
- Transmission
- IOR
- Clearcoat
- Subsurface
- Seams
- Baking artifacts
- Compression artifacts

---

## 32. Material System

The system shall support:

- PBR
- Unlit
- Matte
- Metallic
- Glass
- Frosted glass
- Plastic
- Rubber
- Fabric
- Skin
- Hair
- Liquid
- Emissive
- Holographic
- Iridescent
- Clearcoat
- Anisotropic
- Subsurface
- Volume
- Custom shader

---

## 33. Material Graphs

Material graphs shall support:

- Nodes
- Inputs
- Outputs
- Texture sampling
- Math
- Color operations
- Normal processing
- Fresnel
- Noise
- Procedural patterns
- Layer blending
- Masking
- Animation bindings
- Custom shader blocks

The canonical material graph shall remain independent from Blender and Three.js node instances.

---

## 34. Material Matching

Material matching shall estimate:

- Base color
- Roughness
- Reflectivity
- Metalness
- Transparency
- IOR
- Emission
- Subsurface
- Clearcoat
- Anisotropy
- Micro-surface detail
- Surface damage
- Wear
- Dirt
- Scratches

Material comparison shall be separated from lighting comparison.

---

## 35. Shader System

The system shall support:

- GLSL shaders
- Procedural shaders
- Animated uniforms
- Vertex displacement
- Fragment effects
- Refraction
- Holographic effects
- Iridescence
- Dissolve
- Scanlines
- Fresnel
- Noise
- Distortion
- Volumetric shaders

Shaders shall include:

- Uniform schema
- Required textures
- Runtime compatibility
- Security status
- Fallback strategy
- Validation status

---

## 36. Rigging

The system shall support:

- Skeleton generation
- Bone hierarchy
- Auto rigging
- Manual rigging
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
- Mechanical rigs

---

## 37. Rig Structure

A rig shall include:

- Root bone
- Bone hierarchy
- Rest pose
- Bind pose
- Controls
- Constraints
- IK chains
- FK chains
- Deformation bones
- Helper bones
- Retargeting profile
- Export compatibility

---

## 38. Skinning

Skinning shall support:

- Automatic weighting
- Manual weight correction
- Weight normalization
- Weight transfer
- Symmetry
- Limit influence count
- Deformation tests
- Pose-space correction
- Corrective blend shapes

---

## 39. Deformation Validation

Deformation validation shall test:

- Shoulder
- Elbow
- Wrist
- Fingers
- Spine
- Hip
- Knee
- Ankle
- Neck
- Jaw
- Facial expressions
- Cloth deformation
- Accessory deformation

The system shall detect:

- Collapsing volume
- Pinching
- Candy-wrapper deformation
- Mesh penetration
- Weight leaks
- Detached regions

---

## 40. Character Animation

The system shall support:

- Idle
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
- Retargeting
- Motion blending
- Animation layering
- Root motion
- Loop correction
- Foot-lock correction
- Contact correction

---

## 41. Motion Retargeting

Retargeting shall account for:

- Skeleton mapping
- Bone orientation
- Proportion differences
- Root scale
- Limb length
- Foot position
- Hand position
- Hip height
- Spine mapping
- Facial mapping where available

---

## 42. Mechanical Animation

The system shall support:

- Hinges
- Sliders
- Gears
- Pistons
- Rotors
- Buttons
- Doors
- Panels
- Exploded views
- Assembly sequences
- Constraint-driven mechanisms

Mechanical pivots shall be exact and editable.

---

## 43. Morph Targets

Morph targets shall support:

- Facial expressions
- Corrective shapes
- Product deformation
- Shape transitions
- Lip sync
- Body variation

Morph-target names and ranges shall be explicit.

---

## 44. Physics Systems

The system shall support:

- Rigid body
- Soft body
- Cloth
- Hair
- Rope
- Springs
- Particles
- Gravity
- Wind
- Force fields
- Collision
- Fluids
- Smoke
- Fire
- Destruction
- Scattering

---

## 45. Physics Configuration

Physics shall define:

- Solver
- Timestep
- Substeps
- Gravity
- Scale
- Collision layers
- Material friction
- Restitution
- Damping
- Cache
- Bake settings
- Deterministic seed

---

## 46. Simulation Baking

The system shall support baking:

- Cloth
- Hair
- Rigid body
- Fluid
- Smoke
- Fire
- Particles
- Destruction
- Procedural motion

Baked outputs shall be registered as derivatives.

---

## 47. Environment Construction

The system shall support:

- Ground planes
- Studios
- Rooms
- Buildings
- Landscapes
- Terrain
- Vegetation
- Procedural environments
- Fog
- Volumetrics
- Clouds
- Sky
- Water
- Reflections
- Props
- Background planes
- HDRI environments
- Scatter systems
- Collision objects
- Occlusion systems

---

## 48. Scene Scale

Every 3D scene shall define:

- Units
- Real-world scale
- Reference object
- Ground level
- Up axis
- Origin policy
- Camera scale
- Physics scale

Scale inconsistencies shall be reported.

---

## 49. Lighting System

Supported lights shall include:

- Directional
- Point
- Spot
- Area
- Hemisphere
- Environment
- HDRI
- Emissive geometry
- Volumetric

---

## 50. Lighting Rigs

The system shall support:

- Three-point lighting
- Product lighting
- Character lighting
- Softbox lighting
- Rim lighting
- Neon lighting
- Cinematic lighting
- Day lighting
- Night lighting
- Studio presets
- Custom rigs

---

## 51. Reference Lighting Analysis

The system shall estimate:

- Key direction
- Fill direction
- Rim direction
- Light size
- Shadow softness
- Color temperature
- Intensity ratio
- Environment contribution
- Reflection sources
- Contact shadow
- Volumetric contribution

---

## 52. Shadow System

The system shall support:

- Dynamic shadows
- Contact shadows
- Baked shadows
- Soft shadows
- Area-light shadows
- Cascaded shadows where relevant
- Shadow maps
- Ray-traced or path-traced shadows where available

Shadow quality shall be profile-dependent.

---

## 53. Reflection System

The system shall support:

- Environment reflections
- Reflection probes
- Planar reflections
- Screen-space reflections
- Baked reflections
- Ray-traced reflections where available
- Reflection fallbacks

---

## 54. Light Baking

The system shall support:

- Lightmaps
- Irradiance volumes
- Reflection probes
- Ambient occlusion baking
- Shadow baking
- Emission baking

Baked lighting shall remain linked to source scene versions.

---

## 55. Camera System

Camera properties shall include:

- Position
- Rotation
- Quaternion
- Projection
- Focal length
- Field of view
- Sensor size
- Aperture
- Focus distance
- Depth of field
- Near clip
- Far clip
- Lens shift
- Roll
- Aspect ratio
- Exposure
- Motion blur
- Target
- Constraints

---

## 56. Camera Movements

The system shall support:

- Pan
- Tilt
- Dolly
- Truck
- Pedestal
- Orbit
- Arc
- Crane
- Push-in
- Pull-out
- Zoom
- Rack focus
- Handheld
- Camera shake
- Follow
- Chase
- Turntable
- Product orbit
- Fly-through
- Interior walkthrough
- Cinematic reveal
- Hero-object reveal
- Exploded-view camera
- Scroll-controlled camera
- Cursor-controlled camera

---

## 57. Camera Paths

Camera paths shall support:

- Linear
- Bézier
- Catmull-Rom
- Editable control points
- Path constraints
- Look-at targets
- Multiple targets
- Target blending
- Speed ramps
- Banking
- Collision avoidance
- Camera bounds
- Automatic framing
- Subject tracking
- Focus transitions

---

## 58. Camera Collision

Camera collision avoidance shall support:

- Scene collision geometry
- Minimum subject distance
- Minimum wall distance
- Path correction
- Push-out
- Repathing
- Framing preservation

---

## 59. Automatic Framing

Automatic framing shall consider:

- Subject bounds
- Safe area
- Aspect ratio
- Negative space
- Rule of thirds
- Focus region
- Camera motion
- Responsive viewport
- Mobile composition

---

## 60. Multi-Camera System

The system shall support:

- Multiple cameras
- Camera cuts
- Camera blending
- Shot naming
- Shot duration
- Shot thumbnails
- Shot ordering
- Transition type
- Responsive variants
- Desktop and mobile compositions

---

## 61. Shot Timeline

A shot timeline shall coordinate:

- Active camera
- Camera path
- Focus
- Lens
- Subject animation
- Lighting
- Material changes
- Environment
- Effects
- Audio
- Cuts
- Blends

---

## 62. AI Cinematography

AI cinematography shall reason about:

- Shot intent
- Subject importance
- Focal point
- Composition
- Lens choice
- Camera distance
- Negative space
- Rule of thirds
- Symmetry
- Depth
- Lighting direction
- Motion pacing
- Reveal timing
- Visual hierarchy

---

## 63. Shot Types

The system shall generate:

- Establishing shots
- Close-ups
- Macro shots
- Product beauty shots
- Hero reveals
- Detail shots
- Low-angle shots
- High-angle shots
- Top-down shots
- Side profiles
- Front turnarounds
- Back turnarounds
- Three-quarter shots
- Over-the-shoulder views
- Symmetrical compositions
- Dramatic perspective
- Minimal product shots
- Cinematic lighting sequences

---

## 64. Cinematic Intent Metadata

Each shot may include intent such as:

- Reveal
- Establish
- Detail
- Scale
- Power
- Elegance
- Mystery
- Speed
- Precision
- Transformation
- Assembly
- Exploded view
- Character introduction

Intent metadata shall guide camera and lighting generation.

---

## 65. Depth of Field

Depth of field shall support:

- Focus distance
- Aperture
- Focal length
- Bokeh shape
- Near blur
- Far blur
- Focus pull
- Rack focus
- Subject tracking

---

## 66. Motion Blur

Motion blur shall support:

- Camera motion
- Object motion
- Shutter angle
- Sample count
- Validation-off mode
- Export fallbacks

---

## 67. Offline Rendering

Offline rendering may use:

- Blender Cycles
- Blender Eevee
- Other approved render backends

Offline rendering may be required for:

- Maximum Fidelity stills
- Product beauty renders
- Cinematic sequences
- Complex reflections
- Volumetrics
- High-quality shadows
- Simulation output
- Canva media layers

---

## 68. Real-Time Rendering

Real-time rendering shall primarily support:

- Three.js
- React Three Fiber
- WebGL
- Future WebGPU adapters

The runtime shall support:

- Scene loading
- Model loading
- Materials
- Cameras
- Lights
- Environments
- Animation
- Interaction
- Particles
- Physics
- Post-processing
- Responsive quality

---

## 69. Post-Processing

The 3D renderer shall support:

- Bloom
- Depth of field
- Motion blur
- Chromatic aberration
- Vignette
- Color grading
- Film grain
- Ambient occlusion
- Refraction
- Screen-space reflections
- Volumetrics
- Tone mapping
- Anti-aliasing

---

## 70. 3D Reconstruction Validation

Validation shall compare:

- Silhouette
- Proportion
- Landmark placement
- Camera angle
- Perspective
- Material
- Lighting
- Shadows
- Reflections
- Texture
- Color
- Multi-angle consistency
- Turntable consistency

---

## 71. Geometry Validation

Geometry validation shall inspect:

- Silhouette
- Proportions
- Part placement
- Thickness
- Symmetry
- Curvature
- Edge positions
- Surface continuity
- Feature landmarks
- Intersections
- Holes
- Normals
- Tangents

---

## 72. Camera Validation

Camera validation shall compare:

- Framing
- Position
- Rotation
- Focal length
- Field of view
- Horizon
- Perspective
- Lens distortion
- Subject distance
- Crop
- Roll

---

## 73. Material Validation

Material validation shall compare:

- Base color
- Roughness
- Metalness
- Reflectivity
- Transparency
- IOR
- Emission
- Subsurface
- Clearcoat
- Anisotropy
- Micro-surface detail

---

## 74. Lighting Validation

Lighting validation shall compare:

- Direction
- Intensity
- Temperature
- Shadow softness
- Fill ratio
- Rim light
- Reflection source
- Contact shadow
- Environment brightness
- Volumetrics

---

## 75. Multi-Angle Validation

For every available view:

```text
Set matched camera
→ Render model
→ Compare silhouette
→ Compare landmarks
→ Compare materials
→ Compare lighting
→ Produce score
→ Aggregate results
→ Correct model
```

A correction shall improve consistency across views, not only one angle.

---

## 76. Turntable Validation

Turntable validation shall inspect:

- Silhouette continuity
- Surface continuity
- Texture seams
- Material consistency
- Hidden geometry issues
- Part alignment
- Reflection continuity
- LOD transitions

---

## 77. Autonomous 3D Correction

Correction proposals may modify:

- Mesh proportions
- Vertex positions
- Part transforms
- Material properties
- Texture maps
- Camera
- Lighting
- UVs
- Topology
- Rig weights
- Animation timing

All corrections shall be:

- Structured
- Reversible
- Validated
- Scoped
- Recorded

---

## 78. Blender Bridge

Blender may execute:

- Import
- Modelling
- Sculpting
- Retopology
- UV work
- Baking
- Rigging
- Weight correction
- Animation
- Simulation
- Lighting
- Camera setup
- Rendering
- Export

The flow shall be:

```text
Canonical job
→ Blender operation manifest
→ Isolated execution
→ Output inspection
→ Validation
→ Asset registration
→ Canonical update
```

---

## 79. Blender Operation Manifests

A Blender operation manifest shall include:

- Job ID
- Blender version
- Input assets
- Scene setup
- Operations
- Output expectations
- Render settings
- Resource limits
- Deterministic seed
- Validation rules
- Output paths

---

## 80. Web Optimization

The system shall support:

- Polygon analysis
- Decimation
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
- Mobile profiles
- Static fallback
- Memory validation
- GPU profiling
- Frame-rate checking

---

## 81. Draw-Call Optimization

Draw-call reduction may use:

- Material merging
- Texture atlasing
- Geometry merging
- Instancing
- Shared materials
- Shared textures
- LOD grouping

Optimization shall not destroy logical editability in the master asset.

---

## 82. Texture Compression

Web textures shall support:

- KTX2
- Basis Universal
- WebP
- AVIF
- Channel packing
- Mipmaps
- Resolution variants

---

## 83. Geometry Compression

Geometry compression shall support:

- Draco
- Meshopt
- Quantization
- Index optimization
- Vertex cache optimization
- Attribute reduction

---

## 84. Responsive 3D Quality

Responsive profiles may adjust:

- LOD
- Texture resolution
- Shadow quality
- Particle count
- Reflection quality
- Post-processing
- Device pixel ratio
- Simulation quality
- Environment detail
- Camera composition

---

## 85. Static Fallbacks

Fallbacks may include:

- Static image
- Video loop
- Pre-rendered sequence
- Simplified model
- Disabled simulation
- Reduced particles
- Simplified materials

Fallback use shall be reported.

---

## 86. 3D Export Targets

The system shall support:

- GLB
- GLTF
- Three.js
- React Three Fiber
- WebGL
- GLSL
- Static renders
- Video sequences
- Canva media layers
- Future Babylon.js or WebGPU adapters

---

## 87. React Three Fiber Export

React Three Fiber export shall include:

- Canvas
- Scene component
- Model component
- Camera controller
- Lighting
- Environment
- Animation hooks
- Interaction handlers
- Scroll control
- Loading states
- Quality profiles
- Fallbacks
- Performance controls

---

## 88. Three.js Export

Three.js export shall include:

- Renderer setup
- Scene setup
- Model loading
- Camera
- Lights
- Environment
- Animation mixer
- Interaction
- Resize handling
- Quality profiles
- Cleanup
- Fallbacks

---

## 89. GLB and GLTF Export

GLB and GLTF export shall preserve where supported:

- Scene hierarchy
- Meshes
- Materials
- Textures
- Skeletons
- Animation clips
- Morph targets
- Cameras
- Lights
- Metadata
- Compression

---

## 90. Canva 3D Export

For Canva:

- 3D renders may become image layers
- 3D sequences may become video layers
- Shadows may remain separate
- Glows may remain separate
- UI overlays shall remain editable
- Text shall remain native
- Multiple camera views may become separate pages

The editability report shall be explicit.

---

## 91. MCP 3D Domains

MCP tools shall include:

```text
three.import_model
three.generate_model
three.inspect_scene
three.create_mesh
three.modify_mesh
three.retopologize
three.unwrap_uv
three.optimize_model
three.generate_lods
three.validate_topology

material.create
material.apply
material.match_reference
material.generate_textures
material.validate

rig.create
rig.bind
rig.correct_weights
rig.retarget_animation
rig.validate

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
lighting.validate

simulation.create
simulation.configure
simulation.bake
simulation.validate

render.render_frame
render.render_turntable
render.render_sequence

compare.compare_3d_render
compare.compare_reference_angles

export.glb
export.gltf
export.react_three_fiber
export.threejs
```

---

## 92. Command Compatibility

3D mutations shall use commands such as:

```text
mesh.create
mesh.update_geometry
mesh.retopologize
mesh.assign_material
mesh.set_pivot
model.set_scale
material.create
material.update
texture.assign
rig.create
rig.bind
rig.update_weights
camera.create
camera.update
camera.create_path
light.create
light.update
simulation.create
simulation.bake
```

---

## 93. 3D Job Types

Long-running jobs shall include:

- Import analysis
- Reconstruction
- Retopology
- UV unwrap
- Texture generation
- Baking
- Rigging
- Simulation
- Offline rendering
- Turntable rendering
- Multi-angle validation
- Optimization
- Export

---

## 94. Determinism

3D deterministic rendering shall pin:

- Document version
- Model asset version
- Texture hashes
- Material version
- Camera
- Lighting
- Renderer
- Blender version
- Seed
- Physics timestep
- Simulation cache
- Frame
- Color management
- Quality profile

---

## 95. Performance Metrics

The system shall report:

- Triangle count
- Vertex count
- Mesh count
- Material count
- Texture memory
- Draw calls
- Shader complexity
- GPU time
- CPU time
- Load time
- Animation cost
- Physics cost
- Frame-rate percentiles
- Peak memory

---

## 96. Error Handling

3D errors may include:

- Unsupported format
- Corrupt model
- Missing texture
- Missing material
- Invalid normals
- Invalid UVs
- Non-manifold geometry
- Rig failure
- Weight failure
- Simulation failure
- Camera failure
- Light failure
- Render failure
- Export failure
- GPU exhaustion
- Web budget failure

Errors shall reference affected entities.

---

## 97. Testing Requirements

Testing shall include:

- Import fixtures
- Unit conversion tests
- Orientation tests
- Mesh diagnostics
- Retopology tests
- UV tests
- PBR tests
- Material tests
- Rig tests
- Weight tests
- Animation tests
- Camera path tests
- Lighting tests
- Physics tests
- Blender Bridge tests
- Turntable validation tests
- Multi-angle validation tests
- Three.js export tests
- React Three Fiber export tests
- Performance tests
- Regression renders

---

## 98. Acceptance Criteria

The 3D Engine shall be implementation-ready when it can:

- Import approved formats
- Inspect scenes
- Normalize scale and orientation
- Generate and refine models
- Preserve multi-mesh structure
- Validate topology
- Retopologize
- Generate UVs
- Create PBR textures
- Build materials
- Rig characters
- Correct skin weights
- Animate rigs
- Run and bake simulations
- Create environments
- Match lighting
- Create cameras
- Create camera paths
- Create shot timelines
- Generate cinematic sequences
- Validate multiple angles
- Optimize for web
- Export GLB, GLTF, Three.js, and React Three Fiber
- Generate Canva-compatible media layers
- Report all fallbacks and limitations

---

## 99. Final 3D Engine and Cinematics Statement

The AEVUM 3D Engine and Cinematics system shall provide professional modelling, topology, UV, texturing, materials, rigging, animation, simulation, lighting, environment, camera, cinematography, validation, optimization, and export capabilities within one AI-controlled production workflow.

It shall produce high-quality, consistent, editable, and web-ready 3D experiences while preserving the Canonical Design Document as the single source of truth.

---

## 100. Phase 14 Implemented Foundation

Phase 14 implements production-grade registered GLB and GLTF inspection with glTF Transform, immutable normalized
import proposals, one independently addressable canonical mesh node per primitive, PBR material and embedded texture
extraction, camera and punctual-light extraction, deterministic transforms and bounds, one atomic `scene3d.import`
command, immutable Scene Runtime 3D projections, and renderer-neutral 3D Render Plans.

Inspection covers scenes, hierarchy, meshes, primitives, accessors, attributes, buffers, materials, textures, images,
samplers, cameras, lights, animations, skins, morph targets, extensions, vertices, triangles, draw calls, texture bytes,
and scene bounds. Missing positions, invalid indexes, invalid transforms or bounds, degenerate scale, unsupported
extensions/material features/primitive modes/skins/animations, missing resources, and absent cameras or scenes produce
structured diagnostics. Unsupported features are not silently executed.

Input must be an already registered GLB or GLTF asset whose SHA-256 identity matches supplied bytes. The local adapter
does not fetch network resources. It rejects unsafe URI schemes, absolute paths, backslashes, traversal, malformed
JSON/binary/buffers, missing dependencies, and configurable resource-limit violations.

Phase 14 does not implement FBX, OBJ, STL, USD, USDZ, or BLEND import; geometry repair or modelling; decimation;
retopology; UV editing; texture generation; advanced material authoring; rig or skin execution; character animation;
physics; particles; simulations; HDRI execution; Blender automation; production WebGL/R3F rendering; image or
multi-view 3D reconstruction; AI cinematography; high-end rendering; or 3D visual comparison. Those remain future
phases and must not be inferred from the canonical records or diagnostics.

---

## 101. Phase 15 Implemented Blender Runtime

Blender Bridge protocol `1.0.0` is tested with Blender `5.1.2` and embedded Python `3.13.9`. Blender `5.1.x` is
`SUPPORTED`, other Blender 5 releases are `UNTESTED`, and other major releases are `UNSUPPORTED`. Readiness requires a
real successful background launch and writable isolated workspace.

The finite dispatcher implements scene import/inspection/validation/GLB export; object inspection, local/world
transform, duplication, and deletion; mesh inspection; bounded Principled PBR updates; camera inspection, transform,
look-at, lens/FOV, clipping, and activation; and point/spot/sun light inspection and bounded updates. AEVUM uses
right-handed Y-up, negative-Z-forward meters; bridge matrices convert to Blender's Z-up space and back. Quaternions
are converted through basis matrices, not component swapping.

Jobs enforce input/output size, object, mesh, material, duration, and concurrency budgets. Every process starts from
factory settings with autoexec disabled and receives an allowlisted environment. Workspaces reject hash mismatches,
path escape, and unsafe cleanup. Output artifacts have SHA-256 identity, provenance, and non-sensitive job-local
logical paths.

Determinism is semantic: identical input, runtime, manifest, and configuration must reconcile to identical canonical
hierarchy, transforms, material values, camera/light state, and proposal fingerprint. Blender GLB bytes may differ and
are never falsely claimed byte-deterministic.

Phase 15 does not implement advanced modelling, retopology, UV work, texture painting, procedural shader authoring,
rigging, physics, simulation, high-end rendering, AI 3D generation, or visual 3D correction.

---

## 102. Phase 16 Professional Modeling Foundation

The Blender Bridge professional protocol supplies deterministic explicit selectors for vertices, edges, faces,
boundary loops, material slots, connected components, normal direction, and position ranges. Bounded semantic
operations cover extrusion, inset, bevel, loop cut, subdivision, solidify, mirror, join/separate, merge/delete,
normals, shading, origin/pivot, decimation/remesh/cleanup, UV layers/seams/unwrap/pack/transform, PBR validation, web
quality analysis, and simple decimation-based LOD generation.

Production proof covers topology inspection, extrusion, inset, bevel, applied subdivision, solidify, mirror, join,
material separation, normal repair, duplicate-position repair, UV creation/unwrap/pack and GLB round trip, PBR
inspection/update and canonical recovery, web metrics, and lower-triangle LOD output with material retention. Loop-cut
edge-ring handling, non-destructive modifier retention, voxel remesh, advanced repairs, selected-face separation,
texel-density estimates, and UDIM inspection remain experimental until broader fixtures validate them.

Topology reports include counts, triangle/quad/ngon mix, boundaries, non-manifold edges, loose and degenerate geometry,
duplicate-position candidates, connected components, Euler characteristic, quality profile, diagnostics, and a
deterministic fingerprint. UV reports include layers, active map, islands, seams, missing/zero-area faces,
out-of-bounds loops, approximate overlap/packing metrics, optional density, UDIM tiles, and diagnostics. Approximate
metrics are labeled and are not represented as exact geometric proofs.

Professional automatic retopology, character topology, sculpting, texture baking/painting/generation, arbitrary shader
graphs, rigging, simulation, production rendering, and visual 3D comparison remain deferred. Phase 16 establishes safe
local contracts; it does not claim those later capabilities.

## 103. Phase 18 Multi-View Reconstruction Execution

`packages/geometry-reconstruction` implements the first real local reconstruction provider
(`LOCAL_BASELINE`) consuming Phase 17's multi-view evidence: box/cylinder primitive fitting derived
from silhouette-backed dimension constraints, and a real multi-view silhouette-volume intersection
(voxel visual hull) with per-voxel boundary-face surface extraction as the general-purpose
fallback. Candidates are scored against real cross-view metrics (rasterized silhouette IoU/
precision/recall, Chamfer boundary distance, closest-point-on-triangle landmark distance,
constraint satisfaction, coverage, and a local structural-validity check) and refined through a
bounded, gradient-free dimension-correction loop that rejects any adjustment regressing a
previously-scored view.

Generated candidates are exported to a real GLB (`@gltf-transform/core`), registered as a
`GENERATED`-origin asset with full multi-parent provenance, and handed to the unmodified Phase 14
`create3DImportProposal`/`scene3d.import` path — no parallel import or Blender-execution path was
introduced. Geometry generation is pure TypeScript because the Blender Bridge's bounded operation
set has no primitive-creation capability; Blender's role remains topology inspection/editing of
already-imported geometry (Phase 15/16), invoked separately.

This works best for product-like, bounded, roughly convex objects with strong silhouette/landmark
evidence. Characters, hair, cloth, organic anatomy, transparent objects, extreme occlusion, and any
external/paid reconstruction provider remain deferred — `LOCAL_BASELINE` is the only real provider,
and no new user-facing credential was introduced. See ADR-0002 for why this phase covers
reconstruction execution rather than the originally-planned rigging work.

## 104. Phase 19A Reconstruction Hardening

Two real gaps in the Phase 18 correction loop are closed without changing the pipeline's shape.
Multi-part candidates now correct per part: bounded translation, box axis-scale, and a landmark-
centroid reposition move are each scored against Phase 17's per-part rectangle evidence (bounding-
box IoU, since Phase 17 attaches rectangles to parts, not full contours) and accepted only when the
target part improves, no sibling part regresses beyond tolerance, and no view regresses — the same
non-regression discipline Phase 18 already applied to whole-candidate dimension correction, applied
per part instead. Voxel-hull candidates now get a second, evidence-driven refinement pass
(`refineOccupancyFromEvidence`) after the initial silhouette-intersection carve, on top of the raw
morphological dilate/erode primitives it is built from. The refinement is deliberately asymmetric:
removing a voxel only needs majority multi-view disagreement (safe — it can only trim volume, never
add unsupported volume), while adding one back requires unanimous multi-view agreement, matching the
strict-intersection rule the initial carve already used. A more lenient majority-agreement addition
rule was implemented and measured first; it was reverted because it reintroduced exactly the phantom
volume strict intersection exists to prevent, lowering cross-view IoU on every real fixture tested.

Reconstructed geometry can now also reach the canonical scene without a manual step: `three.import_scene`
(detailed in the MCP Specification) exposes the existing Phase 14 `scene3d.import` command as a bounded
MCP write tool, so an Agent (or any authenticated client) can generate a candidate and import it in the
same authenticated session. No new rendering, geometry-generation, or Command Engine capability was added
by this — it is purely a new authorization/transport surface over paths that already existed.
