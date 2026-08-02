import { createEntityId } from "@aevum/document-model";
import {
  MotionTaskSchema,
  analyzeMotion,
  createDeterministicFrameProvider,
  createMotionTask,
  deserializeMotionTask,
  detectKeyframes,
  serializeMotionTask,
  validateMotion,
} from "@aevum/motion-reconstruction";
import { describe, expect, it } from "vitest";
import { createMotionFixture, MOTION_NOW } from "../helpers/motion-fixture.js";

describe("motion reconstruction", () => {
  it("creates immutable deterministic tasks and enforces source-format cardinality", () => {
    const fixture = createMotionFixture();
    const again = createMotionTask({
      ...fixture.task,
      id: undefined,
      taskVersion: undefined,
    });
    expect(again.id).toBe(fixture.task.id);
    expect(Object.isFrozen(fixture.task)).toBe(true);
    expect(deserializeMotionTask(serializeMotionTask(fixture.task))).toEqual(fixture.task);
    expect(
      MotionTaskSchema.safeParse({
        ...fixture.task,
        sourceFormat: "IMAGE_SEQUENCE",
        sourceAssetIds: [fixture.task.sourceAssetIds[0]],
      }).success,
    ).toBe(false);
  });

  it("detects editable property tracks, visibility changes, and deterministic keyframes", () => {
    const fixture = createMotionFixture();
    const provider = createDeterministicFrameProvider(fixture.sequence);
    const first = analyzeMotion(fixture.task, provider);
    const second = analyzeMotion(fixture.task, provider);
    const detected = detectKeyframes(first);
    expect(first).toEqual(second);
    expect(first.tracks.map((track) => track.property)).toEqual(["POSITION", "OPACITY", "VISIBILITY"]);
    expect(first.tracks.every((track) => track.sourceFrames.length === 3 && track.evidence.length > 0)).toBe(true);
    expect(detected.keyframes.some((entry) => entry.reason === "VISIBILITY_CHANGE")).toBe(true);
    expect(detected.keyframes.every((entry) => entry.confidence === 0.95)).toBe(true);
  });

  it("classifies camera motion and retains confidence evidence", () => {
    const fixture = createMotionFixture({ camera: true });
    const analysis = analyzeMotion(fixture.task, createDeterministicFrameProvider(fixture.sequence));
    expect(analysis.cameraMotions).toEqual([
      expect.objectContaining({
        cameraId: fixture.targetId,
        motion: "ZOOM",
        confidence: 0.95,
        sourceFrames: [0, 1, 2],
      }),
    ]);
    expect(analysis.tracks.map((track) => track.property)).toEqual(["POSITION", "ROTATION", "CAMERA"]);
  });

  it("attributes missing frames and impossible interpolation precisely", () => {
    const fixture = createMotionFixture({ missingFrame: true, maximumDeltaPerSecond: 1 });
    const provider = createDeterministicFrameProvider(fixture.sequence);
    const analysis = analyzeMotion(fixture.task, provider);
    const validation = validateMotion({
      task: fixture.task,
      sequence: fixture.sequence,
      document: fixture.document,
      analysis,
    });
    expect(validation.success).toBe(false);
    expect(validation.diagnostics.map((entry) => entry.code)).toContain("MISSING_FRAME");
    expect(validation.diagnostics.map((entry) => entry.code)).toContain("IMPOSSIBLE_INTERPOLATION");
    expect(validation.diagnostics.find((entry) => entry.code === "MISSING_FRAME")?.frameIndexes).toEqual([2]);
  });

  it("validates the public MP4, MOV, WebM, GIF, and image-sequence task formats", () => {
    const fixture = createMotionFixture();
    for (const sourceFormat of ["MP4", "MOV", "WEBM", "GIF"] as const) {
      expect(MotionTaskSchema.safeParse({ ...fixture.task, sourceFormat }).success).toBe(true);
    }
    expect(
      MotionTaskSchema.safeParse({
        ...fixture.task,
        sourceFormat: "IMAGE_SEQUENCE",
        sourceAssetIds: [fixture.task.sourceAssetIds[0], createEntityId("asset")],
        createdAt: MOTION_NOW,
      }).success,
    ).toBe(true);
  });
});
