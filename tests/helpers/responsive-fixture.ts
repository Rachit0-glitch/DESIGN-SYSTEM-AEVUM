import {
  CANONICAL_3D_COORDINATE_SYSTEM,
  createEntityId,
  createTransform,
  fixtures,
  type CanonicalDesignDocument,
  type DesignNode,
} from "@aevum/document-model";
import {
  compileResponsiveTransaction,
  createResponsiveReconstructionTask,
  dryRunResponsiveProposal,
  generateResponsiveProposal,
  type ResponsiveReconstructionTask,
  type ResponsiveVariant,
} from "@aevum/responsive-reconstruction";
import { buildRenderGraph } from "@aevum/renderer-2d";
import { projectScene } from "@aevum/scene-runtime";
import { createValidationReferenceSnapshot, type ValidationReferenceSnapshot } from "@aevum/validation";

export const RESPONSIVE_NOW = "2026-08-02T12:00:00.000Z";

function variant(
  id: string,
  name: string,
  width: number,
  height: number,
  category: ResponsiveVariant["category"],
  orientation: ResponsiveVariant["orientation"],
  breakpointId: string,
  reducedMotion = false,
  qualityMode: ResponsiveVariant["qualityMode"] = "HIGH_QUALITY",
): ResponsiveVariant {
  return {
    id,
    name,
    width,
    height,
    deviceScaleFactor: category === "MOBILE" ? 3 : 1,
    category,
    orientation,
    reducedMotion,
    qualityMode,
    breakpointId,
    containerQueryIds: category === "MOBILE" ? ["compact-card"] : [],
  };
}

export interface ResponsiveFixture {
  readonly document: CanonicalDesignDocument;
  readonly task: ResponsiveReconstructionTask;
  readonly ids: {
    readonly page: string;
    readonly hero: string;
    readonly heading: string;
    readonly image: string;
    readonly scene: string;
    readonly desktopCamera: string;
    readonly mobileCamera: string;
  };
}

export function createResponsiveFixture(): ResponsiveFixture {
  const document = fixtures.assetDemo();
  document.metadata.name = "Responsive reconstruction fixture";
  document.metadata.updatedAt = RESPONSIVE_NOW;
  const page = Object.values(document.nodes).find((node) => node.type === "PAGE");
  const hero = Object.values(document.nodes).find((node) => node.type === "FRAME");
  const heading = Object.values(document.nodes).find((node) => node.type === "TEXT");
  const image = Object.values(document.nodes).find((node) => node.type === "IMAGE");
  if (page?.type !== "PAGE" || hero?.type !== "FRAME" || heading?.type !== "TEXT" || image?.type !== "IMAGE") {
    throw new Error("Responsive fixture requires page, frame, text, and image nodes.");
  }
  hero.layout = {
    type: "FLEX",
    direction: "ROW",
    wrap: "NO_WRAP",
    gap: { value: 24, unit: "PX", mode: "FIXED" },
    justifyContent: "SPACE_BETWEEN",
    alignItems: "CENTER",
  };
  hero.childIds = [image.id, heading.id];
  heading.runs = heading.runs.map((run) => ({
    ...run,
    style: { ...run.style, size: { value: 64, unit: "PX", mode: "FIXED" }, weight: 700 },
  }));
  heading.dimensions = {
    width: { value: 560, unit: "PX", mode: "FIXED" },
    height: { value: 96, unit: "PX", mode: "FIXED" },
  };
  heading.metadata.customData["aevum.responsive"] = { contentPriority: 100, motion: true };
  image.dimensions = {
    width: { value: 620, unit: "PX", mode: "FIXED" },
    height: { value: 520, unit: "PX", mode: "FIXED" },
  };
  image.metadata.customData["aevum.responsive"] = {
    contentPriority: 50,
    focalPoint: { x: 0.72, y: 0.4 },
  };

  const desktopCameraId = createEntityId("camera");
  const mobileCameraId = createEntityId("camera");
  document.cameras[desktopCameraId] = {
    id: desktopCameraId,
    name: "Desktop camera",
    projection: "PERSPECTIVE",
    transform: createTransform(),
    focalLength: 50,
    nearClip: 0.1,
    farClip: 1_000,
    depthOfField: { enabled: false, aperture: 2.8, focusDistance: 4, bladeCount: 6 },
  };
  document.cameras[mobileCameraId] = {
    id: mobileCameraId,
    name: "Mobile camera",
    projection: "PERSPECTIVE",
    transform: { ...createTransform(), position: { x: 0, y: 1, z: 8 } },
    focalLength: 70,
    nearClip: 0.1,
    farClip: 1_000,
    depthOfField: { enabled: false, aperture: 2.8, focusDistance: 4, bladeCount: 6 },
  };
  const sceneId = createEntityId("scene");
  const scene: DesignNode = {
    id: sceneId,
    type: "SCENE_3D",
    name: "Product scene",
    parentId: page.id,
    childIds: [],
    visible: true,
    locked: false,
    transform: createTransform(),
    sourceLinks: [],
    metadata: {
      tags: [],
      customData: {
        "aevum.responsive": {
          cameraByVariant: { MOBILE: mobileCameraId, mobile: mobileCameraId, "mobile-landscape": mobileCameraId },
        },
      },
    },
    activeCameraId: desktopCameraId,
    lightIds: [],
    coordinateSystem: CANONICAL_3D_COORDINATE_SYSTEM,
  };
  page.childIds.push(scene.id);
  document.nodes[scene.id] = scene;

  const timelineId = createEntityId("timeline");
  const trackId = createEntityId("track");
  const keyframeId = createEntityId("keyframe");
  document.timelines[timelineId] = {
    id: timelineId,
    version: "1.0.0",
    name: "Heading reveal",
    type: "TIME",
    duration: 1,
    frameRate: 60,
    timeScale: 1,
    loop: { enabled: false, count: 1, mode: "RESTART" },
    tracks: [
      {
        id: trackId,
        targetId: heading.id,
        property: "OPACITY",
        propertyPath: "transform.opacity",
        valueType: "NUMBER",
        muted: false,
        locked: false,
        layer: 0,
        keyframes: [
          {
            id: keyframeId,
            time: 0,
            value: 0,
            easing: { type: "EASE_OUT" },
            interpolation: "LINEAR",
            metadata: {},
          },
        ],
      },
    ],
    clips: [],
    markers: [],
    triggers: [],
    events: [],
    labels: {},
    metadata: {},
  };

  const desktopId = document.settings.defaultViewportId;
  const tabletId = createEntityId("viewport");
  const mobileId = createEntityId("viewport");
  const landscapeId = createEntityId("viewport");
  const variants = [
    variant(desktopId, "Desktop", 1440, 900, "DESKTOP", "LANDSCAPE", "desktop", false, "MAXIMUM_FIDELITY"),
    variant(tabletId, "Tablet", 1024, 768, "TABLET", "LANDSCAPE", "tablet"),
    variant(mobileId, "Mobile portrait", 390, 844, "MOBILE", "PORTRAIT", "mobile", false, "DRAFT"),
    variant(
      landscapeId,
      "Mobile landscape reduced motion",
      844,
      390,
      "MOBILE",
      "LANDSCAPE",
      "mobile-landscape",
      true,
      "DRAFT",
    ),
  ];
  document.settings.viewports = Object.fromEntries(
    variants.map((entry) => [
      entry.id,
      {
        id: entry.id,
        name: entry.name,
        width: entry.width,
        height: entry.height,
        deviceScaleFactor: entry.deviceScaleFactor,
        orientation: entry.orientation,
        category: entry.category,
      },
    ]),
  );
  const sourceAsset = document.assets[image.assetId];
  if (!sourceAsset) throw new Error("Responsive fixture source asset is missing.");
  const referenceId = createEntityId("reference");
  document.references[referenceId] = {
    id: referenceId,
    assetId: sourceAsset.id,
    type: "WEBSITE_RENDER",
    role: "PRIMARY",
    viewportId: desktopId,
    regions: [],
    metadata: {},
  };
  const task = createResponsiveReconstructionTask({
    projectId: document.metadata.projectId,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    sourceViewportId: desktopId,
    variants,
    referenceEvidence: [],
    protectedProperties: [],
    minimumTextSizePx: 16,
    minimumConfidence: 0.5,
    validateEveryVariant: true,
    deterministicSeed: 9,
    createdAt: RESPONSIVE_NOW,
    createdBy: document.metadata.updatedBy,
  });
  return {
    document,
    task,
    ids: {
      page: page.id,
      hero: hero.id,
      heading: heading.id,
      image: image.id,
      scene: scene.id,
      desktopCamera: desktopCameraId,
      mobileCamera: mobileCameraId,
    },
  };
}

export function createResponsiveCandidate(fixture = createResponsiveFixture()) {
  const proposal = generateResponsiveProposal(fixture.task, fixture.document);
  const plan = compileResponsiveTransaction({ proposal, document: fixture.document, timestamp: RESPONSIVE_NOW });
  const dryRun = dryRunResponsiveProposal(plan, fixture.document);
  if (!dryRun.success) throw new Error(dryRun.message);
  return { ...fixture, proposal, plan, candidateDocument: dryRun.resultingDocument };
}

export function createResponsiveReferences(
  document: CanonicalDesignDocument,
  task: ResponsiveReconstructionTask,
): Record<string, ValidationReferenceSnapshot> {
  const sourceAsset = Object.values(document.assets).find((asset) => asset.type === "IMAGE");
  const reference = Object.values(document.references)[0];
  if (!sourceAsset || !reference) throw new Error("Responsive references require a source image and reference.");
  return Object.fromEntries(
    task.variants.map((variantEntry) => {
      const viewport = {
        id: variantEntry.id,
        width: variantEntry.width,
        height: variantEntry.height,
        deviceScaleFactor: variantEntry.deviceScaleFactor,
        orientation: variantEntry.orientation,
        category: variantEntry.category,
        reducedMotion: variantEntry.reducedMotion,
        breakpointId: variantEntry.breakpointId,
        containerQueryIds: variantEntry.containerQueryIds,
        qualityMode: variantEntry.qualityMode,
      };
      const projection = projectScene(document, viewport, { strictMode: true });
      const graph = buildRenderGraph(projection);
      const renderable = [...projection.nodes.values()].filter((node) => graph.paintOrder.includes(node.id));
      const regionId = new Map(renderable.map((node) => [node.id, `responsive-region:${variantEntry.id}:${node.id}`]));
      const snapshot = createValidationReferenceSnapshot({
        referenceId: reference.id,
        sourceAssetId: sourceAsset.id,
        sourceDimensions: { width: variantEntry.width, height: variantEntry.height },
        regions: renderable.map((node) => ({
          id: regionId.get(node.id) as string,
          sourceRegionId: `source:${variantEntry.id}:${node.sourceNode.id}`,
          sourceNodeId: node.sourceNode.id,
          sourceAssetId: sourceAsset.id,
          ...(node.parentId && regionId.has(node.parentId) ? { parentRegionId: regionId.get(node.parentId) } : {}),
          category: node.type,
          bounds: {
            x: node.worldTransform.position.x,
            y: node.worldTransform.position.y,
            width: node.dimensions?.width.unit === "PX" ? node.dimensions.width.value : 0,
            height: node.dimensions?.height.unit === "PX" ? node.dimensions.height.value : 0,
          },
          expectedNode: node.resolvedNode,
          expectedVisual: {},
          priority: node.type === "TEXT",
          confidence: 1,
        })),
        expectedPaintOrderNodeIds: graph.paintOrder.map(
          (runtimeId) => projection.nodes.get(runtimeId)?.sourceNode.id ?? runtimeId,
        ),
      });
      return [variantEntry.id, snapshot];
    }),
  );
}
