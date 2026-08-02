import {
  createAnimationEngine,
  createStateMachine,
  createTimeline,
  evaluateAnimationState,
  evaluateEasing,
  evaluateTimeline,
  validateStateMachine,
  validateTimeline,
} from "@aevum/animation-core";
import { createEntityId, fixtures } from "@aevum/document-model";
import { describe, expect, it } from "vitest";
import { createAnimationStateMachine, createAnimationTimeline } from "../helpers/animation-fixture.js";

function fixtureTimeline() {
  const document = fixtures.landingPage();
  const target = Object.values(document.nodes).find((node) => node.type === "TEXT");
  if (!target) throw new Error("Animation fixture requires a text node.");
  return createAnimationTimeline(target.id);
}

describe("Animation Core", () => {
  it("creates immutable, versioned timelines without mutating input", () => {
    const input = fixtureTimeline();
    const timeline = createTimeline(input);
    expect(timeline).toEqual(input);
    expect(Object.isFrozen(timeline)).toBe(true);
    expect(Object.isFrozen(timeline.tracks[0]?.keyframes)).toBe(true);
    expect(() => ((timeline as { name: string }).name = "Changed")).toThrow();
  });

  it("interpolates numbers and structured vectors at arbitrary fixed time", () => {
    const timeline = fixtureTimeline();
    const result = evaluateTimeline(timeline, 1);
    const target = timeline.tracks[0]?.targetId ?? "";
    expect(result.targetValues[target]?.["transform.position"]).toEqual({ x: 50, y: 20, z: 0 });
    expect(result.targetValues[target]?.["transform.opacity"]).toBeCloseTo(0.5, 5);
    expect(result.progress).toBe(0.5);
    expect(result.markerIds).toHaveLength(1);
  });

  it("evaluates canonical easing, steps, and spring metadata deterministically", () => {
    const easings = [
      { type: "LINEAR" as const },
      { type: "EASE" as const },
      { type: "CUBIC_BEZIER" as const, x1: 0.2, y1: 0, x2: 0.8, y2: 1 },
      { type: "STEPS" as const, count: 4, position: "END" as const },
      {
        type: "SPRING" as const,
        mass: 1,
        stiffness: 100,
        damping: 10,
        initialVelocity: 0,
        restSpeed: 0.01,
        restDelta: 0.01,
        overshootClamping: false,
      },
    ];
    expect(easings.map((easing) => evaluateEasing(easing, 0.5))).toEqual(
      easings.map((easing) => evaluateEasing(easing, 0.5)),
    );
    expect(evaluateEasing(easings[3] as (typeof easings)[3], 0.6)).toBe(0.5);
  });

  it("supports every timeline driver with normalized progress", () => {
    const types = ["SCROLL", "TIME", "HOVER", "CLICK", "FOCUS", "LOAD", "VIEWPORT", "MEDIA", "MANUAL", "LOOP"] as const;
    for (const type of types) {
      const timeline = fixtureTimeline();
      const evaluated = evaluateTimeline({ ...timeline, type }, { progress: 0.25, active: true });
      expect(evaluated.effectiveTime).toBe(0.5);
      expect(evaluated.playbackState).toBe("RUNNING");
    }
  });

  it("selects canonical reduced-motion alternatives and disables motion deterministically", () => {
    const base = fixtureTimeline();
    const alternate = createAnimationTimeline(base.tracks[0]?.targetId ?? "", { duration: 0.2 });
    const linked = { ...base, reducedMotionTimelineId: alternate.id };
    const reduced = evaluateTimeline(linked, {
      time: 0.1,
      reducedMotion: { behavior: "REDUCE", durationScale: 0.2 },
      timelineRegistry: { [linked.id]: linked, [alternate.id]: alternate },
    });
    const disabled = evaluateTimeline(base, {
      time: 0,
      reducedMotion: { behavior: "DISABLE", durationScale: 0 },
    });
    expect(reduced.evaluatedTimelineId).toBe(alternate.id);
    expect(disabled.effectiveTime).toBe(base.duration);
    expect(disabled.playbackState).toBe("COMPLETED");
  });

  it("evaluates guarded state transitions, actions, and animation states", () => {
    const timeline = fixtureTimeline();
    const machine = createStateMachine(createAnimationStateMachine(timeline.id));
    const trigger = machine.triggers[0];
    const result = evaluateAnimationState(machine, {
      triggerId: trigger?.id,
      variables: { enabled: true },
    });
    expect(result.currentStateId).not.toBe(machine.initialStateId);
    expect(result.timelineId).toBe(timeline.id);
    expect(result.variables.active).toBe(true);
    expect(result.actions.map((action) => action.type)).toEqual(["EMIT_EVENT", "SET_VARIABLE"]);
  });

  it("detects invalid keyframes, overlapping clips, loops, transitions, and circular states", () => {
    const timeline = fixtureTimeline();
    const track = timeline.tracks[0];
    if (!track) throw new Error("Validation fixture requires a track.");
    const trackId = track.id;
    const invalid = {
      ...timeline,
      loop: { enabled: true, count: null, mode: "RESTART" as const },
      tracks: [{ ...track, keyframes: [...track.keyframes].reverse() }],
      clips: [
        {
          id: createEntityId("clip"),
          name: "One",
          start: 0,
          end: 1.5,
          offset: 0,
          playbackRate: 1,
          trackIds: [trackId],
        },
        { id: createEntityId("clip"), name: "Two", start: 1, end: 2, offset: 0, playbackRate: 1, trackIds: [trackId] },
      ],
    };
    const timelineValidation = validateTimeline(invalid);
    expect(timelineValidation.success).toBe(false);
    expect(timelineValidation.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["UNSORTED_KEYFRAMES", "OVERLAPPING_CLIPS", "INFINITE_LOOP"]),
    );

    const machine = createAnimationStateMachine(timeline.id);
    const state = machine.states[0];
    if (!state) throw new Error("State-machine validation fixture requires a state.");
    const machineValidation = validateStateMachine({
      ...machine,
      transitions: [
        {
          id: createEntityId("transition"),
          fromStateId: state.id,
          toStateId: state.id,
          actions: [],
          priority: 0,
        },
      ],
    });
    expect(machineValidation.success).toBe(false);
    expect(machineValidation.diagnostics.some((entry) => entry.code === "CIRCULAR_STATE")).toBe(true);
  });

  it("returns identical fingerprints and values without mutating canonical input", () => {
    const timeline = fixtureTimeline();
    const before = JSON.stringify(timeline);
    const engine = createAnimationEngine();
    const first = engine.evaluateTimeline(timeline, { time: 1.25, playbackState: "REVERSED" });
    const second = engine.evaluateTimeline(timeline, { time: 1.25, playbackState: "REVERSED" });
    expect(first).toEqual(second);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.playbackState).toBe("REVERSED");
    expect(JSON.stringify(timeline)).toBe(before);
  });
});
