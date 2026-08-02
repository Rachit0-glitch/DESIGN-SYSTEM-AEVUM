import {
  ComponentSchema,
  DesignNodeSchema,
  TokenSchema,
  createTransform,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import type { ReconstructionAssetResolver } from "./adapters.js";
import { buildCommandPlan } from "./commands.js";
import { diagnostic, hasBlockingDiagnostics, sortDiagnostics } from "./diagnostics.js";
import { deterministicEntityId, deterministicScopedId, fingerprint } from "./deterministic.js";
import { deepFreeze } from "./immutable.js";
import {
  RECONSTRUCTION_METADATA_KEY,
  RECONSTRUCTION_PROPOSAL_VERSION,
  ProposedNodeSchema,
  ReconstructionProposalSchema,
  type DetectedRegion,
  type ProposedNode,
  type ReconstructionConfiguration,
  type ReconstructionDiagnostic,
  type ReconstructionProposal,
  type ReconstructionTask,
  type ReferenceAnalysis,
} from "./schemas.js";

export type ReconstructionProposalResult =
  | { readonly success: true; readonly proposal: ReconstructionProposal }
  | { readonly success: false; readonly diagnostics: readonly ReconstructionDiagnostic[] };

const px = (value: number) => ({ value, unit: "PX" as const, mode: "FIXED" as const });

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
    regions: analysis.regions.map((region) => ({
      id: region.id,
      label: regionName(region),
      bounds: { x: region.bounds.x, y: region.bounds.y, width: region.bounds.width, height: region.bounds.height },
    })),
    metadata: {
      reconstructionTaskId: task.id,
      analysisFingerprint: analysis.analysisFingerprint,
      coordinateOrigin: "TOP_LEFT",
      coordinateUnit: "SOURCE_PIXEL",
    },
  };

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
    ...baseNode(frameId, "FRAME", "Reference frame", pageId, pageRegion, pageRegion, referenceId, "NATIVE"),
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
    ProposedNodeSchema.parse({
      node: frame,
      childOrder: 0,
      sourceRegionId: pageRegion.id,
      sourceAssetId: source.asset.id,
      confidence: pageRegion.confidence,
      provenance: pageRegion.provenance,
      fallbackStatus: "NATIVE",
      unsupportedFeatureNotes: [],
    }),
  ];

  const regionsById = new Map(analysis.regions.map((region) => [region.id, region]));
  const nodeIdsByRegion = new Map<string, string>();
  for (const region of analysis.regions) {
    if (region.id === pageRegion.id || region.category === "PAGE") continue;
    nodeIdsByRegion.set(
      region.id,
      deterministicEntityId(nodePrefix(region.category), { taskId: task.id, regionId: region.id }),
    );
  }
  const proposedAssets = new Map<string, ReconstructionProposal["proposedAssets"][number]>([
    [source.asset.id, { asset: source.asset, role: "SOURCE_REFERENCE" }],
  ]);
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

    if (region.category === "TEXT" && text) {
      const content = text.content ?? "";
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
        runs: content.length > 0 ? [{ start: 0, end: content.length, style: text.style }] : [],
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
            ...(shape.stroke ? { stroke: shape.stroke } : {}),
            ...(shape.cornerRadius !== undefined ? { cornerRadius: shape.cornerRadius } : {}),
          }
        : undefined;
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
        geometry: shape?.geometry ?? { inferredRole: region.category.toLowerCase() },
      });
      if (styleCandidates) unsupportedFeatureNotes.push("Paint candidates await the canonical Paint Model migration.");
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
        applied: false,
      },
    ];
  });
  const proposedTokens = analysis.tokenCandidates.map((candidate) => ({
    token: TokenSchema.parse({
      id: deterministicEntityId("token", { taskId: task.id, candidateId: candidate.id }),
      name: candidate.proposedName,
      type: candidate.type,
      value: candidate.value,
      description: `Suggested by ${candidate.supportingRegionIds.length} exact supporting region value(s).`,
    }),
    candidateId: candidate.id,
    applied: false,
  }));
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
