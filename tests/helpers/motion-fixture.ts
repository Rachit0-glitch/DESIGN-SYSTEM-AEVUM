import { createEntityId, createTransform, fixtures, type CanonicalDesignDocument } from "@aevum/document-model";
import { createMotionTask, type MotionFrameSequence, type MotionTask } from "@aevum/motion-reconstruction";

export const MOTION_NOW = "2026-08-02T16:00:00.000Z";

export interface MotionFixture {
  readonly document: CanonicalDesignDocument;
  readonly task: MotionTask;
  readonly sequence: MotionFrameSequence;
  readonly targetId: string;
}

export function createMotionFixture(
  options: {
    readonly camera?: boolean;
    readonly missingFrame?: boolean;
    readonly maximumDeltaPerSecond?: number;
    readonly commandIntent?: MotionTask["commandIntent"];
    readonly document?: CanonicalDesignDocument;
  } = {},
): MotionFixture {
  const document = options.document ?? fixtures.landingPage();
  document.metadata.updatedAt = MOTION_NOW;
  let targetId: string;
  if (options.camera) {
    targetId = createEntityId("camera");
    document.cameras[targetId] = {
      id: targetId,
      name: "Reference camera",
      projection: "PERSPECTIVE",
      transform: createTransform(),
      focalLength: 50,
      nearClip: 0.1,
      farClip: 10_000,
      depthOfField: { enabled: false, aperture: 2.8, focusDistance: 10 },
    };
  } else {
    const target = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!target) throw new Error("Motion fixture requires a text node.");
    targetId = target.id;
  }
  const sourceAssetId = createEntityId("asset");
  const task = createMotionTask({
    projectId: document.metadata.projectId,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    sourceAssetIds: [sourceAssetId],
    sourceFormat: "MP4",
    targets: [
      {
        targetId,
        targetKind: options.camera ? "CAMERA" : "NODE",
        properties: options.camera ? ["POSITION", "ROTATION", "CAMERA"] : ["POSITION", "OPACITY", "VISIBILITY"],
      },
    ],
    commandIntent: options.commandIntent ?? { type: "CREATE" },
    timelineName: options.camera ? "Reconstructed camera motion" : "Reconstructed hero motion",
    frameRate: 1,
    minimumConfidence: 0.8,
    keyframeTolerance: 0.001,
    maximumDeltaPerSecond: options.maximumDeltaPerSecond ?? 1_000,
    deterministicSeed: 11,
    createdAt: MOTION_NOW,
    createdBy: { id: "phase11", type: "WORKER" },
  });
  const indexes = options.missingFrame ? [0, 2, 3] : [0, 1, 2];
  const sequence: MotionFrameSequence = {
    id: `frame-sequence:${"a".repeat(32)}`,
    adapterId: "deterministic-fixture",
    adapterVersion: "1.0.0",
    sourceAssetIds: [sourceAssetId],
    format: "MP4",
    width: 1920,
    height: 1080,
    frameRate: 1,
    duration: indexes.at(-1) ?? 0,
    frames: indexes.map((frameIndex, index) => ({
      index: frameIndex,
      time: frameIndex,
      observations: [
        {
          targetId,
          targetKind: options.camera ? "CAMERA" : "NODE",
          position: { x: index * 10, y: options.camera ? index * 2 : 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          ...(options.camera ? { focalLength: 50 + index * 5 } : { opacity: index / 2, visible: index < 2 }),
          confidence: 0.95,
          evidence: [`frame:${frameIndex}`, `target:${targetId}`],
        },
      ],
    })),
  };
  return { document, task, sequence, targetId };
}
