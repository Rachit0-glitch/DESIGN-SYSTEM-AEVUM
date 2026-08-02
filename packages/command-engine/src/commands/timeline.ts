import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import { CreateTimelineCommandSchema, type CreateTimelineCommand } from "../schemas.js";

registerCommand<CreateTimelineCommand>({
  type: "timeline.create",
  schema: CreateTimelineCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const timeline = command.payload.timeline;
    if (source.timelines[timeline.id]) {
      throw commandError("DUPLICATE_ID", `Timeline ${timeline.id} already exists.`, { timelineId: timeline.id });
    }
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
