import type { AssetRecord, TextStyle } from "@aevum/document-model";
import type { ReconstructionAdapters, ReconstructionAnalysisContext, ReconstructionAssetResolver } from "./adapters.js";
import { confidence, createConfidenceSummary } from "./confidence.js";
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { deterministicScopedId, fingerprint, stableStringify } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  RECONSTRUCTION_ANALYSIS_VERSION,
  RECONSTRUCTION_MANIFEST_KEY,
  AssetCandidateSchema,
  ComponentCandidateSchema,
  DetectedRegionSchema,
  LayoutCandidateSchema,
  ReconstructionConfigurationSchema,
  ReconstructionManifestSchema,
  ReconstructionProvenanceSchema,
  ReferenceAnalysisSchema,
  ShapeCandidateSchema,
  TextCandidateSchema,
  TokenCandidateSchema,
  type DetectedRegion,
  type ReconstructionConfiguration,
  type ReconstructionDiagnostic,
  type ReconstructionManifest,
  type ReconstructionManifestRegion,
  type ReconstructionProvenance,
  type ReconstructionTask,
  type ReferenceAnalysis,
  type ReferenceBounds,
} from "./schemas.js";

const ANALYZER_ID = "aevum.deterministic-manifest";
const ANALYZER_VERSION = "1.0.0";
const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);

export type ReferenceAnalysisResult =
  | { readonly success: true; readonly analysis: ReferenceAnalysis }
  | { readonly success: false; readonly diagnostics: readonly ReconstructionDiagnostic[] };

function sourceBounds(
  raw: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  sourceWidth: number,
  sourceHeight: number,
): ReferenceBounds {
  if (raw.x + raw.width > sourceWidth || raw.y + raw.height > sourceHeight) {
    throw new RangeError("Region bounds exceed source dimensions.");
  }
  return {
    ...raw,
    unit: "SOURCE_PIXEL",
    normalized: {
      x: raw.x / sourceWidth,
      y: raw.y / sourceHeight,
      width: raw.width / sourceWidth,
      height: raw.height / sourceHeight,
    },
  };
}

function regionId(task: ReconstructionTask, hash: string, region: ReconstructionManifestRegion, index: number): string {
  return deterministicScopedId("region", {
    taskId: task.id,
    sourceHash: hash,
    category: region.category,
    coordinates: region.bounds,
    detectionIndex: index,
  });
}

function provenance(
  context: ReconstructionAnalysisContext,
  region: Pick<DetectedRegion, "id" | "bounds"> | undefined,
  score: number,
): ReconstructionProvenance {
  return ReconstructionProvenanceSchema.parse({
    sourceAssetId: context.source.asset.id,
    ...(context.task.sourceReferenceId ? { sourceReferenceId: context.task.sourceReferenceId } : {}),
    ...(region ? { sourceRegionId: region.id, sourceBounds: region.bounds } : {}),
    analyzerId: ANALYZER_ID,
    analyzerVersion: ANALYZER_VERSION,
    parameters: { mode: "DETERMINISTIC_MANIFEST", manifestPresent: context.manifest !== undefined },
    deterministicSeed: context.task.deterministicSeed,
    confidence: score,
    humanOverride: false,
  });
}

function defaultTextStyle(region: ReconstructionManifestRegion): TextStyle {
  const text = region.text;
  return {
    fontFamily: text?.fontFamily ?? "AEVUM Unknown",
    fallbackFamilies: ["Arial", "sans-serif"],
    fontMatchStatus: "UNKNOWN",
    size: { value: text?.fontSize ?? 16, unit: "PX", mode: "FIXED" },
    lineHeight: { multiplier: 1.4 },
    letterSpacing: { value: 0, unit: "PX", mode: "FIXED" },
    weight: text?.fontWeight ?? 400,
    style: "NORMAL",
    variableAxes: {},
    openTypeFeatures: {},
  };
}

function manifestFor(asset: AssetRecord): ReconstructionManifest | undefined {
  const raw = asset.metadata[RECONSTRUCTION_MANIFEST_KEY];
  return raw === undefined ? undefined : ReconstructionManifestSchema.parse(raw);
}

function fallbackManifest(width: number, height: number): ReconstructionManifest {
  return ReconstructionManifestSchema.parse({
    manifestVersion: "1.0.0",
    referenceType: "STATIC_2D",
    regions: [
      {
        key: "page",
        category: "PAGE",
        bounds: { x: 0, y: 0, width, height },
        confidence: 0.5,
        semanticHints: ["unannotated-reference"],
        layout: { type: "ABSOLUTE", confidence: 0.5 },
      },
      {
        key: "full-reference-fallback",
        category: "IMAGE",
        parentKey: "page",
        bounds: { x: 0, y: 0, width, height },
        confidence: 0.25,
        semanticHints: ["full-reference-raster-fallback"],
        image: { fit: "COVER", extracted: false },
      },
    ],
  });
}

export function createDeterministicMvpAdapters(): ReconstructionAdapters {
  const regions = {
    id: `${ANALYZER_ID}.regions`,
    version: ANALYZER_VERSION,
    detect(context: ReconstructionAnalysisContext) {
      return context.manifest?.regions ?? [];
    },
  };
  return Object.freeze({
    regions,
    text: {
      id: `${ANALYZER_ID}.text`,
      version: ANALYZER_VERSION,
      detect(context: ReconstructionAnalysisContext, detected: readonly DetectedRegion[]) {
        return detected.flatMap((region) => {
          const annotation = context.manifest?.regions[region.detectionIndex];
          if (!annotation?.text) return [];
          const unresolved = annotation.text.content === undefined;
          return [
            TextCandidateSchema.parse({
              id: deterministicScopedId("text-candidate", { taskId: context.task.id, regionId: region.id }),
              regionId: region.id,
              ...(annotation.text.content !== undefined ? { content: annotation.text.content } : {}),
              unresolved,
              style: defaultTextStyle(annotation),
              alignment: annotation.text.alignment,
              direction: annotation.text.direction,
              confidence: confidence(unresolved ? Math.min(region.confidence.score, 0.3) : region.confidence.score),
              provenance: provenance(context, region, region.confidence.score),
            }),
          ];
        });
      },
    },
    layout: {
      id: `${ANALYZER_ID}.layout`,
      version: ANALYZER_VERSION,
      infer(context: ReconstructionAnalysisContext, detected: readonly DetectedRegion[]) {
        return detected.flatMap((region) => {
          const annotation = context.manifest?.regions[region.detectionIndex];
          if (!annotation?.layout) return [];
          const padding = annotation.layout.padding;
          return [
            LayoutCandidateSchema.parse({
              id: deterministicScopedId("layout-candidate", { taskId: context.task.id, regionId: region.id }),
              regionId: region.id,
              type: annotation.layout.type,
              ...(annotation.layout.gap !== undefined ? { gap: annotation.layout.gap } : {}),
              ...(padding !== undefined
                ? { padding: { top: padding, right: padding, bottom: padding, left: padding } }
                : {}),
              ...(annotation.layout.alignment ? { alignment: annotation.layout.alignment } : {}),
              ...(annotation.layout.columns ? { columns: annotation.layout.columns } : {}),
              confidence: confidence(annotation.layout.confidence),
              evidence: [`manifest:${annotation.key}`, `children:${region.childIds.length}`],
            }),
          ];
        });
      },
    },
    assets: {
      id: `${ANALYZER_ID}.assets`,
      version: ANALYZER_VERSION,
      inspect(context: ReconstructionAnalysisContext, detected: readonly DetectedRegion[]) {
        return detected.flatMap((region) => {
          const annotation = context.manifest?.regions[region.detectionIndex];
          if (!annotation?.image) return [];
          const assetId = annotation.image.assetId ?? context.source.asset.id;
          return [
            AssetCandidateSchema.parse({
              id: deterministicScopedId("asset-candidate", { taskId: context.task.id, regionId: region.id, assetId }),
              regionId: region.id,
              assetId,
              extracted: annotation.image.extracted,
              crop: region.bounds.normalized,
              fit: annotation.image.fit,
              confidence: confidence(
                annotation.image.extracted ? region.confidence.score : Math.min(0.55, region.confidence.score),
              ),
              provenance: provenance(context, region, region.confidence.score),
            }),
          ];
        });
      },
    },
    shapes: {
      id: `${ANALYZER_ID}.shapes`,
      version: ANALYZER_VERSION,
      infer(context: ReconstructionAnalysisContext, detected: readonly DetectedRegion[]) {
        return detected.flatMap((region) => {
          const annotation = context.manifest?.regions[region.detectionIndex];
          if (!annotation?.shape) return [];
          return [
            ShapeCandidateSchema.parse({
              id: deterministicScopedId("shape-candidate", { taskId: context.task.id, regionId: region.id }),
              regionId: region.id,
              shapeType: annotation.shape.shapeType,
              geometry: annotation.shape.geometry,
              ...(annotation.shape.fill ? { fill: annotation.shape.fill } : {}),
              ...(annotation.shape.stroke ? { stroke: annotation.shape.stroke } : {}),
              ...(annotation.shape.cornerRadius !== undefined ? { cornerRadius: annotation.shape.cornerRadius } : {}),
              confidence: confidence(region.confidence.score),
              provenance: provenance(context, region, region.confidence.score),
            }),
          ];
        });
      },
    },
    components: {
      id: `${ANALYZER_ID}.components`,
      version: ANALYZER_VERSION,
      detect(context: ReconstructionAnalysisContext, detected: readonly DetectedRegion[]) {
        const grouped = new Map<string, DetectedRegion[]>();
        for (const region of detected) {
          const key = context.manifest?.regions[region.detectionIndex]?.repetitionKey;
          if (key) grouped.set(key, [...(grouped.get(key) ?? []), region]);
        }
        return [...grouped.entries()]
          .filter(([, instances]) => instances.length >= 2)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, instances]) =>
            ComponentCandidateSchema.parse({
              id: deterministicScopedId("component-candidate", { taskId: context.task.id, key }),
              proposedName: key,
              instanceRegionIds: instances.map((region) => region.id),
              similarityEvidence: [`manifest-repetition:${key}`, `instances:${instances.length}`],
              sharedStructure: [...new Set(instances.map((region) => region.category))].sort(),
              localDifferences: [],
              confidence: confidence(Math.min(...instances.map((region) => region.confidence.score))),
              applyPolicy: "SUGGEST_ONLY",
            }),
          );
      },
    },
    tokens: {
      id: `${ANALYZER_ID}.tokens`,
      version: ANALYZER_VERSION,
      infer(context: ReconstructionAnalysisContext, detected: readonly DetectedRegion[]) {
        const fills = new Map<string, DetectedRegion[]>();
        for (const region of detected) {
          const fill = context.manifest?.regions[region.detectionIndex]?.shape?.fill;
          if (fill) fills.set(stableStringify(fill), [...(fills.get(stableStringify(fill)) ?? []), region]);
        }
        return [...fills.entries()]
          .filter(([, regionsWithFill]) => regionsWithFill.length >= 2)
          .sort(([left], [right]) => left.localeCompare(right))
          .flatMap(([serialized, regionsWithFill], index) => {
            const value = JSON.parse(serialized) as unknown;
            const parsedValue = TokenCandidateSchema.shape.value.safeParse(value);
            if (!parsedValue.success) return [];
            return [
              TokenCandidateSchema.parse({
                id: deterministicScopedId("token-candidate", { taskId: context.task.id, serialized }),
                proposedName: index === 0 ? "color.surface.primary" : `color.surface.variant${index + 1}`,
                type: "COLOR",
                value: parsedValue.data,
                supportingRegionIds: regionsWithFill.map((region) => region.id),
                originalValues: regionsWithFill.map(() => value),
                confidence: confidence(Math.min(...regionsWithFill.map((region) => region.confidence.score))),
              }),
            ];
          });
      },
    },
  });
}

function validateSource(
  task: ReconstructionTask,
  resolver: ReconstructionAssetResolver,
  configuration: ReconstructionConfiguration,
):
  | {
      readonly success: true;
      readonly source: Extract<ReturnType<ReconstructionAssetResolver["resolve"]>, { kind: "READY" }>;
    }
  | { readonly success: false; readonly diagnostics: readonly ReconstructionDiagnostic[] } {
  const source = resolver.resolve(task.sourceAssetId);
  if (source.kind === "MISSING") {
    return {
      success: false,
      diagnostics: [
        diagnostic({
          code: "SOURCE_ASSET_NOT_FOUND",
          severity: "CRITICAL",
          message: `Source asset ${task.sourceAssetId} is not registered.`,
          stage: "LOAD_REFERENCE",
          entityId: task.sourceAssetId,
          recoverable: true,
        }),
      ],
    };
  }
  if (source.kind === "QUARANTINED") {
    return {
      success: false,
      diagnostics: [
        diagnostic({
          code: "SOURCE_ASSET_QUARANTINED",
          severity: "CRITICAL",
          message: `Source asset ${task.sourceAssetId} is quarantined.`,
          stage: "LOAD_REFERENCE",
          entityId: task.sourceAssetId,
          relatedIds: source.issues.map((issue) => issue.code),
          recoverable: true,
        }),
      ],
    };
  }
  if (source.kind === "INVALID") {
    return {
      success: false,
      diagnostics: [
        diagnostic({
          code: "SOURCE_METADATA_INCOMPLETE",
          severity: "CRITICAL",
          message: source.reason,
          stage: "LOAD_REFERENCE",
          entityId: task.sourceAssetId,
          recoverable: true,
        }),
      ],
    };
  }
  const diagnostics: ReconstructionDiagnostic[] = [];
  if (source.metadata.status === "QUARANTINED") {
    diagnostics.push(
      diagnostic({
        code: "SOURCE_ASSET_QUARANTINED",
        severity: "CRITICAL",
        message: `Source asset ${source.asset.id} metadata is quarantined.`,
        stage: "LOAD_REFERENCE",
        entityId: source.asset.id,
        recoverable: true,
      }),
    );
  } else if (source.metadata.status === "FAILED") {
    diagnostics.push(
      diagnostic({
        code: "SOURCE_ASSET_FAILED",
        severity: "CRITICAL",
        message: `Source asset ${source.asset.id} has failed processing.`,
        stage: "LOAD_REFERENCE",
        entityId: source.asset.id,
        recoverable: true,
      }),
    );
  } else if (["PROCESSING", "ARCHIVED"].includes(source.metadata.status)) {
    diagnostics.push(
      diagnostic({
        code: "SOURCE_ASSET_NOT_READY",
        severity: "CRITICAL",
        message: `Source asset ${source.asset.id} has status ${source.metadata.status}.`,
        stage: "LOAD_REFERENCE",
        entityId: source.asset.id,
        recoverable: true,
      }),
    );
  }
  if (!supportedMimeTypes.has(source.asset.mimeType.toLowerCase()) || source.asset.type !== "IMAGE") {
    diagnostics.push(
      diagnostic({
        code: "UNSUPPORTED_REFERENCE_TYPE",
        severity: "CRITICAL",
        message: `Phase 6 does not support ${source.asset.type}/${source.asset.mimeType} as a 2D reference.`,
        stage: "LOAD_REFERENCE",
        entityId: source.asset.id,
        recoverable: false,
      }),
    );
  }
  const dimensions = source.asset.dimensions;
  if (
    !dimensions ||
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height)
  ) {
    diagnostics.push(
      diagnostic({
        code: "SOURCE_METADATA_INCOMPLETE",
        severity: "CRITICAL",
        message: `Source asset ${source.asset.id} requires positive integer width and height metadata.`,
        stage: "LOAD_REFERENCE",
        entityId: source.asset.id,
        recoverable: true,
      }),
    );
  } else if (dimensions.width > configuration.maxSourceWidth || dimensions.height > configuration.maxSourceHeight) {
    diagnostics.push(
      diagnostic({
        code: "LIMIT_EXCEEDED",
        severity: "CRITICAL",
        message: `Source dimensions ${dimensions.width}x${dimensions.height} exceed configured limits.`,
        stage: "LOAD_REFERENCE",
        entityId: source.asset.id,
        recoverable: true,
      }),
    );
  }
  if (source.asset.byteSize > configuration.maxSourceBytes) {
    diagnostics.push(
      diagnostic({
        code: "LIMIT_EXCEEDED",
        severity: "CRITICAL",
        message: `Source asset size ${source.asset.byteSize} exceeds the configured byte limit.`,
        stage: "LOAD_REFERENCE",
        entityId: source.asset.id,
        recoverable: true,
      }),
    );
  }
  if (/^http:\/\//i.test(source.asset.source.uri) || /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(source.asset.source.uri)) {
    diagnostics.push(
      diagnostic({
        code: "SOURCE_METADATA_INCOMPLETE",
        severity: "CRITICAL",
        message: "Source URI violates reconstruction URL or path safety policy.",
        stage: "LOAD_REFERENCE",
        entityId: source.asset.id,
        recoverable: false,
      }),
    );
  }
  return diagnostics.length > 0
    ? { success: false, diagnostics: sortDiagnostics(diagnostics) }
    : { success: true, source };
}

export function analyzeReference(
  task: ReconstructionTask,
  resolver: ReconstructionAssetResolver,
  options: {
    readonly configuration?: Partial<ReconstructionConfiguration>;
    readonly adapters?: ReconstructionAdapters;
  } = {},
): ReferenceAnalysisResult {
  const configuration = ReconstructionConfigurationSchema.parse(options.configuration ?? {});
  const loaded = validateSource(task, resolver, configuration);
  if (!loaded.success) return deepFreeze(loaded);
  const dimensions = loaded.source.asset.dimensions;
  if (!dimensions) throw new Error("Validated source dimensions are unavailable.");

  let manifest: ReconstructionManifest | undefined;
  const diagnostics: ReconstructionDiagnostic[] = [];
  try {
    manifest = manifestFor(loaded.source.asset);
  } catch (error) {
    diagnostics.push(
      diagnostic({
        code: "REGION_DETECTION_FAILED",
        severity: configuration.strictMode ? "CRITICAL" : "ERROR",
        message: error instanceof Error ? error.message : "Invalid reconstruction manifest.",
        stage: "ANALYZE_REFERENCE",
        entityId: loaded.source.asset.id,
        recoverable: true,
      }),
    );
    if (configuration.strictMode)
      return deepFreeze({ success: false as const, diagnostics: sortDiagnostics(diagnostics) });
  }
  if (!manifest) {
    manifest = fallbackManifest(dimensions.width, dimensions.height);
    diagnostics.push(
      diagnostic({
        code: "REGION_DETECTION_FAILED",
        severity: "WARNING",
        message: "No analysis manifest exists; deterministic full-reference fallback is explicitly reported.",
        stage: "ANALYZE_REFERENCE",
        entityId: loaded.source.asset.id,
        recoverable: true,
      }),
      diagnostic({
        code: "TEXT_DETECTION_UNAVAILABLE",
        severity: "WARNING",
        message: "OCR is unavailable in the deterministic MVP.",
        stage: "ANALYZE_REFERENCE",
        recoverable: true,
      }),
    );
  }
  if (manifest.regions.length > configuration.maxRegions) {
    return deepFreeze({
      success: false as const,
      diagnostics: [
        diagnostic({
          code: "LIMIT_EXCEEDED",
          severity: "CRITICAL",
          message: `Manifest region count ${manifest.regions.length} exceeds ${configuration.maxRegions}.`,
          stage: "ANALYZE_REFERENCE",
          recoverable: true,
        }),
      ],
    });
  }

  const adapters = options.adapters ?? createDeterministicMvpAdapters();
  const context: ReconstructionAnalysisContext = { task, source: loaded.source, manifest };
  const annotations = adapters.regions.detect(context);
  const idsByKey = new Map(
    annotations.map((region, index) => [region.key, regionId(task, loaded.source.asset.hash, region, index)]),
  );
  let regions: DetectedRegion[];
  try {
    regions = annotations.map((annotation, index) => {
      const id = idsByKey.get(annotation.key);
      if (!id) throw new Error(`Missing deterministic ID for ${annotation.key}.`);
      const bounds = sourceBounds(annotation.bounds, dimensions.width, dimensions.height);
      const childIds = annotations.flatMap((candidate) =>
        candidate.parentKey === annotation.key && idsByKey.get(candidate.key)
          ? [idsByKey.get(candidate.key) as string]
          : [],
      );
      const parentId = annotation.parentKey ? idsByKey.get(annotation.parentKey) : undefined;
      if (annotation.parentKey && !parentId) {
        diagnostics.push(
          diagnostic({
            code: "AMBIGUOUS_HIERARCHY",
            severity: "ERROR",
            message: `Region ${annotation.key} references unknown parent ${annotation.parentKey}.`,
            stage: "ANALYZE_REFERENCE",
            entityId: id,
            recoverable: true,
          }),
        );
      }
      const provisional = {
        id,
        detectionIndex: index,
        category: annotation.category,
        bounds,
        ...(parentId ? { parentId } : {}),
        childIds,
        confidence: confidence(annotation.confidence),
        zOrderEstimate: annotation.zOrder,
        occlusion: { occluded: false, occludedByRegionIds: [] },
        semanticHints: annotation.semanticHints,
        visualFeatures: annotation.visualFeatures,
      };
      return DetectedRegionSchema.parse({
        ...provisional,
        provenance: provenance(context, provisional, annotation.confidence),
      });
    });
  } catch (error) {
    return deepFreeze({
      success: false as const,
      diagnostics: [
        diagnostic({
          code: "REGION_DETECTION_FAILED",
          severity: "CRITICAL",
          message: error instanceof Error ? error.message : "Region detection failed.",
          stage: "ANALYZE_REFERENCE",
          recoverable: true,
        }),
      ],
    });
  }

  for (const region of regions) {
    if (region.confidence.label === "LOW" || region.confidence.label === "UNKNOWN") {
      diagnostics.push(
        diagnostic({
          code: "LOW_CONFIDENCE_REGION",
          severity: "WARNING",
          message: `Region ${region.id} has ${region.confidence.label.toLowerCase()} detection confidence.`,
          stage: "ANALYZE_REFERENCE",
          entityId: region.id,
          recoverable: true,
        }),
      );
    }
  }
  const textCandidates = adapters.text.detect(context, regions);
  const assetCandidates = adapters.assets.inspect(context, regions);
  const shapeCandidates = adapters.shapes.infer(context, regions);
  const layoutCandidates = adapters.layout.infer(context, regions);
  const componentCandidates = configuration.enableComponentInference
    ? adapters.components.detect(context, regions)
    : [];
  const tokenCandidates = configuration.enableTokenInference ? adapters.tokens.infer(context, regions) : [];

  for (const candidate of textCandidates) {
    if (candidate.unresolved)
      diagnostics.push(
        diagnostic({
          code: "UNRESOLVED_TEXT",
          severity: "WARNING",
          message: `Text region ${candidate.regionId} has no fixture-provided content.`,
          stage: "ANALYZE_REFERENCE",
          entityId: candidate.id,
          recoverable: true,
        }),
      );
  }
  for (const candidate of assetCandidates) {
    if (!candidate.extracted) {
      diagnostics.push(
        diagnostic({
          code: "ASSET_EXTRACTION_UNAVAILABLE",
          severity: "WARNING",
          message: `Region ${candidate.regionId} uses a source-image crop; no independent asset was extracted.`,
          stage: "ANALYZE_REFERENCE",
          entityId: candidate.id,
          recoverable: true,
        }),
        diagnostic({
          code: "RASTER_FALLBACK_REQUIRED",
          severity: "WARNING",
          message: `Region ${candidate.regionId} requires a traceable raster fallback.`,
          stage: "ANALYZE_REFERENCE",
          entityId: candidate.id,
          recoverable: true,
        }),
      );
    }
  }
  for (const candidate of layoutCandidates) {
    if (candidate.type === "ABSOLUTE" && candidate.confidence.score < 0.6) {
      diagnostics.push(
        diagnostic({
          code: "AMBIGUOUS_LAYOUT",
          severity: "WARNING",
          message: `Region ${candidate.regionId} remains absolute because layout evidence is ambiguous.`,
          stage: "ANALYZE_REFERENCE",
          entityId: candidate.id,
          recoverable: true,
        }),
      );
    }
  }
  if (
    componentCandidates.length > configuration.maxComponentCandidates ||
    tokenCandidates.length > configuration.maxTokenCandidates
  ) {
    return deepFreeze({
      success: false as const,
      diagnostics: [
        diagnostic({
          code: "LIMIT_EXCEEDED",
          severity: "CRITICAL",
          message: "Inferred component or token candidates exceed configured limits.",
          stage: "ANALYZE_REFERENCE",
          recoverable: true,
        }),
      ],
    });
  }

  const confidenceSummary = createConfidenceSummary({
    regions: regions.map((entry) => entry.confidence.score),
    semantics: regions.map((entry) => (entry.category === "UNKNOWN" ? 0 : entry.confidence.score)),
    text: textCandidates.map((entry) => entry.confidence.score),
    assets: assetCandidates.map((entry) => entry.confidence.score),
    layouts: layoutCandidates.map((entry) => entry.confidence.score),
    components: componentCandidates.map((entry) => entry.confidence.score),
    tokens: tokenCandidates.map((entry) => entry.confidence.score),
  });
  const adapterVersions = Object.fromEntries(
    [
      adapters.regions,
      adapters.text,
      adapters.assets,
      adapters.shapes,
      adapters.layout,
      adapters.components,
      adapters.tokens,
    ]
      .map((adapter) => [adapter.id, adapter.version] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const analysisFingerprint = fingerprint({
    task,
    sourceHash: loaded.source.asset.hash,
    sourceDimensions: { width: dimensions.width, height: dimensions.height },
    manifest,
    adapterVersions,
    regions,
    textCandidates,
    assetCandidates,
    shapeCandidates,
    layoutCandidates,
    componentCandidates,
    tokenCandidates,
    diagnostics: sortDiagnostics(diagnostics),
    confidenceSummary,
    configuration,
  });
  const analysis = ReferenceAnalysisSchema.parse({
    id: deterministicScopedId("analysis", { taskId: task.id, analysisFingerprint }),
    analysisVersion: RECONSTRUCTION_ANALYSIS_VERSION,
    taskId: task.id,
    sourceAssetId: loaded.source.asset.id,
    sourceHash: loaded.source.asset.hash,
    sourceDimensions: { width: dimensions.width, height: dimensions.height },
    coordinateSystem: { origin: "TOP_LEFT", unit: "SOURCE_PIXEL" },
    referenceType: manifest.referenceType,
    orientation:
      dimensions.width === dimensions.height
        ? "SQUARE"
        : dimensions.width > dimensions.height
          ? "LANDSCAPE"
          : "PORTRAIT",
    regions,
    textCandidates,
    assetCandidates,
    shapeCandidates,
    layoutCandidates,
    componentCandidates,
    tokenCandidates,
    diagnostics: sortDiagnostics(diagnostics).slice(0, configuration.maxDiagnostics),
    confidenceSummary,
    adapterVersions,
    analysisFingerprint,
  });
  return deepFreeze({ success: true as const, analysis });
}
