import {
  type CanonicalDesignDocument,
  ComponentSchema,
  createTransform,
  type DesignNode,
  DesignNodeSchema,
  TokenSchema,
} from "@aevum/document-model";
import type { ReconstructionAssetResolver } from "./adapters.js";
import { buildCommandPlan } from "./commands.js";
import { deterministicEntityId, deterministicScopedId, fingerprint } from "./deterministic.js";
import { diagnostic, hasBlockingDiagnostics, sortDiagnostics } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import {
  type DetectedRegion,
  type ProposedNode,
  ProposedNodeSchema,
  RECONSTRUCTION_METADATA_KEY,
  RECONSTRUCTION_PROPOSAL_VERSION,
  type ReconstructionConfiguration,
  type ReconstructionDiagnostic,
  type ReconstructionProposal,
  ReconstructionProposalSchema,
  type ReconstructionTask,
  type ReferenceAnalysis,
} from "./schemas.js";

export type ReconstructionProposalResult =
  | { readonly success: true; readonly proposal: ReconstructionProposal }
  | { readonly success: false; readonly diagnostics: readonly ReconstructionDiagnostic[] };

const px = (value: number) => ({ value, unit: "PX" as const, mode: "FIXED" as const });

interface SampledColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function isSampledColor(value: unknown): value is SampledColor {
  const candidate = value as Partial<SampledColor> | undefined;
  return (
    typeof candidate?.r === "number" &&
    typeof candidate?.g === "number" &&
    typeof candidate?.b === "number" &&
    Number.isFinite(candidate.r) &&
    Number.isFinite(candidate.g) &&
    Number.isFinite(candidate.b)
  );
}

/**
 * Resolves real sampled fill/ink colors into a single shared, deduplicated COLOR Token per
 * distinct color — the actual missing link between "reconstruction sampled a real color" and
 * "a node references a real Paint": before this, sampled colors were only ever captured into inert
 * metadata (see the SHAPE branch below) or discarded outright (TEXT had nowhere to put them at
 * all, until TextStyle gained fillTokenId in CDD 1.8.0).
 */
class ColorTokenResolver {
  readonly #tokens = new Map<string, { readonly id: string; readonly token: ReturnType<typeof TokenSchema.parse> }>();

  public constructor(private readonly taskId: string) {}

  public resolve(color: SampledColor): string {
    const r = Math.max(0, Math.min(255, Math.round(color.r)));
    const g = Math.max(0, Math.min(255, Math.round(color.g)));
    const b = Math.max(0, Math.min(255, Math.round(color.b)));
    const key = `${r},${g},${b}`;
    const existing = this.#tokens.get(key);
    if (existing) return existing.id;
    const index = this.#tokens.size;
    const id = deterministicEntityId("token", { taskId: this.taskId, kind: "sampled-color", key });
    const token = TokenSchema.parse({
      id,
      name: index === 0 ? "color.reconstructed.primary" : `color.reconstructed.variant${index + 1}`,
      type: "COLOR",
      value: { r: r / 255, g: g / 255, b: b / 255, a: 1, colorSpace: "SRGB" },
      description: "Sampled from the source reference image during reconstruction.",
    });
    this.#tokens.set(key, { id, token });
    return id;
  }

  public tokens(): readonly { readonly id: string; readonly token: ReturnType<typeof TokenSchema.parse> }[] {
    return [...this.#tokens.values()];
  }
}

interface RawGradientValue {
  readonly type: "LINEAR_GRADIENT" | "RADIAL_GRADIENT";
  readonly angle?: number;
  readonly stops: readonly { readonly r: number; readonly g: number; readonly b: number }[];
}

function isGradientValue(value: unknown): value is RawGradientValue {
  const candidate = value as Partial<RawGradientValue> | undefined;
  return (
    (candidate?.type === "LINEAR_GRADIENT" || candidate?.type === "RADIAL_GRADIENT") &&
    Array.isArray(candidate.stops) &&
    candidate.stops.length >= 2 &&
    candidate.stops.every((stop) => isSampledColor(stop))
  );
}

interface RawStrokeValue {
  readonly color: SampledColor;
  readonly width: number;
}

function isStrokeValue(value: unknown): value is RawStrokeValue {
  const candidate = value as Partial<RawStrokeValue> | undefined;
  return isSampledColor(candidate?.color) && typeof candidate?.width === "number" && Number.isFinite(candidate.width);
}

/**
 * Resolves real detected gradients (see packages/vision and packages/reconstruction-vision's
 * detectLinearGradient) into a single shared, deduplicated GRADIENT Token per distinct gradient —
 * the same real-Paint-by-token mechanism ColorTokenResolver uses for solid colors, extended to CDD
 * 1.9.0's GradientSchema. The raw detected value only carries two endpoint colors with no offset
 * (a two-stop measurement, not a designer's arbitrary stop list), so offsets are assigned evenly
 * across the stop list here (0 and 1 for the real two-stop case).
 */
class GradientTokenResolver {
  readonly #tokens = new Map<string, { readonly id: string; readonly token: ReturnType<typeof TokenSchema.parse> }>();

  public constructor(private readonly taskId: string) {}

  public resolve(gradient: RawGradientValue): string {
    const stops = gradient.stops.map((stop, index) => ({
      offset: gradient.stops.length > 1 ? index / (gradient.stops.length - 1) : 0,
      r: Math.max(0, Math.min(255, Math.round(stop.r))),
      g: Math.max(0, Math.min(255, Math.round(stop.g))),
      b: Math.max(0, Math.min(255, Math.round(stop.b))),
    }));
    const angleKey = gradient.angle !== undefined ? Math.round(gradient.angle) : "none";
    const key = `${gradient.type}|${angleKey}|${stops.map((stop) => `${stop.offset}:${stop.r},${stop.g},${stop.b}`).join("|")}`;
    const existing = this.#tokens.get(key);
    if (existing) return existing.id;
    const index = this.#tokens.size;
    const id = deterministicEntityId("token", { taskId: this.taskId, kind: "sampled-gradient", key });
    const token = TokenSchema.parse({
      id,
      name: index === 0 ? "gradient.reconstructed.primary" : `gradient.reconstructed.variant${index + 1}`,
      type: "GRADIENT",
      value: {
        type: gradient.type,
        stops: stops.map((stop) => ({
          offset: stop.offset,
          color: { r: stop.r / 255, g: stop.g / 255, b: stop.b / 255, a: 1, colorSpace: "SRGB" },
        })),
        ...(gradient.angle !== undefined ? { angle: gradient.angle } : {}),
      },
      description: "Sampled from the source reference image during reconstruction.",
    });
    this.#tokens.set(key, { id, token });
    return id;
  }

  public tokens(): readonly { readonly id: string; readonly token: ReturnType<typeof TokenSchema.parse> }[] {
    return [...this.#tokens.values()];
  }
}

function nodePrefix(category: DetectedRegion["category"]): "frame" | "group" | "text" | "image" | "shape" {
  if (category === "SECTION" || category === "FRAME") return "frame";
  if (category === "TEXT") return "text";
  if (category === "IMAGE" || category === "ICON") return "image";
  if (category === "SHAPE" || category === "BACKGROUND" || category === "DECORATION") return "shape";
  return "group";
}

function regionName(region: DetectedRegion): string {
  const semantic = region.semanticHints[0];
  if (semantic) return semantic.replaceAll(/[-_.]+/g, " ").replace(/^./, (character) => character.toUpperCase());
  return `${region.category.charAt(0)}${region.category.slice(1).toLowerCase()} ${region.detectionIndex + 1}`;
}

function metadata(region: DetectedRegion, fallbackStatus: ProposedNode["fallbackStatus"], styleCandidates?: unknown) {
  return {
    tags: ["reconstructed", region.category.toLowerCase()],
    description: `Reconstructed from source region ${region.id}.`,
    customData: {
      [RECONSTRUCTION_METADATA_KEY]: {
        schemaVersion: "1.0.0",
        sourceRegionId: region.id,
        confidence: region.confidence.score,
        confidenceLabel: region.confidence.label,
        analyzerId: region.provenance.analyzerId,
        analyzerVersion: region.provenance.analyzerVersion,
        fallbackStatus,
        ...(styleCandidates
          ? {
              styleCandidates,
              temporary: true,
              migrationTarget: "Canonical Paint, Stroke, Radius, and Effect model schema migration",
            }
          : {}),
      },
    },
  };
}

function sourceLinks(referenceId: string, region: DetectedRegion) {
  return [
    {
      referenceId,
      regionId: region.id,
      confidence: region.confidence.score,
      relationship: "RECONSTRUCTED_FROM" as const,
    },
  ];
}

function relativePosition(region: DetectedRegion, parent: DetectedRegion | undefined) {
  return {
    x: region.bounds.x - (parent?.bounds.x ?? 0),
    y: region.bounds.y - (parent?.bounds.y ?? 0),
    z: region.zOrderEstimate,
  };
}

function canonicalLayout(analysis: ReferenceAnalysis, region: DetectedRegion) {
  const candidate = analysis.layoutCandidates.find((entry) => entry.regionId === region.id);
  if (!candidate || candidate.type === "ABSOLUTE") return { type: "ABSOLUTE" as const };
  if (candidate.type === "VERTICAL_STACK" || candidate.type === "HORIZONTAL_ROW") {
    const padding = candidate.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    return {
      type: "AUTO_LAYOUT" as const,
      direction: candidate.type === "VERTICAL_STACK" ? ("VERTICAL" as const) : ("HORIZONTAL" as const),
      gap: px(candidate.gap ?? 0),
      padding: { top: px(padding.top), right: px(padding.right), bottom: px(padding.bottom), left: px(padding.left) },
    };
  }
  return {
    type: "GRID" as const,
    columns: Array.from({ length: candidate.columns ?? 1 }, (_, index) => ({
      size: { value: 1, unit: "PERCENT" as const, mode: "FILL" as const },
      name: `column-${index + 1}`,
    })),
    rows: [],
    gap: px(candidate.gap ?? 0),
    autoFlow: "ROW" as const,
  };
}

function baseNode(
  id: string,
  type: DesignNode["type"],
  name: string,
  parentId: string | null,
  region: DetectedRegion,
  parentRegion: DetectedRegion | undefined,
  referenceId: string,
  fallbackStatus: ProposedNode["fallbackStatus"],
  styleCandidates?: unknown,
) {
  const transform = createTransform();
  transform.position = relativePosition(region, parentRegion);
  return {
    id,
    type,
    name,
    parentId,
    childIds: [],
    visible: true,
    locked: false,
    transform,
    dimensions: { width: px(region.bounds.width), height: px(region.bounds.height) },
    constraints: {
      horizontal: "LEFT" as const,
      vertical: "TOP" as const,
      aspectRatioLocked: type === "IMAGE",
      maintainProportions: type === "IMAGE",
    },
    sourceLinks: sourceLinks(referenceId, region),
    metadata: metadata(region, fallbackStatus, styleCandidates),
  };
}

function depthOf(region: DetectedRegion, byId: ReadonlyMap<string, DetectedRegion>): number {
  let depth = 0;
  let current: DetectedRegion | undefined = region;
  const visited = new Set<string>();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = byId.get(current.parentId);
  }
  return depth;
}

export function validateReconstructionProposal(
  input: unknown,
  existingDocument?: CanonicalDesignDocument,
): {
  readonly success: boolean;
  readonly proposal?: ReconstructionProposal;
  readonly diagnostics: readonly ReconstructionDiagnostic[];
} {
  const parsed = ReconstructionProposalSchema.safeParse(input);
  if (!parsed.success) {
    return deepFreeze({
      success: false,
      diagnostics: parsed.error.issues.map((issue) =>
        diagnostic({
          code: "INVALID_PROPOSAL_REFERENCE",
          severity: "CRITICAL",
          message: issue.message,
          stage: "VALIDATE_PROPOSAL",
          path: issue.path.join("."),
          recoverable: true,
        }),
      ),
    });
  }
  const proposal = parsed.data;
  const diagnostics: ReconstructionDiagnostic[] = [];
  const nodeIds = new Set<string>();
  const availableNodeIds = new Set(Object.keys(existingDocument?.nodes ?? {}));
  for (const proposed of proposal.proposedNodes) {
    if (nodeIds.has(proposed.node.id)) {
      diagnostics.push(
        diagnostic({
          code: "DUPLICATE_PROPOSED_ID",
          severity: "CRITICAL",
          message: `Proposed node ID ${proposed.node.id} is duplicated.`,
          stage: "VALIDATE_PROPOSAL",
          entityId: proposed.node.id,
          recoverable: true,
        }),
      );
    }
    if (availableNodeIds.has(proposed.node.id)) {
      diagnostics.push(
        diagnostic({
          code: "DUPLICATE_PROPOSED_ID",
          severity: "CRITICAL",
          message: `Proposed node ID ${proposed.node.id} already exists in the target document.`,
          stage: "VALIDATE_PROPOSAL",
          entityId: proposed.node.id,
          recoverable: true,
        }),
      );
    }
    nodeIds.add(proposed.node.id);
  }
  for (const proposed of proposal.proposedNodes) availableNodeIds.add(proposed.node.id);
  for (const proposed of proposal.proposedNodes) {
    if (proposed.node.parentId && !availableNodeIds.has(proposed.node.parentId)) {
      diagnostics.push(
        diagnostic({
          code: "INVALID_PROPOSED_PARENT",
          severity: "CRITICAL",
          message: `Proposed parent ${proposed.node.parentId} does not exist.`,
          stage: "VALIDATE_PROPOSAL",
          entityId: proposed.node.id,
          relatedIds: [proposed.node.parentId],
          recoverable: true,
        }),
      );
    }
  }
  const commandIds = proposal.commandPlan.commands.map((command) => command.id);
  if (new Set(commandIds).size !== commandIds.length) {
    diagnostics.push(
      diagnostic({
        code: "COMMAND_PLAN_FAILED",
        severity: "CRITICAL",
        message: "Command plan contains duplicate command IDs.",
        stage: "VALIDATE_PROPOSAL",
        recoverable: true,
      }),
    );
  }
  const allDiagnostics = sortDiagnostics([...proposal.diagnostics, ...diagnostics]);
  return deepFreeze({ success: !hasBlockingDiagnostics(allDiagnostics), proposal, diagnostics: allDiagnostics });
}

export function createReconstructionProposal(
  task: ReconstructionTask,
  analysis: ReferenceAnalysis,
  resolver: ReconstructionAssetResolver,
  options: {
    readonly existingDocument?: CanonicalDesignDocument;
    readonly configuration?: Partial<ReconstructionConfiguration>;
  } = {},
): ReconstructionProposalResult {
  if (analysis.taskId !== task.id || analysis.sourceAssetId !== task.sourceAssetId) {
    return deepFreeze({
      success: false,
      diagnostics: [
        diagnostic({
          code: "INVALID_PROPOSAL_REFERENCE",
          severity: "CRITICAL",
          message: "Analysis does not belong to the reconstruction task.",
          stage: "BUILD_PROPOSAL",
          recoverable: false,
        }),
      ],
    });
  }
  const existing = options.existingDocument;
  if (task.targetDocumentId && existing?.metadata.id !== task.targetDocumentId) {
    return deepFreeze({
      success: false,
      diagnostics: [
        diagnostic({
          code: "INVALID_PROPOSAL_REFERENCE",
          severity: "CRITICAL",
          message: "Explicit targetDocumentId does not match the supplied document.",
          stage: "BUILD_PROPOSAL",
          recoverable: true,
        }),
      ],
    });
  }
  if (existing && existing.documentVersion !== task.expectedDocumentVersion) {
    return deepFreeze({
      success: false,
      diagnostics: [
        diagnostic({
          code: "INVALID_PROPOSAL_REFERENCE",
          severity: "CRITICAL",
          message: "Target document version does not match expectedDocumentVersion.",
          stage: "BUILD_PROPOSAL",
          recoverable: true,
        }),
      ],
    });
  }

  const diagnostics: ReconstructionDiagnostic[] = [...analysis.diagnostics];
  const source = resolver.resolve(task.sourceAssetId);
  if (source.kind !== "READY") {
    return deepFreeze({
      success: false,
      diagnostics: [
        diagnostic({
          code: "SOURCE_ASSET_NOT_FOUND",
          severity: "CRITICAL",
          message: "Source asset became unavailable while building the proposal.",
          stage: "BUILD_PROPOSAL",
          entityId: task.sourceAssetId,
          recoverable: true,
        }),
      ],
    });
  }
  const pageRegion = analysis.regions.find((region) => region.category === "PAGE") ?? analysis.regions[0];
  if (!pageRegion) {
    return deepFreeze({
      success: false,
      diagnostics: [
        diagnostic({
          code: "REGION_DETECTION_FAILED",
          severity: "CRITICAL",
          message: "Analysis contains no region for the reconstructed page.",
          stage: "BUILD_PROPOSAL",
          recoverable: true,
        }),
      ],
    });
  }

  const documentId =
    task.targetDocumentId ?? deterministicEntityId("doc", { taskId: task.id, sourceHash: analysis.sourceHash });
  const viewportId =
    existing?.settings.defaultViewportId ??
    deterministicEntityId("viewport", { taskId: task.id, dimensions: analysis.sourceDimensions });
  const referenceId =
    task.sourceReferenceId ?? deterministicEntityId("reference", { taskId: task.id, sourceHash: analysis.sourceHash });
  const pageId = deterministicEntityId("page", { taskId: task.id, role: "reconstructed-page" });
  const frameId = deterministicEntityId("frame", { taskId: task.id, role: "source-frame" });
  const viewport = {
    width: analysis.sourceDimensions.width,
    height: analysis.sourceDimensions.height,
    deviceScaleFactor: task.targetViewport.deviceScaleFactor,
    category: task.targetViewport.category,
    orientation: analysis.orientation === "PORTRAIT" ? ("PORTRAIT" as const) : ("LANDSCAPE" as const),
  };
  const reference = {
    id: referenceId,
    assetId: source.asset.id,
    type: "SCREENSHOT" as const,
    role: "PRIMARY" as const,
    ...(!existing ? { viewportId } : {}),
    // Block H7: preserve the real originally-detected gradient/crop for regions that have one, so
    // fidelity's structural comparison can attribute a mismatch specifically to "the gradient
    // changed" / "the crop changed" instead of only a generic region-pixel difference. Populated
    // straight from the same real shape/asset candidates already used to build each region's real
    // node above — nothing here is a separate or fabricated measurement.
    regions: analysis.regions.map((region) => {
      const shapeGradient = analysis.shapeCandidates.find((candidate) => candidate.regionId === region.id)?.gradient;
      const assetCrop = analysis.assetCandidates.find((candidate) => candidate.regionId === region.id)?.crop;
      return {
        id: region.id,
        label: regionName(region),
        bounds: { x: region.bounds.x, y: region.bounds.y, width: region.bounds.width, height: region.bounds.height },
        ...(isGradientValue(shapeGradient)
          ? {
              gradient: {
                type: shapeGradient.type,
                stops: shapeGradient.stops.map((stop, index) => ({
                  offset: shapeGradient.stops.length > 1 ? index / (shapeGradient.stops.length - 1) : 0,
                  color: {
                    r: Math.max(0, Math.min(255, Math.round(stop.r))) / 255,
                    g: Math.max(0, Math.min(255, Math.round(stop.g))) / 255,
                    b: Math.max(0, Math.min(255, Math.round(stop.b))) / 255,
                    a: 1,
                    colorSpace: "SRGB" as const,
                  },
                })),
                ...(shapeGradient.angle !== undefined ? { angle: shapeGradient.angle } : {}),
              },
            }
          : {}),
        ...(assetCrop ? { crop: assetCrop } : {}),
      };
    }),
    metadata: {
      reconstructionTaskId: task.id,
      analysisFingerprint: analysis.analysisFingerprint,
      coordinateOrigin: "TOP_LEFT",
      coordinateUnit: "SOURCE_PIXEL",
    },
  };

  // Block D completeness: merge into an existing page instead of always creating a new one, when
  // the caller explicitly asked for it and that page genuinely exists. A frame is always created
  // fresh either way — this only changes which page becomes its parent, and whether a new page
  // (and its own page.create command, later in buildCommandPlan) is proposed at all.
  const mergeTargetPage = task.targetPageId ? existing?.nodes[task.targetPageId] : undefined;
  const mergingIntoExistingPage = mergeTargetPage?.type === "PAGE" ? mergeTargetPage : undefined;
  const frameParentId = mergingIntoExistingPage?.id ?? pageId;

  const page = DesignNodeSchema.parse({
    ...baseNode(
      pageId,
      "PAGE",
      task.requestedPageName ?? "Reconstructed page",
      null,
      pageRegion,
      undefined,
      referenceId,
      "NATIVE",
    ),
    type: "PAGE",
    pageKind: analysis.referenceType === "POSTER" ? "POSTER" : "WEB",
    ...(!existing ? { viewportId } : {}),
  });
  const rootTransform = createTransform();
  const frame = DesignNodeSchema.parse({
    ...baseNode(frameId, "FRAME", "Reference frame", frameParentId, pageRegion, pageRegion, referenceId, "NATIVE"),
    type: "FRAME",
    transform: rootTransform,
    dimensions: {
      width: px(analysis.sourceDimensions.width),
      height: px(analysis.sourceDimensions.height),
      aspectRatio: analysis.sourceDimensions.width / analysis.sourceDimensions.height,
    },
    layout: canonicalLayout(analysis, pageRegion),
    semanticRole: "reconstructed-reference-root",
  });
  const proposedNodes: ProposedNode[] = [
    ...(mergingIntoExistingPage
      ? []
      : [
          ProposedNodeSchema.parse({
            node: page,
            childOrder: existing?.pages.length ?? 0,
            sourceRegionId: pageRegion.id,
            sourceAssetId: source.asset.id,
            confidence: pageRegion.confidence,
            provenance: pageRegion.provenance,
            fallbackStatus: "NATIVE",
            unsupportedFeatureNotes: [],
          }),
        ]),
    ProposedNodeSchema.parse({
      node: frame,
      childOrder: mergingIntoExistingPage ? mergingIntoExistingPage.childIds.length : 0,
      sourceRegionId: pageRegion.id,
      sourceAssetId: source.asset.id,
      confidence: pageRegion.confidence,
      provenance: pageRegion.provenance,
      fallbackStatus: "NATIVE",
      unsupportedFeatureNotes: [],
    }),
  ];

  const regionsById = new Map(analysis.regions.map((region) => [region.id, region]));

  // Real component materialization: a candidate only ever becomes "APPLY" (analyzer.ts) for a
  // confident, real repeated structure. The FIRST instance region's real node subtree becomes the
  // single component definition; every OTHER instance region collapses into a real COMPONENT_INSTANCE
  // node instead of its own duplicated subtree — its descendant regions are never independently
  // proposed at all, since scene-runtime's projector already knows how to project the definition's
  // real children for every instance (packages/scene-runtime/src/projector.ts).
  const appliedComponentCandidates = analysis.componentCandidates.filter(
    (candidate) => candidate.applyPolicy === "APPLY",
  );
  const shadowInstanceCandidateByRegionId = new Map<string, string>();
  for (const candidate of appliedComponentCandidates) {
    const [, ...shadowRegionIds] = candidate.instanceRegionIds;
    for (const shadowRegionId of shadowRegionIds) shadowInstanceCandidateByRegionId.set(shadowRegionId, candidate.id);
  }
  function descendantRegionIds(regionId: string): string[] {
    const children = analysis.regions.filter((region) => region.parentId === regionId);
    return children.flatMap((child) => [child.id, ...descendantRegionIds(child.id)]);
  }
  const suppressedDescendantRegionIds = new Set(
    [...shadowInstanceCandidateByRegionId.keys()].flatMap((regionId) => descendantRegionIds(regionId)),
  );

  const nodeIdsByRegion = new Map<string, string>();
  for (const region of analysis.regions) {
    if (region.id === pageRegion.id || region.category === "PAGE") continue;
    if (suppressedDescendantRegionIds.has(region.id)) continue;
    nodeIdsByRegion.set(
      region.id,
      shadowInstanceCandidateByRegionId.has(region.id)
        ? deterministicEntityId("component", { taskId: task.id, regionId: region.id })
        : deterministicEntityId(nodePrefix(region.category), { taskId: task.id, regionId: region.id }),
    );
  }
  const proposedAssets = new Map<string, ReconstructionProposal["proposedAssets"][number]>([
    [source.asset.id, { asset: source.asset, role: "SOURCE_REFERENCE" }],
  ]);
  const colorTokens = new ColorTokenResolver(task.id);
  const gradientTokens = new GradientTokenResolver(task.id);
  const orderedRegions = analysis.regions
    .filter((region) => nodeIdsByRegion.has(region.id))
    .sort(
      (left, right) =>
        depthOf(left, regionsById) - depthOf(right, regionsById) ||
        left.zOrderEstimate - right.zOrderEstimate ||
        left.detectionIndex - right.detectionIndex ||
        left.id.localeCompare(right.id),
    );

  for (const region of orderedRegions) {
    const id = nodeIdsByRegion.get(region.id);
    if (!id) continue;
    const parentRegion = region.parentId ? regionsById.get(region.parentId) : pageRegion;
    const parentId =
      region.parentId && region.parentId !== pageRegion.id
        ? (nodeIdsByRegion.get(region.parentId) ?? frameId)
        : frameId;
    const siblings = analysis.regions
      .filter((candidate) => candidate.parentId === region.parentId)
      .sort((left, right) => left.zOrderEstimate - right.zOrderEstimate || left.detectionIndex - right.detectionIndex);
    const childOrder = Math.max(
      0,
      siblings.findIndex((candidate) => candidate.id === region.id),
    );
    const text = analysis.textCandidates.find((candidate) => candidate.regionId === region.id);
    const image = analysis.assetCandidates.find((candidate) => candidate.regionId === region.id);
    const shape = analysis.shapeCandidates.find((candidate) => candidate.regionId === region.id);
    let node: DesignNode;
    let fallbackStatus: ProposedNode["fallbackStatus"] = "NATIVE";
    const unsupportedFeatureNotes: string[] = [];

    const shadowCandidateId = shadowInstanceCandidateByRegionId.get(region.id);
    if (shadowCandidateId) {
      // This region is a real repeated-structure instance (Block H1): rather than proposing its own
      // duplicated subtree, it becomes a real COMPONENT_INSTANCE referencing the definition built
      // from the candidate's first instance region — the same real position/sourceLinks as any other
      // node, so fidelity's BOUNDS comparison still works against this instance's own real bounds.
      node = DesignNodeSchema.parse({
        ...baseNode(
          id,
          "COMPONENT_INSTANCE",
          regionName(region),
          parentId,
          region,
          parentRegion,
          referenceId,
          "NATIVE",
        ),
        type: "COMPONENT_INSTANCE",
        componentId: deterministicEntityId("component", { taskId: task.id, candidateId: shadowCandidateId }),
        overrides: {},
      });
    } else if (region.category === "TEXT" && text) {
      const content = text.content ?? "";
      const fillTokenId = isSampledColor(text.sampledColor) ? colorTokens.resolve(text.sampledColor) : undefined;
      const textStyle = fillTokenId ? { ...text.style, fillTokenId } : text.style;
      node = DesignNodeSchema.parse({
        ...baseNode(
          id,
          "TEXT",
          regionName(region),
          parentId,
          region,
          parentRegion,
          referenceId,
          text.unresolved ? "UNRESOLVED" : "NATIVE",
        ),
        type: "TEXT",
        content,
        runs: content.length > 0 ? [{ start: 0, end: content.length, style: textStyle }] : [],
        paragraphStyle: {
          alignment: text.alignment,
          verticalAlignment: "TOP",
          direction: text.direction,
          paragraphSpacingBefore: px(0),
          paragraphSpacingAfter: px(0),
          firstLineIndent: px(0),
          hangingIndent: px(0),
        },
      });
      fallbackStatus = text.unresolved ? "UNRESOLVED" : "NATIVE";
      if (text.unresolved) unsupportedFeatureNotes.push("Text content was not recognized; geometry is preserved.");
      if (!fillTokenId && !text.unresolved)
        unsupportedFeatureNotes.push("No ink color could be sampled for this text region; it has no fill color.");
    } else if ((region.category === "IMAGE" || region.category === "ICON") && image) {
      const assetId = image.assetId ?? source.asset.id;
      const resolved = resolver.resolve(assetId);
      if (resolved.kind === "READY" && resolved.asset.type === "IMAGE") {
        proposedAssets.set(assetId, {
          asset: resolved.asset,
          role: image.extracted ? "REGION_ASSET" : "RASTER_FALLBACK",
          sourceRegionId: region.id,
        });
        node = DesignNodeSchema.parse({
          ...baseNode(
            id,
            "IMAGE",
            regionName(region),
            parentId,
            region,
            parentRegion,
            referenceId,
            image.extracted ? "NATIVE" : "RASTER_BACKED",
          ),
          type: "IMAGE",
          assetId,
          ...(image.crop ? { crop: image.crop } : {}),
          objectFit: image.fit,
        });
        fallbackStatus = image.extracted ? "NATIVE" : "RASTER_BACKED";
        if (!image.extracted)
          unsupportedFeatureNotes.push("Uses a source-reference crop; no independent asset extraction was performed.");
      } else {
        node = DesignNodeSchema.parse({
          ...baseNode(
            deterministicEntityId("group", { taskId: task.id, regionId: region.id }),
            "GROUP",
            `${regionName(region)} unresolved`,
            parentId,
            region,
            parentRegion,
            referenceId,
            "UNRESOLVED",
          ),
          type: "GROUP",
          isolation: false,
          passThroughBlend: true,
        });
        fallbackStatus = "UNRESOLVED";
        unsupportedFeatureNotes.push("Referenced image asset is unavailable.");
        diagnostics.push(
          diagnostic({
            code: "UNRESOLVED_ASSET",
            severity: "ERROR",
            message: `Image region ${region.id} references unavailable asset ${assetId}.`,
            stage: "BUILD_PROPOSAL",
            entityId: region.id,
            relatedIds: [assetId],
            recoverable: true,
          }),
        );
      }
    } else if (region.category === "ICON") {
      const fallbackAllowed = task.allowRasterFallbacks && (options.configuration?.allowRasterFallback ?? true);
      if (fallbackAllowed) {
        proposedAssets.set(source.asset.id, { asset: source.asset, role: "SOURCE_REFERENCE" });
        node = DesignNodeSchema.parse({
          ...baseNode(
            id,
            "IMAGE",
            `${regionName(region)} raster placeholder`,
            parentId,
            region,
            parentRegion,
            referenceId,
            "RASTER_BACKED",
          ),
          type: "IMAGE",
          assetId: source.asset.id,
          crop: region.bounds.normalized,
          objectFit: "COVER",
        });
        fallbackStatus = "RASTER_BACKED";
      } else {
        const groupId = deterministicEntityId("group", { taskId: task.id, regionId: region.id });
        node = DesignNodeSchema.parse({
          ...baseNode(
            groupId,
            "GROUP",
            `${regionName(region)} placeholder`,
            parentId,
            region,
            parentRegion,
            referenceId,
            "PLACEHOLDER",
          ),
          type: "GROUP",
          isolation: false,
          passThroughBlend: true,
        });
        fallbackStatus = "PLACEHOLDER";
      }
      unsupportedFeatureNotes.push("Native vector tracing is unavailable in Phase 6.");
    } else if (["SHAPE", "BACKGROUND", "DECORATION"].includes(region.category)) {
      const styleCandidates = shape
        ? {
            ...(shape.fill ? { fill: shape.fill } : {}),
            ...(shape.gradient ? { gradient: shape.gradient } : {}),
            ...(shape.stroke ? { stroke: shape.stroke } : {}),
            ...(shape.cornerRadius !== undefined ? { cornerRadius: shape.cornerRadius } : {}),
          }
        : undefined;
      const gradientTokenId = isGradientValue(shape?.gradient) ? gradientTokens.resolve(shape.gradient) : undefined;
      // A detected gradient fill takes the fillTokenId slot instead of a solid color — the two are
      // mutually exclusive in the detected data (see detectLinearGradient's callers), matching how
      // a shape can only have one fill Paint.
      const fillTokenId =
        gradientTokenId ?? (isSampledColor(shape?.fill) ? colorTokens.resolve(shape.fill) : undefined);
      const strokeTokenId = isStrokeValue(shape?.stroke) ? colorTokens.resolve(shape.stroke.color) : undefined;
      // cornerRadius and stroke *width* still have no typed canonical field (ShapeNodeSchema has no
      // radius/strokeWidth token or property yet) — those stay captured only in the free-form
      // `geometry` JSON, real sampled data preserved for Studio to read directly, not silently
      // discarded but not a canonical typed Paint value either. Fill color, gradient fill, and
      // stroke color ARE now real, applied Paints (fillTokenId/strokeTokenId), the same mechanism
      // as text color above.
      node = DesignNodeSchema.parse({
        ...baseNode(
          id,
          "SHAPE",
          regionName(region),
          parentId,
          region,
          parentRegion,
          referenceId,
          "NATIVE",
          styleCandidates,
        ),
        type: "SHAPE",
        shapeType: shape?.shapeType ?? "RECTANGLE",
        geometry: shape ? { ...shape.geometry, ...styleCandidates } : { inferredRole: region.category.toLowerCase() },
        ...(fillTokenId ? { fillTokenId } : {}),
        ...(strokeTokenId ? { strokeTokenId } : {}),
      });
      if (shape?.cornerRadius !== undefined || (shape?.stroke && strokeTokenId))
        unsupportedFeatureNotes.push(
          "cornerRadius and stroke width are captured in geometry as real sampled data, but the canonical schema has no typed radius/strokeWidth field yet; Studio reads them directly from node.geometry.",
        );
    } else if (region.category === "SECTION" || region.category === "FRAME") {
      node = DesignNodeSchema.parse({
        ...baseNode(id, "FRAME", regionName(region), parentId, region, parentRegion, referenceId, "NATIVE"),
        type: "FRAME",
        layout: canonicalLayout(analysis, region),
        semanticRole: region.semanticHints[0] ?? "reconstructed-section",
      });
    } else {
      node = DesignNodeSchema.parse({
        ...baseNode(id, "GROUP", regionName(region), parentId, region, parentRegion, referenceId, "NATIVE"),
        type: "GROUP",
        isolation: false,
        passThroughBlend: true,
      });
    }
    proposedNodes.push(
      ProposedNodeSchema.parse({
        node,
        childOrder,
        sourceRegionId: region.id,
        sourceAssetId: source.asset.id,
        confidence: region.confidence,
        provenance: region.provenance,
        fallbackStatus,
        unsupportedFeatureNotes,
      }),
    );
  }

  const proposedComponents = analysis.componentCandidates.flatMap((candidate) => {
    const rootNodeId = candidate.instanceRegionIds.map((regionId) => nodeIdsByRegion.get(regionId)).find(Boolean);
    if (!rootNodeId) return [];
    return [
      {
        component: ComponentSchema.parse({
          id: deterministicEntityId("component", { taskId: task.id, candidateId: candidate.id }),
          name: candidate.proposedName,
          rootNodeId,
          variants: [],
          slots: [],
          defaultOverrides: {},
        }),
        candidateId: candidate.id,
        applied: candidate.applyPolicy === "APPLY",
      },
    ];
  });
  const proposedTokens = [
    ...analysis.tokenCandidates.map((candidate) => ({
      token: TokenSchema.parse({
        id: deterministicEntityId("token", { taskId: task.id, candidateId: candidate.id }),
        name: candidate.proposedName,
        type: candidate.type,
        value: candidate.value,
        description: `Suggested by ${candidate.supportingRegionIds.length} exact supporting region value(s).`,
      }),
      candidateId: candidate.id,
      applied: false,
    })),
    // Real, applied color and gradient tokens — unlike the suggestions above, these are already
    // referenced by fillTokenId/strokeTokenId on the nodes built earlier in this function, not
    // merely proposed for review.
    ...colorTokens.tokens().map(({ id, token }) => ({ token, candidateId: id, applied: true })),
    ...gradientTokens.tokens().map(({ id, token }) => ({ token, candidateId: id, applied: true })),
  ];
  const fallbacks = proposedNodes
    .filter((entry) => entry.fallbackStatus !== "NATIVE")
    .map((entry) => ({
      id: deterministicScopedId("fallback", { taskId: task.id, nodeId: entry.node.id }),
      regionId: entry.sourceRegionId,
      kind:
        entry.fallbackStatus === "RASTER_BACKED"
          ? ("FULL_REFERENCE_IMAGE" as const)
          : entry.node.type === "TEXT"
            ? ("UNRESOLVED_TEXT" as const)
            : ("VECTOR_PLACEHOLDER" as const),
      reason: entry.unsupportedFeatureNotes.join(" ") || "Fallback preserves source geometry.",
      preservesEditability: entry.node.type !== "IMAGE",
    }));
  const unresolvedIssues = sortDiagnostics(diagnostics)
    .filter((entry) => entry.severity === "ERROR" || entry.severity === "CRITICAL")
    .map((entry, index) => ({
      id: deterministicScopedId("issue", { taskId: task.id, code: entry.code, index }),
      code: entry.code,
      message: entry.message,
      blocking: entry.severity === "CRITICAL",
      relatedIds: entry.relatedIds,
    }));
  const proposalId = deterministicScopedId("proposal", {
    taskId: task.id,
    analysisFingerprint: analysis.analysisFingerprint,
    targetDocumentId: documentId,
    expectedDocumentVersion: existing?.documentVersion ?? 0,
  });
  const documentName = task.requestedPageName ? `${task.requestedPageName} reconstruction` : "Reconstructed design";
  const commandPlan = buildCommandPlan({
    proposalId,
    task,
    documentId,
    viewportId,
    viewport,
    documentName,
    proposedNodes,
    proposedAssets: [...proposedAssets.values()],
    proposedComponents,
    proposedTokens,
    reference,
    ...(existing ? { existingDocument: existing } : {}),
  });
  const draft = {
    id: proposalId,
    proposalVersion: RECONSTRUCTION_PROPOSAL_VERSION,
    taskId: task.id,
    analysisId: analysis.id,
    projectId: task.projectId,
    ...(task.targetDocumentId ? { targetDocumentId: task.targetDocumentId } : {}),
    sourceAssetId: source.asset.id,
    sourceHash: analysis.sourceHash,
    proposedDocumentMetadata: {
      documentId,
      name: documentName,
      pageName: task.requestedPageName ?? "Reconstructed page",
      viewportId,
      viewport,
      reference,
    },
    proposedNodes,
    proposedAssets: [...proposedAssets.values()],
    proposedComponents,
    proposedTokens,
    proposedResponsiveData: [
      {
        nodeId: frameId,
        sourceViewport: viewport,
        breakpointClassification: "SOURCE_ONLY" as const,
        contentPriority: 0,
        stackingCandidateNodeIds: [],
      },
    ],
    commandPlan,
    confidenceSummary: analysis.confidenceSummary,
    diagnostics: sortDiagnostics(diagnostics),
    unresolvedIssues,
    fallbacks,
  };
  const proposalFingerprint = fingerprint({ ...draft, commandPlan: commandPlan.commandPlanFingerprint });
  const proposal = ReconstructionProposalSchema.parse({ ...draft, proposalFingerprint });
  const validation = validateReconstructionProposal(proposal, existing);
  return validation.success
    ? deepFreeze({ success: true, proposal })
    : deepFreeze({ success: false, diagnostics: validation.diagnostics });
}
