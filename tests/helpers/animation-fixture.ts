import { createEntityId, type AnimationStateMachine, type Timeline } from "@aevum/document-model";

export function createAnimationTimeline(targetId: string, overrides: Partial<Timeline> = {}): Timeline {
  const timelineId = createEntityId("timeline");
  return {
    id: timelineId,
    version: "1.0.0",
    name: "Hero motion",
    type: "TIME",
    duration: 2,
    frameRate: 60,
    timeScale: 1,
    loop: { enabled: false, count: 1, mode: "RESTART" },
    tracks: [
      {
        id: createEntityId("track"),
        targetId,
        property: "POSITION",
        propertyPath: "transform.position",
        valueType: "VECTOR",
        muted: false,
        locked: false,
        layer: 0,
        keyframes: [
          {
            id: createEntityId("keyframe"),
            time: 0,
            value: { x: 0, y: 0, z: 0 },
            easing: { type: "LINEAR" },
            interpolation: "LINEAR",
            metadata: {},
          },
          {
            id: createEntityId("keyframe"),
            time: 2,
            value: { x: 100, y: 40, z: 0 },
            easing: { type: "LINEAR" },
            interpolation: "LINEAR",
            metadata: {},
          },
        ],
      },
      {
        id: createEntityId("track"),
        targetId,
        property: "OPACITY",
        propertyPath: "transform.opacity",
        valueType: "NUMBER",
        muted: false,
        locked: false,
        layer: 1,
        keyframes: [
          {
            id: createEntityId("keyframe"),
            time: 0,
            value: 0,
            easing: { type: "EASE_IN_OUT" },
            interpolation: "BEZIER",
            metadata: {},
          },
          {
            id: createEntityId("keyframe"),
            time: 2,
            value: 1,
            easing: { type: "LINEAR" },
            interpolation: "LINEAR",
            metadata: {},
          },
        ],
      },
    ],
    clips: [],
    markers: [{ id: createEntityId("marker"), name: "Midpoint", time: 1 }],
    triggers: [{ id: createEntityId("trigger"), type: "LOAD", event: "ready" }],
    events: [{ id: createEntityId("event"), name: "Settled", time: 2, payload: {} }],
    labels: { midpoint: 1 },
    metadata: {},
    ...overrides,
  };
}

export function createAnimationStateMachine(timelineId: string): AnimationStateMachine {
  const idleId = createEntityId("state");
  const activeId = createEntityId("state");
  const triggerId = createEntityId("trigger");
  return {
    id: createEntityId("machine"),
    version: "1.0.0",
    name: "Interaction states",
    initialStateId: idleId,
    states: [
      { id: idleId, name: "Idle", entryActions: [], exitActions: [], metadata: {} },
      {
        id: activeId,
        name: "Active",
        timelineId,
        entryActions: [{ type: "SET_VARIABLE", name: "active", value: true }],
        exitActions: [],
        metadata: {},
      },
    ],
    transitions: [
      {
        id: createEntityId("transition"),
        fromStateId: idleId,
        toStateId: activeId,
        triggerId,
        guard: { mode: "ALL", conditions: [{ variable: "enabled", operator: "TRUTHY" }] },
        actions: [{ type: "EMIT_EVENT", name: "activated" }],
        priority: 10,
      },
    ],
    triggers: [{ id: triggerId, type: "CLICK", event: "activate" }],
    metadata: {},
  };
}
