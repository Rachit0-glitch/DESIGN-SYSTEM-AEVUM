# AEVUM AI Reconstruction Engine — Animation and Rendering

## Phase 21 Fixed-Time Cinematic Evaluation

`evaluateCamera()` resolves one camera or cinematic sequence at an explicit time. Evaluation order is deterministic:
responsive/global Animation Core values, active shot selection, shot-local timeline, camera path, target orientation,
viewport aspect, depth-of-field target, and transition progress. Orbit changes camera position around a declared
target; dolly changes position without changing focal length; zoom remains a lens timeline value. Exact shot cuts use
half-open ranges except for the final endpoint, avoiding ambiguous active cameras at a boundary.

Scene Runtime evaluates camera and lighting from the same viewport time before render-plan creation. Renderer 3D now
emits `CAMERA_BIND`, `CAMERA_TRANSFORM`, `CAMERA_PROJECTION`, `CAMERA_LENS`, `CAMERA_DOF`, and `SHOT_ACTIVATE`
operations containing resolved values only. These operations are REAL renderer-independent contracts; browser/GPU
playback, dissolve compositing, motion blur, and rendered video remain DEFERRED.

## 1. Purpose

This document defines the animation and rendering systems of the AEVUM AI Reconstruction Engine.

It is authoritative for:

- Canonical animation semantics
- Timeline structure
- Tracks
- Keyframes
- Easing
- Springs
- Time remapping
- Trigger systems
- Interaction state
- 2D rendering
- 3D runtime rendering
- Camera animation
- Lighting animation
- Material animation
- Particle animation
- Scroll-driven experiences
- Deterministic rendering
- Preview rendering
- Validation rendering
- Export rendering
- Runtime adapters
- Performance profiles
- Reduced-motion behaviour
- Frame capture
- Render diagnostics

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`
- `03_DESIGN_DOCUMENT_MODEL.md`
- `04_RECONSTRUCTION_PIPELINE.md`
- `05_TYPOGRAPHY_AND_ASSETS.md`

Animation data shall remain independent from any one runtime library.

Rendering shall derive from the Canonical Design Document and shall not become an alternate source of truth.

---

## 2. Core Principles

The animation and rendering systems shall follow these principles:

1. Animation is a first-class part of the Canonical Design Document.
2. One canonical timeline model shall support 2D and 3D.
3. Animation semantics shall remain runtime-independent.
4. Renderers shall not own project state.
5. Preview and validation renders shall derive from the same document version.
6. Deterministic rendering is required for reliable comparison.
7. Complex motion shall remain structured and editable.
8. Scroll and interaction logic shall be explicit.
9. Unsupported export mappings shall be reported.
10. Reduced-motion variants shall be preserved.
11. Performance optimization shall not overwrite master animation data.
12. 2D and 3D animation shall be synchronizable.
13. Camera, lighting, materials, shaders, and particles shall be animatable.
14. Render outputs shall remain traceable to document, asset, and runtime versions.
15. Maximum Fidelity shall prioritize visual correctness without removing delivery profiles.

---

## 3. Animation System Scope

The animation system shall support:

- Property animation
- Transform animation
- Text animation
- Vector animation
- Path morphing
- Mask animation
- Effect animation
- Scroll animation
- Interaction animation
- State-based animation
- Audio-reactive animation
- Video-synchronized animation
- Camera animation
- Light animation
- Material animation
- Shader animation
- Particle animation
- Rig animation
- Morph-target animation
- Physics-driven animation
- Procedural animation
- Nested sequences
- Multi-camera shot timelines
- Shared 2D and 3D experiences

---

## 4. Canonical Timeline Model

Animation shall use the canonical timeline structures defined in the Design Document Model.

A timeline shall contain:

- Stable timeline ID
- Name
- Duration
- Frame rate
- Time scale
- Loop mode
- Loop region
- Labels
- Tracks
- Nested timelines
- Trigger bindings
- Playback metadata
- Export compatibility metadata

The timeline shall not store runtime-specific objects such as:

- GSAP timelines
- Framer Motion controls
- Web Animations instances
- Three.js AnimationMixer instances
- Browser event objects
- Rive runtime instances

Runtime projections shall be generated from canonical timeline data.

---

## 5. Timeline Types

The system shall support:

### 5.1 Linear Timeline

A timeline with a fixed duration and direct time progression.

### 5.2 Scroll Timeline

A timeline driven by scroll position, scroll distance, or scroll velocity.

### 5.3 Interaction Timeline

A timeline triggered by user interaction.

### 5.4 State Timeline

A timeline activated by application or component state.

### 5.5 Media Timeline

A timeline synchronized with audio or video progress.

### 5.6 Procedural Timeline

A timeline controlled by runtime functions, simulation, or generated motion.

### 5.7 Shot Timeline

A timeline coordinating cameras, lighting, subject motion, and cuts.

### 5.8 Nested Timeline

A timeline embedded inside another timeline.

---

## 6. Track Model

Each track shall define:

- Stable track ID
- Target node ID
- Property path
- Value type
- Keyframes
- Muted state
- Locked state
- Blend mode
- Layer priority
- Evaluation order
- Export compatibility

Tracks shall support:

- Scalar values
- Vectors
- Colors
- Angles
- Length values
- Booleans
- Enumerations
- Paths
- Gradients
- Matrices
- Quaternions
- Material values
- Shader uniforms
- Rig poses
- Custom structured values

---

## 7. Property Paths

Property paths shall be stable and schema-aware.

Examples:

```text
transform.position.x
transform.rotation.z
opacity
dimensions.width
text.runs[0].style.letterSpacing
effects[0].blurRadius
camera.fieldOfView
camera.focusDistance
light.intensity
material.roughness
shader.uniforms.distortion
particle.emissionRate
rig.bones[node_bone_arm].rotation
```

Property paths shall be validated against the target node type.

Invalid paths shall fail before runtime evaluation.

---

## 8. Keyframes

Each keyframe shall include:

- Stable keyframe ID
- Time
- Value
- Interpolation
- Easing
- Tangents
- Hold behaviour
- Metadata
- Source-reference links where reconstructed
- Confidence where inferred

Keyframes shall support:

- Step
- Hold
- Linear
- Bézier
- Spring
- Custom interpolation

---

## 9. Easing

Supported easing shall include:

- Linear
- Ease in
- Ease out
- Ease in-out
- Custom cubic Bézier
- Steps
- Bounce
- Elastic
- Back
- Overshoot
- Inertia
- Custom sampled curve

Easing definitions shall remain library-independent.

Runtime adapters shall translate them into target-compatible forms.

---

## 10. Spring Model

A canonical spring shall support:

- Mass
- Stiffness
- Damping
- Initial velocity
- Rest speed
- Rest delta
- Overshoot clamping
- Duration approximation

Spring evaluation shall be deterministic for pinned settings.

---

## 11. Time Control

The system shall support:

- Time scaling
- Reverse playback
- Pause
- Resume
- Seek
- Scrub
- Loop
- Ping-pong
- Loop regions
- Time remapping
- Delay
- Offset
- Stagger
- Sequence alignment
- Label-based navigation

---

## 12. Nested Timelines

Nested timelines shall support:

- Time offset
- Time scale
- Reverse
- Looping
- Activation conditions
- Shared targets
- Independent playback
- Parent-child synchronization

Cycles shall be prohibited unless explicitly supported by a procedural controller.

---

## 13. Timeline Labels

Labels shall provide stable named positions.

Examples:

```text
intro_start
hero_reveal
camera_orbit
details_open
outro
```

Labels shall be used for:

- Navigation
- Trigger targets
- Export mapping
- Shot sequencing
- Validation frame selection

---

## 14. Animation Blending

The system shall support blending between tracks or timelines.

Blend modes may include:

- Replace
- Add
- Multiply
- Weighted blend
- Pose blend
- Crossfade
- Layered override
- Masked blend

The system shall define deterministic conflict resolution when multiple tracks target the same property.

---

## 15. Animation Layer Priority

When multiple animations affect one property, evaluation shall consider:

1. Locked or explicit user overrides
2. Active state timeline
3. Interaction timeline
4. Scroll timeline
5. Base timeline
6. Procedural layer
7. Default document value

Exact priority may be configurable, but shall remain explicit.

---

## 16. Interaction Triggers

Supported triggers shall include:

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

Each trigger shall define:

- Stable trigger ID
- Trigger type
- Source
- Target
- Conditions
- Debounce
- Throttle
- Activation rule
- Deactivation rule
- Timeline action
- State action
- Accessibility fallback

---

## 17. Trigger Actions

Trigger actions may include:

- Play
- Pause
- Resume
- Reverse
- Seek
- Restart
- Toggle
- Set state
- Set property
- Activate camera
- Start simulation
- Stop simulation
- Emit custom event
- Load asset
- Change quality profile

---

## 18. Scroll Animation

Scroll animation shall support:

- Scroll progress
- Scroll distance
- Scroll velocity
- Scroll direction
- Container scroll
- Page scroll
- Horizontal scroll
- Vertical scroll
- Nested scroll containers
- Scroll snapping
- Scrubbing
- Pinning
- Sticky sequences
- Section progress
- Enter and leave ranges
- Speed-based effects
- Momentum-aware effects

Scroll definitions shall preserve intent rather than hard-coding one library's API.

---

## 19. Scroll Range Model

A scroll-driven animation shall define:

- Scroll source
- Start condition
- End condition
- Offset
- Pin behaviour
- Scrub behaviour
- Smoothing
- Velocity response
- Responsive overrides
- Reduced-motion fallback

Examples of start and end conditions:

```text
top bottom
center center
bottom top
absolute pixel offset
percentage progress
container-relative range
```

---

## 20. Pinned Sequences

Pinned sequences shall support:

- Pin target
- Pin container
- Pin duration
- Spacer behaviour
- Nested pin handling
- Responsive disabling
- Mobile alternative
- Reduced-motion alternative
- Section handoff
- Z-order management

---

## 21. Parallax

Parallax shall support:

- Position depth
- Scale depth
- Rotation depth
- Blur depth
- Opacity depth
- 3D camera depth
- Mouse-driven parallax
- Scroll-driven parallax
- Device-orientation parallax where permitted

Parallax depth shall be explicit and exportable.

---

## 22. Text Animation

The animation system shall support:

- Whole-block animation
- Line animation
- Word animation
- Character animation
- Split-text animation
- Mask reveals
- Stroke draws
- Gradient movement
- Variable font-axis animation
- Letter-spacing animation
- Text-on-path animation
- Perspective text animation
- Scrambled text
- Type-on animation

Text segmentation shall remain stable for validation and export.

---

## 23. Vector Animation

The system shall support:

- Path drawing
- Path morphing
- Node animation
- Stroke width animation
- Dash offset
- Fill animation
- Gradient animation
- Mask animation
- Shape transformation
- Boolean-result animation where practical

Path morphing shall require compatible topology or an explicit remapping.

---

## 24. Mask and Effect Animation

Animatable mask and effect properties shall include:

- Mask path
- Mask transform
- Feather
- Inversion
- Blur
- Glow
- Shadow
- Bloom
- Refraction
- Displacement
- Grain
- Noise
- Color grade
- Chromatic aberration
- Shader uniforms

---

## 25. 3D Transform Animation

3D nodes shall support animation of:

- Position
- Rotation
- Quaternion
- Scale
- Pivot
- Visibility
- Opacity
- Morph targets
- Material assignments
- LOD profile
- Parent constraints

Quaternion interpolation shall be preferred for stable 3D rotation.

---

## 26. Rig Animation

Rig animation shall support:

- Bone transforms
- IK controls
- FK controls
- IK/FK switching
- Constraint weights
- Facial bones
- Blend shapes
- Morph targets
- Eye controls
- Jaw controls
- Finger controls
- Root motion
- Animation layers
- Retargeted clips
- Motion blending

---

## 27. Character Animation Correction

The system shall support:

- Foot-lock correction
- Ground contact correction
- Hand contact correction
- Root-motion correction
- Loop correction
- Pose stabilization
- Interpolation cleanup
- Motion smoothing
- Weight-shift correction
- Limb penetration correction

---

## 28. Camera Animation

Camera animation shall support:

- Position
- Rotation
- Quaternion
- Focal length
- Field of view
- Sensor size
- Aperture
- Focus distance
- Depth of field
- Lens shift
- Roll
- Exposure
- Camera target
- Constraints

Supported movement patterns include:

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
- Shake
- Follow
- Chase
- Turntable
- Product orbit
- Fly-through
- Interior walkthrough
- Hero reveal
- Exploded-view camera
- Scroll-controlled camera
- Cursor-controlled camera

---

## 29. Camera Paths

Camera paths shall support:

- Linear paths
- Bézier paths
- Catmull-Rom paths
- Editable control points
- Look-at targets
- Multiple targets
- Target blending
- Banking
- Speed ramps
- Collision avoidance
- Camera bounds
- Automatic framing
- Subject tracking

---

## 30. Multi-Camera Timelines

Multi-camera support shall include:

- Multiple active camera candidates
- Camera cuts
- Camera blending
- Shot duration
- Shot naming
- Preview thumbnails
- Transition metadata
- Responsive camera variants
- Desktop composition
- Mobile composition
- Portrait composition
- Landscape composition

A shot timeline shall preserve exact cut and blend timing.

---

## 31. Lighting Animation

Lights shall support animation of:

- Position
- Rotation
- Color
- Temperature
- Intensity
- Range
- Angle
- Penumbra
- Shadow settings
- Volumetric density
- Target
- Visibility

Lighting sequences may include:

- Light sweeps
- Flicker
- Pulse
- Day-to-night transitions
- Product reveal lighting
- Character lighting changes
- Cinematic cue changes

---

## 32. Material Animation

Materials shall support animation of:

- Base color
- Roughness
- Metalness
- Normal strength
- Height
- Displacement
- Emission
- Opacity
- Transmission
- IOR
- Clearcoat
- Anisotropy
- Subsurface scattering
- Iridescence
- Texture transform
- Texture blend
- Shader uniforms

---

## 33. Shader Animation

Shader animation shall support:

- Numeric uniforms
- Vector uniforms
- Color uniforms
- Texture switching
- Time uniforms
- Resolution uniforms
- Pointer uniforms
- Scroll uniforms
- Audio uniforms
- Camera-dependent uniforms

Shaders shall remain validated and sandboxed.

---

## 34. Particle Animation

Particle systems shall support:

- Emission rate
- Lifetime
- Position
- Velocity
- Acceleration
- Gravity
- Wind
- Size
- Rotation
- Color
- Opacity
- Spawn shape
- Collision
- Turbulence
- Trail
- Attractor
- Repulsor
- Baked mode
- Real-time mode

---

## 35. Physics-Driven Animation

Physics systems may include:

- Rigid body
- Soft body
- Cloth
- Hair
- Rope
- Springs
- Fluids
- Smoke
- Fire
- Destruction
- Object scattering

Physics animation shall support:

- Deterministic seed
- Fixed timestep
- Bake
- Cache
- Reset state
- Web simplification
- Static fallback

---

## 36. Procedural Animation

Procedural animation may include:

- Noise
- Oscillation
- Wave motion
- Follow behaviour
- Orbit
- Look-at
- Spring chains
- Audio reaction
- Data-driven motion
- Cursor response
- Scroll velocity response

Procedural controllers shall be declared explicitly.

---

## 37. Audio-Reactive Animation

Audio-reactive animation shall support:

- Amplitude
- Frequency bands
- Beat markers
- Onset detection
- Speech markers
- Timeline synchronization

Audio-reactive values shall be recordable or bakeable for deterministic export.

---

## 38. Video-Synchronized Animation

Video synchronization shall support:

- Playback progress
- Frame mapping
- Cue points
- Scene cuts
- Captions
- Overlay timing
- Camera synchronization
- Scroll-controlled playback

---

## 39. State Machines

Interactive experiences may use state machines.

State machines shall define:

- Stable state ID
- Initial state
- State properties
- Entry actions
- Exit actions
- Transitions
- Conditions
- Trigger bindings
- Timeline bindings

Examples:

- Closed / opening / open / closing
- Idle / hover / active
- Loading / loaded / error
- Camera overview / detail / exploded
- Character idle / walk / run / salute

---

## 40. Reduced-Motion Behaviour

The system shall support reduced-motion alternatives.

Possible strategies include:

- Disable non-essential motion
- Replace motion with fades
- Reduce travel distance
- Remove parallax
- Remove camera shake
- Replace scroll scrubbing with static states
- Use static 3D render
- Reduce particle count
- Simplify transitions

Reduced-motion behaviour shall be stored in responsive or accessibility metadata.

Canonical schema `1.2.0` stores a typed responsive motion override with `PRESERVE`, `REDUCE`, or `DISABLE` behaviour
and a bounded duration scale. Scene Runtime resolves this after orientation and before quality-profile overrides so
render and validation consumers receive the same deterministic motion policy.

Phase 10 applies that policy during fixed-time evaluation. A canonical reduced-motion timeline is selected when one is
registered. Otherwise `REDUCE` applies the bounded duration scale and `DISABLE` resolves the final static state. No
continuous playback or browser event loop is involved.

---

## 41. Rendering System Scope

The rendering system shall support:

- Interactive preview
- Deterministic validation render
- Export verification render
- High-resolution still render
- Region render
- Layer-only render
- Typography-only render
- Edge render
- Mask render
- 3D turntable render
- Camera sequence render
- Animation frame render
- Video sequence render
- Static fallback render

---

## 42. Hybrid 2D Renderer

The Hybrid 2D Renderer foundation shall emit deterministic Render Graph operations for:

- Paint
- Clip
- Mask
- Blend
- Text metadata
- Image metadata
- Vector metadata
- Effects

It shall remain independent from DOM, CSS, browser, and GPU APIs. Future target adapters shall support:

- DOM
- CSS
- SVG
- Canvas
- WebGL
- Raster compositing

A backend planner shall expose an inspectable hint per node without invoking the backend.

The planner shall consider:

- Fidelity
- Editability
- Accessibility
- Animation
- Performance
- Validation determinism
- Export target
- Browser support

---

## 43. Render Backend Selection

Examples:

- Semantic interface text → DOM
- Responsive layout → DOM and CSS
- Editable vector art → SVG
- Pixel processing → Canvas
- Custom shader effect → WebGL
- Unsupported complex source effect → Raster fallback
- 3D content → Three.js/WebGL or WebGPU adapter
- Canva-only unsupported effect → Separate raster layer

The selected backend shall be inspectable.

---

## 44. Runtime Scene Projection

Scene Runtime shall create the runtime projection from the Canonical Design Document. The renderer shall only
consume that immutable projection.

The projection may include:

- Resolved hierarchy
- Resolved transforms
- Resolved layout
- Resolved constraints
- Resolved component instances
- Resolved assets
- Resolved responsive overrides
- Resolved timelines
- Resolved reference metadata

The projection shall be disposable and regenerable.

---

## 45. 2D Rendering Order

The renderer shall preserve:

- Parent-child hierarchy
- Z-order
- Isolation
- Blend modes
- Clipping
- Masks
- Effects
- Transparency
- Compositing groups
- 3D embedded layers

Rendering order shall be deterministic.

---

## 46. 3D Rendering Runtime

The browser 3D runtime shall support:

- Three.js
- React Three Fiber bindings where required
- WebGL
- Future WebGPU adapters
- Meshes
- Materials
- Textures
- Cameras
- Lights
- Environments
- AnimationMixer-compatible projection
- Post-processing
- Physics integration
- Particles
- Responsive quality profiles

Blender may be used for offline rendering and baking, but shall not own canonical state.

---

## 47. Render Modes

The renderer shall support:

### Interactive Mode

- User interaction
- Dynamic time
- Adaptive quality
- Real-time physics
- Live input

### Deterministic Mode

- Fixed time
- Fixed seed
- Fixed physics state
- Pinned runtime versions
- Pinned assets
- Pinned fonts
- Stable viewport
- No adaptive quality changes

### Export Mode

- Target-specific runtime
- Export constraints
- Asset packaging
- Verification capture

### Maximum Fidelity Mode

- Highest-quality effects
- High-resolution assets
- Advanced post-processing
- Multiple samples
- Offline rendering where required

---

## 48. Deterministic Rendering

Deterministic rendering shall pin:

- Document version
- Schema version
- Asset hashes
- Font hashes
- Renderer version
- Browser version
- Runtime version
- Viewport
- Device scale factor
- Time
- Frame
- Random seed
- Physics timestep
- Simulation state
- Camera
- Lighting
- Quality profile
- Color space

The renderer shall wait for:

- Font loading
- Image loading
- Video readiness
- Model loading
- Texture loading
- Shader compilation
- Layout stabilization
- Animation initialization

---

## 49. Fixed Time and Frame Evaluation

Validation shall support rendering at:

- Exact time
- Exact frame
- Timeline label
- Trigger state
- Scroll progress
- Camera shot
- Animation state

Frame conversion shall use the canonical timeline frame rate.

---

## 50. Physics Determinism

Physics validation shall use:

- Fixed timestep
- Fixed substeps
- Fixed seed
- Pinned physics engine version
- Known initial state
- Baked caches where required

Non-deterministic physics shall not be used for pixel validation without baking.

---

## 51. Shader Determinism

Validation shaders shall avoid uncontrolled values.

The system shall pin:

- Time
- Random seed
- Noise seed
- Resolution
- Pointer state
- Scroll state
- Audio input
- Camera state

---

## 52. Layout Stabilization

Before capture, the renderer shall confirm:

- Fonts loaded
- Text shaped
- Images decoded
- Layout complete
- Responsive overrides applied
- CSS transitions disabled where required
- Async data resolved
- Component state fixed
- Scroll position fixed
- Viewport stable

---

## 53. Render Passes

The rendering system may use multiple passes:

- Base color
- Alpha
- Depth
- Normals
- Object ID
- Material ID
- Motion vectors
- Shadows
- Reflections
- Effects
- Typography
- Edge map

These passes may support:

- Validation
- Compositing
- Masking
- Debugging
- Canva layer export
- 3D comparison

---

## 54. Object and Layer ID Passes

Where practical, renders shall include node-to-pixel mapping.

This mapping may be generated using:

- Object ID pass
- Layer ID pass
- Encoded color pass
- DOM region map
- SVG element map

The mapping shall help attribute visual errors to responsible nodes.

---

## 55. High-Resolution Rendering

High-resolution rendering shall support:

- Scale factors
- Tile rendering
- Supersampling
- Multi-sample anti-aliasing
- Offline rendering
- Large-format posters
- Product renders
- Texture baking
- Maximum Fidelity comparison

Tile seams shall be avoided.

---

## 56. Region Rendering

Region rendering shall support:

- Bounding-box crop
- Node-based crop
- Reference-region crop
- Camera crop
- Typography region
- Material region

Region renders shall preserve exact coordinate mapping.

---

## 57. Layer-Only Rendering

The renderer shall support rendering:

- One node
- One subtree
- One component
- One material
- One text block
- One camera
- One light group
- One effect pass

Layer-only rendering shall support debugging and validation.

---

## 58. Animation Rendering

The system shall render:

- Individual frames
- Frame ranges
- Full sequences
- Loops
- Shot ranges
- Turntables
- Scroll progress samples
- Trigger states

Outputs may include:

- PNG sequence
- EXR sequence
- WebP sequence
- Video
- GIF
- Lottie
- Rive
- Static keyframes

---

## 59. Frame Capture Metadata

Every captured frame shall record:

- Project ID
- Document version
- Timeline ID
- Time
- Frame
- Viewport
- Camera
- Quality mode
- Renderer version
- Asset manifest
- Font manifest
- Seed
- Color space
- Output hash

---

## 60. Post-Processing

Supported post-processing may include:

- Bloom
- Depth of field
- Motion blur
- Chromatic aberration
- Vignette
- Color grading
- Film grain
- Tone mapping
- Anti-aliasing
- Refraction
- Screen-space reflections
- Ambient occlusion
- Volumetrics

Post-processing settings shall be canonical or derived from explicit render profiles.

---

## 61. Tone Mapping and Exposure

The renderer shall support explicit:

- Tone mapping
- Exposure
- White balance
- Color grading
- Output color space

Validation shall use consistent settings.

---

## 62. Motion Blur

Motion blur shall support:

- 2D directional blur
- 2D vector blur
- 3D camera motion blur
- 3D object motion blur
- Shutter angle
- Sample count
- Validation fallback

Motion blur may be disabled for structural comparison passes.

---

## 63. Depth of Field

Depth of field shall support:

- Focus distance
- Aperture
- Focal length
- Bokeh shape
- Near blur
- Far blur
- Sample quality

Structural validation may use an additional no-DOF pass.

---

## 64. Real-Time Performance Profiles

The system shall support profiles such as:

### Desktop High

- Full effects
- High texture resolution
- High LOD
- Advanced post-processing
- Higher particle count

### Desktop Balanced

- Moderate effects
- Optimized textures
- Balanced LOD
- Reduced post-processing

### Mobile

- Lower LOD
- Reduced texture resolution
- Reduced particles
- Simplified shaders
- Limited post-processing

### Static Fallback

- Pre-rendered image or video
- No interactive 3D requirement

---

## 65. Adaptive Quality

Interactive mode may adapt:

- Device pixel ratio
- Shadow quality
- Texture resolution
- Particle count
- LOD
- Post-processing
- Reflection quality

Adaptive quality shall be disabled during deterministic validation.

---

## 66. Frame-Rate Targets

Recommended targets:

- 60 FPS for premium desktop interaction
- 30–60 FPS for mobile interaction
- Stable frame pacing
- Configurable lower targets for heavy cinematic scenes

The system shall report:

- Average FPS
- Minimum FPS
- Frame-time percentiles
- GPU time
- CPU time
- Draw calls
- Triangle count
- Texture memory

---

## 67. Render Budgets

Render profiles may define:

- Max draw calls
- Max triangles
- Max texture memory
- Max shader complexity
- Max particle count
- Max frame time
- Max asset load size
- Max initial load size

Budget violations shall be reported.

---

## 68. Lazy and Progressive Loading

The renderer shall support:

- Lazy-loaded scenes
- Lazy-loaded models
- Progressive texture loading
- Progressive model LOD
- Placeholder geometry
- Static preview
- Preload hints
- Priority assets
- Background streaming

Loading states shall remain part of export behaviour.

---

## 69. Error Handling

Render errors may include:

- Missing asset
- Missing font
- Invalid shader
- Invalid material
- Invalid geometry
- Camera missing
- Light missing
- Unsupported effect
- Browser incompatibility
- GPU resource exhaustion
- Physics failure
- Timeline failure
- Export runtime failure

Errors shall include node or asset references where possible.

---

## 70. Runtime Adapter Architecture

Canonical animation and rendering shall use adapters for:

- CSS animations
- Web Animations API
- GSAP
- Framer Motion
- Three.js
- React Three Fiber
- Lottie
- Rive
- Video sequences
- Static keyframes

Adapters shall report unsupported semantics.

---

## 71. CSS Animation Adapter

The CSS adapter may support:

- Transform
- Opacity
- Color
- Filter
- Basic clip-path
- Keyframes
- Delays
- Iteration
- Timing functions

It shall report unsupported:

- Complex nested timelines
- Advanced springs without approximation
- Complex camera animation
- 3D scene animation
- Rich path morphing
- Physics

---

## 72. GSAP Adapter

The GSAP adapter may support:

- Timelines
- Labels
- ScrollTrigger mapping
- Scrubbing
- Pinning
- Staggering
- Motion paths
- Text animation
- 2D and 3D property animation
- Camera values
- Shader uniforms
- Nested timelines

The adapter shall still derive from canonical data.

---

## 73. Framer Motion Adapter

The Framer Motion adapter may support:

- Component variants
- Layout animation
- Gestures
- Springs
- Presence
- Shared layout transitions
- Scroll values
- State transitions

Unsupported timeline semantics shall be reported or mapped through additional runtime logic.

---

## 74. Three.js Adapter

The Three.js adapter shall map:

- Scene hierarchy
- Meshes
- Materials
- Cameras
- Lights
- Animation clips
- Morph targets
- Skeletons
- Particles
- Post-processing
- Interaction
- Physics integration

---

## 75. React Three Fiber Adapter

The React Three Fiber adapter shall generate:

- Canvas setup
- Scene components
- Model components
- Camera controllers
- Lighting components
- Environment components
- Animation hooks
- Interaction handlers
- Quality profiles
- Suspense and loading states
- Static fallbacks

---

## 76. Lottie Adapter

The Lottie adapter may support:

- 2D vector animation
- Shape layers
- Transform animation
- Masks
- Text where supported
- Image layers
- Basic effects

Unsupported content shall be flattened or reported.

---

## 77. Rive Adapter

The Rive adapter may support:

- Vector animation
- State machines
- Interaction
- Component states
- Runtime input
- Responsive artboards

Unsupported 3D and complex shader content shall be reported.

---

## 78. Export Render Validation

Each exported runtime shall be validated through:

```text
Generate target
→ Build
→ Launch
→ Render known state
→ Capture
→ Compare with canonical render
→ Report differences
```

Successful compilation alone is insufficient.

---

## 79. Browser Compatibility

Applicable exports shall support:

- Modern Chromium
- Modern Safari
- Modern Firefox
- Desktop
- Tablet
- Mobile
- High-density displays
- Portrait
- Landscape

Target-specific limitations shall be reported.

---

## 80. Accessibility

Animation and rendering shall support:

- Reduced motion
- Keyboard interaction
- Focus visibility
- Semantic content
- Non-WebGL fallback
- Pausable motion where appropriate
- Avoidance of harmful flashing
- Accessible timing controls where required

---

## 81. MCP Animation Domains

MCP animation operations shall include:

```text
animation.create_timeline
animation.create_track
animation.add_keyframe
animation.update_keyframe
animation.remove_keyframe
animation.set_easing
animation.set_trigger
animation.bind_timeline
animation.preview
animation.bake
animation.validate
```

---

## 82. MCP Rendering Domains

MCP rendering operations shall include:

```text
render.preview
render.render_frame
render.render_region
render.render_layer
render.render_sequence
render.render_turntable
render.render_camera_shot
render.render_validation_pass
render.inspect_performance
render.cancel
```

---

## 83. Command Compatibility

Animation and rendering changes shall use commands such as:

```text
timeline.create
timeline.update
timeline.delete
timeline.add_track
timeline.add_keyframe
timeline.update_keyframe
timeline.bind_trigger
camera.create_path
camera.add_keyframes
light.add_keyframes
material.add_keyframes
render.create_profile
```

Render jobs shall not mutate the document except through explicit result-attachment commands.

---

## 84. Render Job Model

Render jobs shall include:

- Job ID
- Project ID
- Document version
- Render mode
- Timeline
- Frame range
- Viewport
- Camera
- Quality profile
- Seed
- Output format
- Passes
- Resource limits
- Progress
- Result manifest

---

## 85. Caching

The system may cache:

- Runtime projections
- Layout calculations
- Font shaping
- Compiled shaders
- Texture uploads
- Model parsing
- Animation evaluation
- Static layers
- Render outputs

Cache keys shall include every output-affecting parameter.

---

## 86. Observability

The rendering system shall record:

- Render duration
- Frame duration
- GPU time
- CPU time
- Draw calls
- Triangle count
- Texture memory
- Asset load times
- Shader compile times
- Animation evaluation time
- Cache hit rate
- Failure details

---

## 87. Testing Requirements

Testing shall include:

- Timeline evaluation tests
- Keyframe interpolation tests
- Spring tests
- Time-remapping tests
- Nested timeline tests
- Trigger tests
- Scroll tests
- Reduced-motion tests
- Camera path tests
- Multi-camera tests
- Rig animation tests
- Shader animation tests
- Deterministic render tests
- Golden-frame tests
- Browser compatibility tests
- Export adapter tests
- Performance tests
- Frame capture metadata tests
- Failure recovery tests

---

## 88. Acceptance Criteria

The animation system shall be implementation-ready when it can:

- Represent 2D and 3D animation canonically
- Create multi-track timelines
- Create nested timelines
- Support labels
- Support scroll
- Support interactions
- Support state machines
- Animate text
- Animate vectors
- Animate cameras
- Animate lighting
- Animate materials
- Animate rigs
- Animate particles
- Generate reduced-motion alternatives
- Export through runtime adapters

The rendering system shall be implementation-ready when it can:

- Render hybrid 2D compositions
- Render 3D scenes
- Render deterministic frames
- Render regions
- Render layers
- Render timelines
- Render camera sequences
- Render turntables
- Generate validation passes
- Produce frame metadata
- Apply performance profiles
- Validate exported runtimes
- Report unsupported behaviour

---

## 89. Final Animation and Rendering Statement

Phase 10 implements the renderer-independent foundation in `packages/animation-core`: immutable versioned timelines,
tracks, clips, keyframes, markers, triggers, events, state machines, named and custom easing, structured interpolation,
fixed-time and normalized-progress evaluation, reduced-motion selection, and structured diagnostics. Scene Runtime
evaluates these records after responsive resolution and before Render Graph construction. The inactive in-memory
animation worker performs validation and fixed-time evaluation only.

Nested timelines, time remapping, cross-track blending, sampled custom curves, continuous playback, physics, browser
adapters, and exporter-specific animation runtimes remain deferred to their roadmap phases.

### Phase 11 Motion Reconstruction Implementation

Phase 11 adds `packages/motion-reconstruction` as a deterministic analysis and proposal layer above Animation Core.
An immutable `MotionTask` identifies source video or image-sequence assets, target nodes or cameras, requested
properties, confidence and keyframe tolerances, physical delta limits, and an explicit create, update, or delete
command intent. The task never owns document state.

Frame acquisition is replaceable through `MotionFrameProvider`. The current deterministic provider accepts canonical
frame observations and does not decode media. FFmpeg, OpenCV, MediaPipe, and Blender remain future adapters. Analysis
separates object-property tracks from camera classification, including pan, orbit, dolly, zoom, crane, and static
motion. Every detected track and camera classification retains confidence, source-frame indexes, evidence, and
structured diagnostics.

Keyframe detection preserves starts, ends, stops, direction changes, speed changes, and visibility changes. A
timeline proposal compiles that evidence into Phase 10 tracks and keyframes with canonical property paths and
library-independent easing. The proposal carries exactly one deterministic `timeline.create`, `timeline.update`, or
`timeline.delete` command. Motion Reconstruction never executes that command or mutates the Canonical Design
Document.

Validation reports missing frames, invalid timing, missing targets, broken tracks, unsupported paths, physically
implausible interpolation, invalid canonical timelines, and command-plan mismatches. Motion reports include fixed-time
Animation Core evaluations at the start, midpoint, and end, proving runtime compatibility without playback. The
inactive `apps/motion-reconstruction-worker` only validates and composes an in-memory job; it has no service listener
or Railway activation.

Media decoding, pixel-derived tracking, scene-cut inference, occlusion recovery, rendered-video comparison, optical
flow, character landmarks, contact detection, retargeting, foot locking, motion generation, video rendering, browser
playback, and Blender animation remain outside Phase 11.

Animation and rendering form the execution layer of the AEVUM AI Reconstruction Engine.

They shall convert the Canonical Design Document into accurate, editable, interactive, deterministic, and exportable 2D and 3D experiences while preserving structured motion, responsive behaviour, accessibility, validation compatibility, and performance-aware delivery.

---

## 90. Phase 14 Camera Animation And 3D Render Plans

Scene Runtime now recognizes canonical cameras as valid Animation Core timeline targets. Camera position, quaternion or
rotation, target, field of view, and other canonical camera property paths are resolved at an explicit timeline time
before a 3D Render Plan is created. Reduced-motion evaluation uses Animation Core policy and resolves disabled motion
to its deterministic terminal composition or a declared alternate timeline.

`project3DScene()` derives immutable runtime scenes, nodes, primitive records, materials, cameras, lights, local and
world bounds, visibility, responsive active-camera selection, viewport quality, animation values, diagnostics, and a
projection fingerprint. `create3DRenderPlan()` emits ordered `SCENE_BEGIN`, `CAMERA_BIND`, `LIGHT_BIND`,
`NODE_TRANSFORM`, `MESH_BIND`, `MATERIAL_BIND`, `DRAW_PRIMITIVE`, and `SCENE_END` operations.

The plan is an execution contract, not rendered pixels. Browser playback, GPU work, Three.js/R3F execution,
turntables, frame capture, and 3D visual comparison remain future renderer and validation work.

## 91. Phase 22 Real 2D Raster Contract

`@aevum/fidelity` executes immutable 2D Render Graphs in a pinned Playwright Chromium Canvas backend and returns
RGBA8 sRGB pixels plus renderer, graph, backend, font, image, typography, and diagnostic fingerprints. It supports
canonical paint, crop, vector, clip/mask, effect, compositing, custom-font, mixed-run, and reduced-motion metadata.
Animation evidence remains separately scored at explicit times; the backend does not implement browser playback.
