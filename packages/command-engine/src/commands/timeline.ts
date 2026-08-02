import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  CreateTimelineCommandSchema,
  DeleteTimelineCommandSchema,
  UpdateTimelineCommandSchema,
  type CreateTimelineCommand,
  type DeleteTimelineCommand,
  type UpdateTimelineCommand,
} from "../schemas.js";

function assertTargetsExist(
  source: ReturnType<typeof requireDocument>,
  timeline: CreateTimelineCommand["payload"]["timeline"],
): void {
  for (const track of timeline.tracks) {
    if (
      !source.nodes[track.targetId] &&
      !source.cameras[track.targetId] &&
      !source.lights[track.targetId] &&
      !source.materials[track.targetId]
    ) {
      throw commandError("REFERENCE_MISSING", `Animation target ${track.targetId} does not exist.`, {
        timelineId: timeline.id,
        trackId: track.id,
        targetId: track.targetId,
      });
    }
  }
  if (timeline.reducedMotionTimelineId && !source.timelines[timeline.reducedMotionTimelineId]) {
    throw commandError(
      "REFERENCE_MISSING",
      `Reduced-motion timeline ${timeline.reducedMotionTimelineId} does not exist.`,
      {
        timelineId: timeline.id,
        reducedMotionTimelineId: timeline.reducedMotionTimelineId,
      },
    );
  }
}

registerCommand<CreateTimelineCommand>({
  type: "timeline.create",
  schema: CreateTimelineCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const timeline = command.payload.timeline;
    if (source.timelines[timeline.id]) {
      throw commandError("DUPLICATE_ID", `Timeline ${timeline.id} already exists.`, { timelineId: timeline.id });
    }
    assertTargetsExist(source, timeline);
  },
  apply(document, command) {
    const source = requireDocument(document);
    const timeline = command.payload.timeline;
    return {
      document: { ...source, timelines: { ...source.timelines, [timeline.id]: timeline } },
      changes: { added: [timeline.id] },
      event: { type: "TimelineCreated", entityIds: [timeline.id] },
    };
  },
});

registerCommand<UpdateTimelineCommand>({
  type: "timeline.update",
  schema: UpdateTimelineCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const timeline = command.payload.timeline;
    if (!source.timelines[timeline.id]) {
      throw commandError("REFERENCE_MISSING", `Timeline ${timeline.id} does not exist.`, { timelineId: timeline.id });
    }
    assertTargetsExist(source, timeline);
  },
  apply(document, command) {
    const source = requireDocument(document);
    const timeline = command.payload.timeline;
    return {
      document: { ...source, timelines: { ...source.timelines, [timeline.id]: timeline } },
      changes: { updated: [timeline.id] },
      event: { type: "TimelineUpdated", entityIds: [timeline.id] },
    };
  },
});

registerCommand<DeleteTimelineCommand>({
  type: "timeline.delete",
  schema: DeleteTimelineCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const timelineId = command.payload.timelineId;
    if (!source.timelines[timelineId]) {
      throw commandError("REFERENCE_MISSING", `Timeline ${timelineId} does not exist.`, { timelineId });
    }
    const reducedMotionOwner = Object.values(source.timelines).find(
      (timeline) => timeline.reducedMotionTimelineId === timelineId,
    );
    const stateOwner = Object.values(source.stateMachines).find((machine) =>
      machine.states.some((state) => state.timelineId === timelineId),
    );
    if (reducedMotionOwner || stateOwner) {
      throw commandError("CONFLICT_ERROR", `Timeline ${timelineId} is still referenced.`, {
        timelineId,
        ...(reducedMotionOwner ? { reducedMotionOwnerId: reducedMotionOwner.id } : {}),
        ...(stateOwner ? { stateMachineId: stateOwner.id } : {}),
      });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const timelines = { ...source.timelines };
    delete timelines[command.payload.timelineId];
    return {
      document: { ...source, timelines },
      changes: { removed: [command.payload.timelineId] },
      event: { type: "TimelineDeleted", entityIds: [command.payload.timelineId] },
    };
  },
});
