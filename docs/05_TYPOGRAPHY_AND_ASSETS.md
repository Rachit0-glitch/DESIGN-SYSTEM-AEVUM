# AEVUM AI Reconstruction Engine — Typography and Assets

## 1. Purpose

This document defines the typography and asset systems of the AEVUM AI Reconstruction Engine.

It is authoritative for:

- Font ingestion
- Font analysis
- Font matching
- Glyph measurement
- Text shaping
- Typography reconstruction
- Text-to-vector conversion
- Image ingestion
- Asset preservation
- Asset derivatives
- Segmentation
- Masking
- Vectorization
- Texture generation
- PBR map generation
- Asset provenance
- Licensing metadata
- Optimization
- Responsive asset variants
- Export preparation
- Typography and asset validation

This document must remain consistent with:

- `00_PROJECT_CONTEXT.md`
- `01_PRODUCT_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`
- `03_DESIGN_DOCUMENT_MODEL.md`
- `04_RECONSTRUCTION_PIPELINE.md`

The typography and asset systems shall preserve maximum editability, visual accuracy, traceability, and compatibility with the Canonical Design Document.

---

## 2. Core Principles

The typography and asset systems shall follow these principles:

1. Typography is a core fidelity system.
2. Font certainty must be reported honestly.
3. Original assets are immutable.
4. Every derivative remains traceable to its source.
5. Complex assets shall not be simplified into crude approximations.
6. Native editable representations are preferred where practical.
7. Raster fallbacks are allowed only when required and must be reported.
8. Asset metadata shall remain renderer-independent.
9. Typography shall remain compatible with responsive layout and animation.
10. Asset processing shall support both 2D and 3D workflows.
11. Master and delivery variants shall remain separate.
12. All processing must be reproducible or preserve the exact produced derivative.
13. Licensing and provenance must remain inspectable.
14. Exporters shall receive explicit compatibility and fallback metadata.
15. Validation shall measure rendered results, not only configuration values.

---

## 3. Typography System Scope

The typography system shall support:

- Native text
- Rich text
- Mixed-font text
- Per-character styling
- Multiline text
- Paragraph text
- Text on path
- Curved text
- Perspective text
- Distorted text
- Outlined text
- Gradient text
- Stroke text
- Masked text
- Animated text
- Variable font animation
- Text-to-vector conversion
- Responsive typography
- International text shaping
- Right-to-left text
- Font fallback chains
- Export-specific typography mappings

---

## 4. Supported Font Formats

The system shall support:

- WOFF2
- WOFF
- TTF
- OTF
- Variable fonts

Optional future support may include:

- TTC
- Type 1 conversion
- COLR/CPAL color fonts
- SVG-in-OpenType
- Bitmap color fonts

Unsupported formats shall be reported explicitly.

---

## 5. Font Asset Record

Each font shall be registered as an Asset Record.

Required metadata shall include:

- Stable asset ID
- Original filename
- Font family
- Subfamily
- Full font name
- PostScript name
- Weight
- Width
- Style
- Variable axes
- Supported glyph ranges
- Unicode coverage
- OpenType features
- License metadata
- Content hash
- Source provenance
- File format
- File size
- Validation status
- Embedding permissions
- Export restrictions

The original font file shall remain immutable.

---

## 6. Font Ingestion Pipeline

The font ingestion pipeline shall:

```text
Receive font
→ Validate file signature
→ Parse font metadata
→ Extract family and style data
→ Extract variable axes
→ Extract glyph coverage
→ Extract OpenType features
→ Check embedding permissions
→ Generate preview samples
→ Register font asset
→ Cache measurement data
```

The system shall reject corrupt or unsafe files.

---

## 7. Font Match Classification

Every reconstructed font assignment shall use one of:

```text
EXACT
LIKELY_MATCH
CLOSE_SUBSTITUTE
UNKNOWN
OUTLINED_FROM_REFERENCE
```

### EXACT

Use only when:

- The original font file is available, or
- The exact font identity is verifiable and the corresponding font asset is available

### LIKELY_MATCH

Use when:

- Glyph structure strongly matches
- Metrics are highly similar
- Identity is probable but not fully verifiable

### CLOSE_SUBSTITUTE

Use when:

- The font differs
- The substitute preserves similar structure and metrics
- Additional corrections are required

### UNKNOWN

Use when:

- No reliable identity can be established

### OUTLINED_FROM_REFERENCE

Use when:

- Text has been reconstructed as vector outlines
- Native text editability is not preserved

The engine shall never label a substitute as `EXACT`.

---

## 8. Font Matching Pipeline

Font matching shall follow:

```text
Detect text region
→ Recognize characters
→ Measure reference glyphs
→ Extract structural features
→ Search available fonts
→ Render candidate samples
→ Compare candidate renders
→ Rank candidates
→ Select candidate
→ Apply typography corrections
→ Validate full text block
```

Matching shall compare:

- Glyph silhouette
- Character width
- Word width
- Cap height
- X-height
- Ascender height
- Descender depth
- Stroke contrast
- Serif structure
- Terminal shape
- Curvature
- Aperture
- Slant
- Numeral style
- Punctuation style
- Ligatures
- Line wrapping
- Total text block dimensions

---

## 9. Typography Measurement

The system shall measure:

- Glyph advance width
- Glyph bounding box
- Kerning pairs
- Word width
- Line width
- Line height
- Baseline position
- Cap height
- X-height
- Ascender
- Descender
- Paragraph height
- Text block width
- Text block height
- Optical alignment
- Line-break positions

Measurements shall be performed using the actual render environment used for validation.

---

## 10. Text Shaping

The typography system shall support professional text shaping.

It shall account for:

- Kerning
- Ligatures
- Contextual alternates
- Stylistic alternates
- Script shaping
- Combining marks
- Bidirectional text
- Right-to-left scripts
- Language-specific forms
- Variable font axes
- OpenType feature selection

Text shaping shall remain deterministic for pinned font and runtime versions.

---

## 11. Typography Properties

Supported properties shall include:

- Font family
- Font asset ID
- Weight
- Width
- Stretch
- Italic
- Oblique angle
- Size
- Line height
- Letter spacing
- Word spacing
- Kerning
- Ligatures
- Baseline shift
- Paragraph spacing
- First-line indent
- Hanging indent
- Alignment
- Direction
- Text transformation
- Variable font axes
- OpenType features
- Stylistic alternates
- Swashes
- Small caps
- Tabular numbers
- Per-character opacity
- Per-character transform
- Per-character fill
- Per-character stroke
- Per-character effect

---

## 12. Mixed Typography

A Text Node may contain multiple Text Runs.

Each run may use:

- Different font
- Different size
- Different weight
- Different width
- Different style
- Different fill
- Different stroke
- Different effect
- Different variable-axis values

Run boundaries shall preserve original character indexes.

---

## 13. Responsive Typography

Typography shall support breakpoint-specific overrides for:

- Font size
- Line height
- Letter spacing
- Word spacing
- Width
- Weight
- Alignment
- Number of lines
- Truncation
- Text box dimensions
- Text path
- Animation
- Font substitution where required

Responsive typography shall prioritize:

- Readability
- Hierarchy
- Reference fidelity
- Layout stability
- Accessibility

---

## 14. Text Box Behaviour

Text boxes shall support:

- Fixed width
- Auto width
- Fixed height
- Auto height
- Hug content
- Fill container
- Minimum width
- Maximum width
- Minimum height
- Maximum height
- Overflow clipping
- Ellipsis
- Multiline wrapping
- No wrapping
- Vertical alignment

---

## 15. Text on Path

Text-on-path shall preserve:

- Path reference
- Start offset
- Direction
- Alignment
- Baseline offset
- Character rotation
- Path deformation
- Responsive path changes

Exporters shall report unsupported mappings.

---

## 16. Text Perspective and Distortion

The system shall support:

- Perspective projection
- Skew
- Envelope distortion
- Mesh warp
- Arc warp
- Custom deformation

Native text shall be preserved when practical.

When deformation cannot remain editable, the engine may:

- Use SVG text
- Use per-character transforms
- Convert to vector outlines
- Use raster fallback

The chosen representation shall be reported.

---

## 17. Text-to-Vector Conversion

Text-to-vector conversion shall preserve:

- Glyph outlines
- Character positions
- Kerning
- Line breaks
- Fill
- Stroke
- Effects where practical
- Original text content metadata
- Original font identity
- Reversibility metadata where possible

Outlined text shall be labeled `OUTLINED_FROM_REFERENCE`.

---

## 18. Typography Animation

The system shall support animation of:

- Position
- Rotation
- Scale
- Opacity
- Blur
- Fill
- Stroke
- Letter spacing
- Word spacing
- Line height
- Variable font axes
- Per-character transforms
- Mask reveal
- Split-text motion
- Stroke drawing
- Text-on-path offset

Animation shall use the canonical Timeline system.

---

## 19. Typography Validation

Typography validation shall compare:

- Font identity status
- Glyph silhouette
- Word width
- Line width
- Line breaks
- Baseline
- Line height
- Tracking
- Kerning
- Paragraph spacing
- Alignment
- Weight
- Width
- Slant
- Text block dimensions
- Fill
- Stroke
- Effects

Validation shall support:

- Whole text-block scoring
- Line-level scoring
- Word-level scoring
- Character-level scoring
- Baseline-only inspection
- Typography-only render mode

---

## 20. Typography Fallback Policy

Fallbacks may include:

- Closest substitute
- Font stack
- Width correction
- Letter-spacing correction
- Scale correction
- Text outline conversion
- SVG representation
- Raster fallback

Every fallback shall be recorded in:

- Node metadata
- Export capability report
- Validation report

---

## 21. Typography Export Requirements

Typography exporters shall preserve:

- Semantic text where possible
- Editable content
- Responsive sizing
- Font loading
- Variable font axes
- OpenType features
- Accessibility
- Animation
- Line breaks

Supported target mappings may include:

- CSS font-face
- Web fonts
- Local font assets
- SVG text
- Vector outlines
- Canva-native text
- Lottie text
- Rive text
- Rasterized fallback

---

## 22. Asset System Scope

The asset system shall manage:

- Images
- Videos
- Audio
- Fonts
- SVGs
- Vectors
- 3D models
- Geometry
- Textures
- HDRIs
- Animation files
- Simulation bakes
- Shaders
- Documents
- Archives
- Render outputs
- Difference maps
- Export artifacts
- Generic binary source assets

---

## 23. Asset Immutability

Original assets shall be immutable.

Processing shall create derivatives.

The system shall never overwrite:

- Original images
- Original videos
- Original fonts
- Original models
- Original textures
- Original HDRIs
- Original motion references

Every derivative shall reference:

- Source asset ID
- Transformation
- Tool or provider
- Tool version
- Parameters
- Seed where applicable
- Creation time
- Actor
- Validation status

---

## 24. Asset Identity

Each asset shall include:

- Stable asset ID
- Content hash
- MIME type
- Byte size
- Dimensions
- Duration where applicable
- Frame rate where applicable
- Color space
- Source filename
- Source URI
- Project ownership
- Provenance
- License
- Derivatives
- Processing history
- Validation status

---

## 25. Asset Ingestion Pipeline

```text
Receive asset
→ Validate file type
→ Verify file signature
→ Compute content hash
→ Extract metadata
→ Detect duplicates
→ Register original
→ Generate preview
→ Generate analysis derivatives
→ Mark validation status
```

Unsafe or corrupt files shall be isolated.

---

## 26. Duplicate Detection

Duplicate detection shall use:

- Exact content hash
- Perceptual image hash
- Video fingerprint
- Audio fingerprint
- Geometry similarity
- Texture similarity
- Font metadata and hash

The system shall distinguish:

- Exact duplicate
- Visually near duplicate
- Derived variant
- Cropped variant
- Recompressed variant
- Color-adjusted variant

---

## 27. Image Processing

Supported operations shall include:

- Cropping
- Resizing
- Rotation
- Perspective correction
- Color conversion
- Relighting
- Color replacement
- Denoising
- Sharpening
- Upscaling
- Deblurring
- Compression artifact reduction
- Texture recovery
- Background removal
- Object extraction
- Object removal
- Generative fill through connected providers
- Shadow extraction
- Reflection extraction
- Glow extraction
- Alpha reconstruction

---

## 28. Segmentation

Segmentation shall support:

- Subject masks
- Object masks
- Region masks
- Material masks
- Hair masks
- Transparent-object masks
- Shadow masks
- Reflection masks
- Background masks
- Foreground masks

Masks shall include:

- Resolution
- Feathering
- Confidence
- Source region
- Tool metadata
- Refinement history

---

## 29. Mask Quality

Mask validation shall inspect:

- Edge accuracy
- Haloing
- Missing regions
- False-positive regions
- Transparency quality
- Hair detail
- Soft-edge transitions
- Shadow preservation
- Reflection preservation

Masks shall remain editable assets.

---

## 30. Background Removal

Background removal shall preserve:

- Subject edges
- Fine hair
- Semi-transparent areas
- Motion blur
- Glass
- Reflections
- Contact shadows where requested

The system shall optionally create:

- Clean subject layer
- Separate shadow layer
- Separate reflection layer
- Background plate
- Alpha matte

---

## 31. Object Extraction

Object extraction shall create independent assets for:

- Main subjects
- Foreground objects
- Background objects
- Decorative elements
- Logos
- Icons
- Product parts
- Character parts
- Props
- Shadows
- Glows

Each extracted object shall preserve source coordinates and region links.

---

## 32. Object Removal and Fill

Object removal shall support:

- Content-aware fill
- Generative fill through connected providers
- Texture continuation
- Pattern continuation
- Background reconstruction

Generated fill shall be treated as a derivative and include:

- Provider
- Model
- Prompt metadata
- Seed
- Source mask
- Validation result

---

## 33. Perspective Correction

Perspective correction shall support:

- Planar rectification
- Document correction
- Product face correction
- UI screen correction
- Texture extraction
- Material reference extraction
- Camera-aware reprojection

The original perspective shall remain available.

---

## 34. Responsive Image Crops

The system shall generate responsive crops for:

- Desktop
- Tablet
- Mobile
- Portrait
- Landscape
- Social formats
- Canva pages
- Static fallbacks

Crop metadata shall include:

- Focal point
- Safe area
- Subject bounds
- Crop rectangle
- Aspect ratio
- Breakpoint
- Validation score

---

## 35. Image Optimization

The system shall support:

- WebP
- AVIF
- PNG
- JPEG
- SVG
- Source preservation
- Responsive dimensions
- Quality profiles
- Progressive loading
- Placeholder generation
- Blur-up previews
- Alpha-aware optimization

Optimization shall not replace the master asset.

---

## 36. Vectorization

Image vectorization shall support:

- Logo tracing
- Icon tracing
- Shape tracing
- Flat illustration tracing
- Line art tracing
- Text outline recovery
- Color-region tracing
- Gradient-region approximation

Vectorization shall preserve:

- Path hierarchy
- Fill colors
- Strokes
- Compound paths
- Reusable symbols

The system shall avoid excessive path-node counts.

---

## 37. Depth Map Generation

Depth maps may be generated from:

- Single images
- Stereo references
- Multi-view references
- Existing 3D models

Depth maps may support:

- Parallax
- Relighting
- 2.5D animation
- Camera movement
- Segmentation
- 3D reconstruction
- Depth-aware effects

Depth maps shall include scale and confidence metadata.

---

## 38. Normal and Height Maps

The system shall generate:

- Normal maps
- Height maps
- Displacement maps
- Ambient occlusion maps

Generation may use:

- Image analysis
- Multi-view reconstruction
- Geometry baking
- Procedural synthesis

Map orientation and tangent-space conventions shall be explicit.

---

## 39. PBR Map Generation

The asset system shall support generation or extraction of:

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

Each map shall preserve:

- Channel purpose
- Color space
- Resolution
- Bit depth
- UV set
- Source asset
- Generation method
- Validation status

---

## 40. Texture Processing

Texture processing shall support:

- Seam correction
- Tiling
- De-lighting
- Color normalization
- PBR separation
- Upscaling
- Denoising
- Detail enhancement
- Channel packing
- Texture atlasing
- KTX2 compression
- Resolution variants
- UDIM handling
- Mipmap generation

---

## 41. Texture Provenance

Texture assets shall preserve:

- Source references
- Material assignment
- Projection method
- Generation provider
- Baking source
- UV set
- Color space
- Channel
- Resolution
- Processing history

---

## 42. 3D Model Assets

3D model assets shall include metadata for:

- File format
- Units
- Real-world scale
- Coordinate system
- Up axis
- Handedness
- Mesh count
- Polygon count
- Triangle count
- Materials
- Textures
- Skeletons
- Animations
- Morph targets
- Cameras
- Lights
- Bounding box
- LODs
- Compression
- Validation

---

## 43. Geometry Derivatives

Model derivatives may include:

- Retopologized mesh
- Decimated mesh
- Remeshed mesh
- Collision mesh
- LODs
- Web-optimized mesh
- Mobile mesh
- Canva render
- Static fallback
- Baked simulation
- Baked animation

The high-resolution master shall remain preserved.

---

## 44. HDRI Assets

HDRI assets shall store:

- Resolution
- Dynamic range
- Color space
- Exposure reference
- Orientation
- Rotation
- Lighting role
- Reflection role
- Background visibility
- Optimization variants

---

## 45. Video Assets

Video metadata shall include:

- Duration
- Frame rate
- Codec
- Resolution
- Color space
- Audio tracks
- Alpha support
- Keyframes
- Motion-analysis derivatives
- Poster frame
- Responsive versions
- Export versions

Video derivatives may include:

- Proxy
- Web-optimized version
- Alpha-capable version
- Frame sequence
- Motion-analysis sequence
- Thumbnail
- Poster
- Canva-compatible version

---

## 46. Audio Assets

Audio metadata shall include:

- Duration
- Sample rate
- Channels
- Codec
- Loudness
- Loop points
- Beat markers
- Speech markers
- Animation-sync markers

---

## 47. Shader Assets

Shader assets shall include:

- Source
- Language
- Version
- Uniform schema
- Required textures
- Required extensions
- Validation status
- Security status
- Runtime compatibility
- Export compatibility
- Fallback

Shaders shall be validated and sandboxed.

---

## 48. Asset Processing Jobs

Long-running asset processing shall use the Job System.

Examples:

- Upscaling
- Video conversion
- Segmentation
- Background removal
- Texture generation
- Model optimization
- Texture baking
- PBR map generation
- HDRI conversion
- Vectorization
- Duplicate analysis

Jobs shall support:

- Progress
- Cancellation
- Retry
- Checkpointing
- Output manifests
- Failure details

---

## 49. Asset Provider Adapters

External providers may be used for:

- Generative fill
- Segmentation
- Upscaling
- Texture generation
- Image generation
- 3D generation
- Relighting
- Video enhancement

Provider outputs shall be:

- Registered as derivatives
- Versioned
- Validated
- Traceable
- Replaceable

No provider shall own canonical project state.

---

## 50. Licensing Metadata

Every asset should support:

- License type
- Copyright owner
- Source URL
- Usage restrictions
- Commercial-use status
- Attribution requirements
- Redistribution restrictions
- Modification permissions
- Embedding permissions
- Expiration where applicable

The system shall not silently strip licensing data.

---

## 51. Font Licensing

Font licensing metadata shall include:

- Desktop use
- Web embedding
- Application embedding
- Canva use
- Client delivery
- Redistribution
- Outline conversion
- Commercial use

Exporters shall report license conflicts.

---

## 52. Asset Security

The asset system shall validate:

- File signatures
- MIME type
- Archive contents
- SVG safety
- Shader safety
- External URLs
- Path traversal
- Embedded scripts
- Suspicious metadata
- Oversized files
- Decompression bombs

Unsafe assets shall be quarantined.

---

## 53. Color Management

Asset processing shall preserve explicit color spaces.

The system shall support:

- sRGB
- Linear sRGB
- Display P3
- ACEScg
- Rec.709
- Rec.2020

Conversions shall be recorded.

Validation shall compare within a controlled color pipeline.

---

## 54. Alpha and Transparency

The system shall preserve:

- Straight alpha
- Premultiplied alpha
- Binary alpha
- Semi-transparency
- Additive effects
- Glass transparency
- Soft masks

Alpha conventions shall be explicit during export.

---

## 55. Asset Validation

Asset validation shall include:

- File integrity
- Resolution
- Dimensions
- Color space
- Alpha
- Compression quality
- Edge quality
- Mask quality
- Duplicate status
- License status
- Export compatibility
- Performance cost
- Missing dependencies

---

## 56. Texture Validation

Texture validation shall include:

- Channel correctness
- Color-space correctness
- Seam quality
- UV alignment
- Resolution
- Bit depth
- Tiling
- Compression artifacts
- Normal orientation
- PBR plausibility

---

## 57. Model Asset Validation

Model validation shall include:

- File integrity
- Units
- Scale
- Orientation
- Normals
- Tangents
- UVs
- Material links
- Texture links
- Skeleton integrity
- Animation integrity
- Morph targets
- LOD availability
- Triangle count
- Draw calls
- Compression status

---

## 58. Asset Selection Logic

When multiple variants exist, the system shall select based on:

- Target exporter
- Viewport
- Quality mode
- Device profile
- Performance budget
- Accessibility
- Editability
- Color space
- Animation requirement

The selection shall be deterministic for pinned inputs.

---

## 59. Master and Delivery Profiles

Asset profiles shall include:

### Master

- Highest quality
- Original resolution
- Original geometry
- Full metadata

### Authoring

- Fast enough for editing
- High visual quality
- Inspectable

### Validation

- Deterministic
- Pinned
- Reproducible

### Web

- Optimized
- Compressed
- Progressive

### Mobile

- Reduced resolution
- Reduced geometry
- Reduced memory

### Canva

- Platform-compatible
- Editability-focused
- Layer-separated where possible

### Fallback

- Static image or video
- Widely compatible

---

## 60. Asset Export Manifest

Every export shall include an Asset Manifest.

The manifest shall list:

- Asset ID
- Output path
- Source asset ID
- Variant purpose
- MIME type
- Dimensions
- Compression
- Hash
- License status
- Fallback role
- Consumer mapping

---

## 61. Canva Asset Strategy

For Canva Export:

- Text should remain native where supported.
- Vectors should remain editable where supported.
- Images should remain separate layers.
- Shadows should remain separate where practical.
- Glows should remain separate where practical.
- 3D renders may become image or video layers.
- Unsupported effects may be flattened.
- Multiple camera renders may become pages.

The export shall report editability percentages.

---

## 62. Code Export Asset Strategy

Code exporters shall support:

- Local asset bundling
- Public asset folders
- Imported module assets
- Responsive source sets
- Lazy loading
- Progressive loading
- Font-face generation
- Texture compression
- Model compression
- Static fallbacks
- Asset preload hints

---

## 63. Asset Cache Strategy

Caches may include:

- Font metadata
- Glyph metrics
- Thumbnails
- Segmentation masks
- Responsive crops
- Optimized image variants
- Texture conversions
- Model analyses
- Model optimizations
- Perceptual hashes
- Validation results

Cache keys shall include all output-affecting parameters.

---

## 64. Asset Cleanup

Temporary files shall have lifecycle policies.

Cleanup shall never remove:

- Original assets
- Referenced derivatives
- Historical export artifacts
- Validation baselines
- Assets referenced by historical document versions

Unused temporary derivatives may be garbage-collected after reference checks.

---

## 65. MCP Typography Domains

MCP typography operations shall include domains such as:

```text
typography.import_font
typography.inspect_font
typography.match_font
typography.measure_text
typography.set_style
typography.update_run
typography.convert_to_vector
typography.validate
```

All operations shall use typed schemas.

---

## 66. MCP Asset Domains

MCP asset operations shall include:

```text
assets.import
assets.inspect
assets.segment
assets.remove_background
assets.extract_object
assets.generate_mask
assets.generate_depth
assets.generate_normal
assets.generate_pbr_maps
assets.vectorize
assets.optimize
assets.create_responsive_variants
assets.validate
```

External provider use shall be explicit in results.

---

## 67. Command Compatibility

Typography and asset mutations shall use commands.

Examples:

```text
asset.register
asset.create_derivative
asset.attach_license
text.update_content
text.update_run
text.assign_font
text.convert_to_vector
image.set_crop
image.assign_mask
material.assign_texture
```

Direct uncontrolled mutation is prohibited.

---

## 68. Determinism

Typography and asset outputs shall pin:

- Font file hash
- Font parser version
- Shaping engine version
- Processing tool version
- Provider version
- Seed
- Color profile
- Output resolution
- Compression settings
- Transformation parameters

Non-deterministic results shall be preserved exactly as generated.

---

## 69. Testing Requirements

Testing shall include:

- Font parsing tests
- Variable font tests
- Glyph measurement tests
- Line-break tests
- RTL tests
- Text shaping tests
- Font classification tests
- Text-to-vector tests
- Segmentation tests
- Background-removal tests
- Mask-quality tests
- Image optimization tests
- Vectorization tests
- PBR map tests
- Model metadata tests
- Asset provenance tests
- License metadata tests
- Export asset tests
- Regression tests

---

## 70. Acceptance Criteria

The typography system shall be implementation-ready when it can:

- Ingest supported fonts
- Extract metadata
- Shape text
- Measure glyphs
- Match fonts honestly
- Support mixed styles
- Support variable fonts
- Support responsive typography
- Animate typography
- Validate rendered typography
- Export native text where possible
- Report fallbacks

The asset system shall be implementation-ready when it can:

- Ingest supported assets
- Preserve originals
- Generate derivatives
- Track provenance
- Segment images
- Remove backgrounds
- Extract objects
- Generate masks
- Generate depth and PBR maps
- Optimize images
- Validate textures
- Register 3D model metadata
- Create delivery variants
- Support Canva and code export
- Report licensing and compatibility issues

---

## 71. Final Typography and Asset Statement

Typography and assets are core fidelity systems within the AEVUM AI Reconstruction Engine.

They shall preserve visual accuracy, structured editability, provenance, licensing, responsive behaviour, animation compatibility, and export readiness while remaining fully integrated with the Canonical Design Document, Reconstruction Pipeline, Visual Validation, and Multi-Stack Export systems.

## 72. Phase 22 Font And Asset Fidelity

The raster backend resolves registered font and image bytes through a bounded adapter, loads custom fonts with
`FontFace`, shapes mixed canonical runs through browser Canvas text APIs, and records line widths and baselines.
Missing font assets and browser fallback are blocking diagnostics. Image identity and visible crop are measured
separately; content hashes and resolver provenance remain part of reproducibility evidence.
