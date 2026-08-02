import { ResponsiveOverrideSchema, type CanonicalDesignDocument, type DesignNode } from "@aevum/document-model";
import { z } from "zod";
import { deepFreeze } from "./immutable.js";
import {
  RESPONSIVE_PROPOSAL_VERSION,
  ResponsiveDiagnosticSchema,
  ResponsiveNodeProposalSchema,
  ResponsiveProposalSchema,
  ResponsiveReconstructionTaskSchema,
  type ResponsiveDiagnostic,
  type ResponsiveNodeProposal,
  type ResponsiveProperty,
  type ResponsiveProposal,
  type ResponsiveReconstructionTask,
  type ResponsiveTarget,
  type ResponsiveVariant,
} from "./schemas.js";
import { deterministicId, fingerprint, stableStringify } from "./stable.js";

type ResponsiveOverride = z.infer<typeof ResponsiveOverrideSchema>;

const ResponsiveIntentMetadataSchema = z.strictObject({
  contentPriority: z.number().int().default(0),
  hideOn: z.array(z.string().min(1)).default([]),
  focalPoint: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  cameraByVariant: z.record(z.string(), z.string().min(1)).default({}),
  motion: z.boolean().default(false),
});

type Metadata = z.infer<typeof ResponsiveIntentMetadataSchema>;

interface AccumulatedChange {
  readonly nodeId: string;
  readonly target: ResponsiveTarget;
  override: ResponsiveOverride;
  readonly properties: Set<ResponsiveProperty>;
  confidence: number;
  readonly evidenceIds: Set<string>;
  readonly rationale: Set<string>;
  source: "REFERENCE" | "LOCAL_INFERENCE" | "COMBINED";
}

function diagnostic(input: z.input<typeof ResponsiveDiagnosticSchema>): ResponsiveDiagnostic {
  return ResponsiveDiagnosticSchema.parse(input);
}

function mergeObjects(left: unknown, right: unknown): unknown {
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const result: Record<string, unknown> = { ...(left as Record<string, unknown>) };
    for (const [key, value] of Object.entries(right as Record<string, unknown>)) {
      result[key] = mergeObjects(result[key], value);
    }
    return result;
  }
  return right;
}

function mergeOverride(left: ResponsiveOverride, right: ResponsiveOverride): ResponsiveOverride {
  return ResponsiveOverrideSchema.parse(mergeObjects(left, right));
}

function metadata(node: DesignNode, diagnostics: ResponsiveDiagnostic[]): Metadata {
  const raw = node.metadata.customData["aevum.responsive"];
  if (raw === undefined) return ResponsiveIntentMetadataSchema.parse({});
  const parsed = ResponsiveIntentMetadataSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  diagnostics.push(
    diagnostic({
      code: "INVALID_METADATA",
      severity: "WARNING",
      message: `Node ${node.id} has invalid aevum.responsive metadata; local hints were ignored.`,
      recoverable: true,
      nodeId: node.id,
    }),
  );
  return ResponsiveIntentMetadataSchema.parse({});
}

function px(value: number) {
  return { value: Math.round(value * 1000) / 1000, unit: "PX" as const, mode: "FIXED" as const };
}

function responsiveTextSize(base: number, category: ResponsiveVariant["category"], minimum: number): number {
  if (category === "DESKTOP" || category === "CUSTOM") return base;
  if (category === "TABLET") {
    if (base > 48) return 40;
    if (base > 32) return 32;
    if (base > 24) return 24;
    return Math.max(minimum, base);
  }
  if (base > 48) return 32;
  if (base > 32) return 28;
  if (base > 24) return 24;
  if (base > 18) return 18;
  return Math.max(minimum, base);
}

function responsiveLayout(node: Extract<DesignNode, { type: "FRAME" }>, variant: ResponsiveVariant) {
  const layout = node.layout;
  if (variant.category === "MOBILE") {
    if (layout.type === "FLEX")
      return {
        ...layout,
        direction: "COLUMN" as const,
        wrap: "NO_WRAP" as const,
        gap: px(Math.max(8, layout.gap.value * 0.75)),
      };
    if (layout.type === "AUTO_LAYOUT")
      return { ...layout, direction: "VERTICAL" as const, gap: px(Math.max(8, layout.gap.value * 0.75)) };
    if (layout.type === "GRID")
      return {
        ...layout,
        columns: [{ size: { value: 1, unit: "PERCENT" as const, mode: "FILL" as const }, name: "mobile" }],
        gap: px(Math.max(8, layout.gap.value * 0.75)),
      };
  }
  if (variant.category === "TABLET") {
    if (layout.type === "FLEX")
      return { ...layout, wrap: "WRAP" as const, gap: px(Math.max(8, layout.gap.value * 0.875)) };
    if (layout.type === "AUTO_LAYOUT") return { ...layout, gap: px(Math.max(8, layout.gap.value * 0.875)) };
  }
  return undefined;
}

function cropAroundFocalPoint(focal: { x: number; y: number }, variant: ResponsiveVariant) {
  const width = variant.category === "MOBILE" ? 0.7 : 0.85;
  const height = variant.orientation === "PORTRAIT" ? 1 : 0.85;
  return {
    x: Math.max(0, Math.min(1 - width, focal.x - width / 2)),
    y: Math.max(0, Math.min(1 - height, focal.y - height / 2)),
    width,
    height,
  };
}

function propertiesForOverride(override: ResponsiveOverride): ResponsiveProperty[] {
  const properties = new Set<ResponsiveProperty>();
  if (override.layout) {
    properties.add("LAYOUT");
    properties.add("SPACING");
  }
  if (override.childOrder) properties.add("ORDER");
  if (override.visible !== undefined) properties.add("VISIBILITY");
  if (override.textStyle || override.paragraphStyle) properties.add("TYPOGRAPHY");
  if (override.crop || override.objectFit || override.assetId) properties.add("CROP");
  if (override.constraints) properties.add("CONSTRAINTS");
  if (override.activeCameraId) properties.add("CAMERA");
  if (override.motion) properties.add("MOTION");
  if (override.dimensions) properties.add("DIMENSIONS");
  if (override.customData) properties.add("QUALITY");
  return [...properties];
}

function semanticMobileChange(change: ResponsiveNodeProposal): boolean {
  return change.properties.some((property) =>
    ["LAYOUT", "ORDER", "VISIBILITY", "SPACING", "TYPOGRAPHY", "CROP", "CONSTRAINTS", "DIMENSIONS"].includes(property),
  );
}

function existingMobileIntent(document: CanonicalDesignDocument, mobileKeys: ReadonlySet<string>): boolean {
  return Object.values(document.nodes).some((node) => {
    const responsive = node.responsive;
    if (!responsive) return false;
    return [...mobileKeys].some((key) => {
      const override = responsive.breakpoints[key];
      return override
        ? propertiesForOverride(override).some((property) => property !== "QUALITY" && property !== "MOTION")
        : false;
    });
  });
}

export function generateResponsiveProposal(
  inputTask: ResponsiveReconstructionTask,
  document: CanonicalDesignDocument,
): ResponsiveProposal {
  const task = ResponsiveReconstructionTaskSchema.parse(inputTask);
  if (document.metadata.id !== task.documentId || document.documentVersion !== task.expectedDocumentVersion)
    throw new Error("Responsive task document identity or version does not match the canonical document.");
  if (document.metadata.projectId !== task.projectId)
    throw new Error("Responsive task project does not match document.");
  const sourceVariant = task.variants.find((variant) => variant.id === task.sourceViewportId);
  if (!sourceVariant) throw new Error("Responsive source viewport is unavailable.");

  const diagnostics: ResponsiveDiagnostic[] = [];
  const accumulated = new Map<string, AccumulatedChange>();
  const protections = new Set(task.protectedProperties.map((entry) => `${entry.nodeId}|${entry.property}`));
  const add = (input: {
    node: DesignNode;
    target: ResponsiveTarget;
    override: ResponsiveOverride;
    properties: readonly ResponsiveProperty[];
    confidence: number;
    rationale: string;
    source: "REFERENCE" | "LOCAL_INFERENCE";
    evidenceId?: string;
  }): void => {
    if (input.node.locked) {
      diagnostics.push(
        diagnostic({
          code: "LOCKED_NODE",
          severity: "INFO",
          message: `Locked node ${input.node.id} was not changed.`,
          recoverable: true,
          nodeId: input.node.id,
        }),
      );
      return;
    }
    const protectedProperty = input.properties.find((property) => protections.has(`${input.node.id}|${property}`));
    if (protectedProperty) {
      diagnostics.push(
        diagnostic({
          code: "PROTECTED_PROPERTY",
          severity: "INFO",
          message: `${protectedProperty} is protected on ${input.node.id}.`,
          recoverable: true,
          nodeId: input.node.id,
          property: protectedProperty,
        }),
      );
      return;
    }
    if (input.confidence < task.minimumConfidence) {
      diagnostics.push(
        diagnostic({
          code: "LOW_CONFIDENCE",
          severity: "INFO",
          message: `Responsive evidence for ${input.node.id} was below the confidence threshold.`,
          recoverable: true,
          nodeId: input.node.id,
        }),
      );
      return;
    }
    const key = `${input.node.id}|${input.target.kind}|${input.target.key}`;
    const current = accumulated.get(key);
    if (!current) {
      accumulated.set(key, {
        nodeId: input.node.id,
        target: input.target,
        override: ResponsiveOverrideSchema.parse(input.override),
        properties: new Set(input.properties),
        confidence: input.confidence,
        evidenceIds: new Set(input.evidenceId ? [input.evidenceId] : []),
        rationale: new Set([input.rationale]),
        source: input.source,
      });
      return;
    }
    current.override = mergeOverride(current.override, input.override);
    for (const property of input.properties) current.properties.add(property);
    if (input.evidenceId) current.evidenceIds.add(input.evidenceId);
    current.rationale.add(input.rationale);
    current.confidence = Math.max(current.confidence, input.confidence);
    if (current.source !== input.source) current.source = "COMBINED";
  };

  const nodes = Object.values(document.nodes).sort((left, right) => left.id.localeCompare(right.id));
  const metadataByNode = new Map(nodes.map((node) => [node.id, metadata(node, diagnostics)]));
  const targetVariants = task.variants.filter((variant) => variant.id !== task.sourceViewportId);
  for (const variant of targetVariants) {
    const target: ResponsiveTarget = { kind: "BREAKPOINT", key: variant.breakpointId };
    for (const node of nodes) {
      const intent = metadataByNode.get(node.id) as Metadata;
      if (intent.hideOn.includes(variant.id) || intent.hideOn.includes(variant.category)) {
        add({
          node,
          target,
          override: { visible: false },
          properties: ["VISIBILITY"],
          confidence: 0.9,
          rationale: `Visibility hint for ${variant.name}.`,
          source: "LOCAL_INFERENCE",
        });
      }
      if (node.type === "FRAME") {
        const layout = responsiveLayout(node, variant);
        if (layout && stableStringify(layout) !== stableStringify(node.layout))
          add({
            node,
            target,
            override: { layout },
            properties: ["LAYOUT", "SPACING"],
            confidence: 0.78,
            rationale: `Regenerated ${variant.category.toLowerCase()} layout intent.`,
            source: "LOCAL_INFERENCE",
          });
        if (variant.category === "MOBILE") {
          add({
            node,
            target,
            override: { dimensions: { width: { value: 100, unit: "PERCENT", mode: "FILL" } } },
            properties: ["DIMENSIONS"],
            confidence: 0.72,
            rationale: "Use the mobile container width instead of desktop scaling.",
            source: "LOCAL_INFERENCE",
          });
          add({
            node,
            target,
            override: { constraints: { horizontal: "STRETCH" } },
            properties: ["CONSTRAINTS"],
            confidence: 0.72,
            rationale: "Stretch the frame within the mobile parent.",
            source: "LOCAL_INFERENCE",
          });
        }
        const ordered = [...node.childIds].sort((left, right) => {
          const priority =
            (metadataByNode.get(right)?.contentPriority ?? 0) - (metadataByNode.get(left)?.contentPriority ?? 0);
          return priority || node.childIds.indexOf(left) - node.childIds.indexOf(right);
        });
        if (stableStringify(ordered) !== stableStringify(node.childIds))
          add({
            node,
            target,
            override: { childOrder: ordered },
            properties: ["ORDER"],
            confidence: 0.76,
            rationale: "Order children by declared content priority.",
            source: "LOCAL_INFERENCE",
          });
      }
      if (node.type === "TEXT" && node.runs[0]) {
        const baseSize = node.runs[0].style.size;
        if (baseSize.unit === "PX") {
          const size = responsiveTextSize(baseSize.value, variant.category, task.minimumTextSizePx);
          if (size !== baseSize.value)
            add({
              node,
              target,
              override: { textStyle: { size: px(size) } },
              properties: ["TYPOGRAPHY"],
              confidence: 0.82,
              rationale: "Apply a readable semantic type step for this viewport.",
              source: "LOCAL_INFERENCE",
            });
        }
      }
      if ((node.type === "IMAGE" || node.type === "VIDEO") && intent.focalPoint && variant.category !== "DESKTOP") {
        add({
          node,
          target,
          override: { crop: cropAroundFocalPoint(intent.focalPoint, variant), objectFit: "COVER" },
          properties: ["CROP"],
          confidence: 0.86,
          rationale: "Preserve the declared focal point in the responsive crop.",
          source: "LOCAL_INFERENCE",
        });
      }
      if (node.type === "SCENE_3D") {
        const cameraId =
          intent.cameraByVariant[variant.id] ??
          intent.cameraByVariant[variant.breakpointId] ??
          intent.cameraByVariant[variant.category];
        if (cameraId && document.cameras[cameraId])
          add({
            node,
            target,
            override: { activeCameraId: cameraId },
            properties: ["CAMERA"],
            confidence: 0.9,
            rationale: `Use the declared ${variant.name} camera composition.`,
            source: "LOCAL_INFERENCE",
          });
      }
    }
  }

  const qualityModes = [...new Set(task.variants.map((variant) => variant.qualityMode))];
  for (const node of nodes.filter((entry) => ["SCENE_3D", "WEBGL_LAYER", "MODEL_3D"].includes(entry.type))) {
    for (const qualityMode of qualityModes) {
      const pixelRatio = qualityMode === "DRAFT" ? 1 : qualityMode === "HIGH_QUALITY" ? 1.5 : 2;
      add({
        node,
        target: { kind: "QUALITY_PROFILE", key: qualityMode },
        override: { customData: { "aevum.qualityProfile": { mode: qualityMode, maxPixelRatio: pixelRatio } } },
        properties: ["QUALITY"],
        confidence: 0.8,
        rationale: `Declare the ${qualityMode} delivery profile.`,
        source: "LOCAL_INFERENCE",
      });
    }
  }

  const timelineTargets = new Set(
    Object.values(document.timelines).flatMap((timeline) => timeline.tracks.map((track) => track.targetId)),
  );
  for (const node of nodes) {
    if (!timelineTargets.has(node.id) && !metadataByNode.get(node.id)?.motion) continue;
    add({
      node,
      target: { kind: "REDUCED_MOTION", key: "REDUCED_MOTION" },
      override: { motion: { behavior: "REDUCE", durationScale: 0.2 } },
      properties: ["MOTION"],
      confidence: 0.95,
      rationale: "Provide a bounded reduced-motion alternative.",
      source: "LOCAL_INFERENCE",
    });
  }

  for (const evidence of [...task.referenceEvidence].sort((left, right) => left.id.localeCompare(right.id))) {
    const node = document.nodes[evidence.nodeId];
    if (!node) {
      diagnostics.push(
        diagnostic({
          code: "MISSING_NODE",
          severity: "ERROR",
          message: `Evidence ${evidence.id} targets missing node ${evidence.nodeId}.`,
          recoverable: true,
          nodeId: evidence.nodeId,
          viewportId: evidence.viewportId,
        }),
      );
      continue;
    }
    add({
      node,
      target: evidence.target,
      override: evidence.override,
      properties: propertiesForOverride(evidence.override),
      confidence: evidence.confidence,
      rationale: evidence.rationale,
      source: "REFERENCE",
      evidenceId: evidence.id,
    });
  }

  const changes = [...accumulated.values()]
    .map((entry) => {
      const draft = {
        taskId: task.id,
        nodeId: entry.nodeId,
        target: entry.target,
        override: entry.override,
        properties: [...entry.properties].sort(),
        confidence: entry.confidence,
        evidenceIds: [...entry.evidenceIds].sort(),
        rationale: [...entry.rationale].sort(),
        source: entry.source,
      };
      const changeFingerprint = fingerprint(draft);
      return ResponsiveNodeProposalSchema.parse({
        ...draft,
        id: deterministicId("responsive-change", { changeFingerprint }),
        fingerprint: changeFingerprint,
      });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const mobileKeys = new Set(
    task.variants.filter((variant) => variant.category === "MOBILE").map((variant) => variant.breakpointId),
  );
  const regenerated =
    changes.some(
      (change) =>
        change.target.kind === "BREAKPOINT" && mobileKeys.has(change.target.key) && semanticMobileChange(change),
    ) || existingMobileIntent(document, mobileKeys);
  const mobileStrategy = regenerated ? "REGENERATED" : changes.length === 0 ? "BLOCKED" : "UNCHANGED";
  if (!regenerated)
    diagnostics.push(
      diagnostic({
        code: "MOBILE_SCALED_COPY",
        severity: "ERROR",
        message: "No semantic mobile regeneration rule could be established.",
        recoverable: true,
      }),
    );
  if (changes.length === 0)
    diagnostics.push(
      diagnostic({
        code: "NO_RESPONSIVE_CHANGE",
        severity: "WARNING",
        message: "No responsive changes were proposed.",
        recoverable: true,
      }),
    );

  const draft = {
    proposalVersion: RESPONSIVE_PROPOSAL_VERSION,
    taskId: task.id,
    projectId: task.projectId,
    documentId: task.documentId,
    expectedDocumentVersion: task.expectedDocumentVersion,
    sourceDocumentFingerprint: fingerprint(document),
    changes,
    diagnostics,
    mobileStrategy,
  };
  const proposalFingerprint = fingerprint(draft);
  return deepFreeze(
    ResponsiveProposalSchema.parse({
      ...draft,
      id: deterministicId("responsive-proposal", { proposalFingerprint }),
      proposalFingerprint,
    }),
  );
}
