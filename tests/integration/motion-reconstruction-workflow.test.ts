import { createMotionReconstructionWorker } from "@aevum/motion-reconstruction-worker";
import { executeCommand } from "@aevum/command-engine";
import { evaluateTimeline } from "@aevum/animation-core";
import { createDeterministicFrameProvider, createMotionEngine } from "@aevum/motion-reconstruction";
import { describe, expect, it } from "vitest";
import { createMotionFixture, MOTION_NOW } from "../helpers/motion-fixture.js";

describe("motion reconstruction workflow", () => {
  it("builds, validates, executes, and evaluates a canonical timeline deterministically", () => {
    const fixture = createMotionFixture();
    const engine = createMotionEngine({ frameProvider: createDeterministicFrameProvider(fixture.sequence) });
    const first = engine.run({ task: fixture.task, document: fixture.document, timestamp: MOTION_NOW });
    const second = engine.run({ task: fixture.task, document: fixture.document, timestamp: MOTION_NOW });
    expect(first).toEqual(second);
    expect(first.validation.success).toBe(true);
    expect(first.report.status).toBe("VALIDATED");
    expect(first.proposal.commandPlan.commands[0]?.type).toBe("timeline.create");
    const command = first.proposal.commandPlan.commands[0];
    if (!command || !first.proposal.timeline) throw new Error("Expected a timeline-create proposal.");
    const committed = executeCommand(fixture.document, command);
    const persisted = committed.newDocument.timelines[first.proposal.timeline.id];
    if (!persisted) throw new Error("Generated timeline was not persisted by the Command Engine.");
    const evaluation = evaluateTimeline(persisted, 1);
    expect(evaluation.targetValues[fixture.targetId]?.["transform.position"]).toEqual({ x: 10, y: 0, z: 0 });
    expect(evaluation.targetValues[fixture.targetId]?.["transform.opacity"]).toBe(0.5);
    expect(fixture.document.timelines[persisted.id]).toBeUndefined();
    expect(committed.auditRecord.commandTypes).toEqual(["timeline.create"]);
  });

  it("produces executable update and delete plans without mutating directly", () => {
    const initial = createMotionFixture();
    const engine = createMotionEngine({ frameProvider: createDeterministicFrameProvider(initial.sequence) });
    const created = engine.run({ task: initial.task, document: initial.document, timestamp: MOTION_NOW });
    const createCommand = created.proposal.commandPlan.commands[0];
    if (!createCommand || !created.proposal.timeline) throw new Error("Expected create proposal.");
    const afterCreate = executeCommand(initial.document, createCommand).newDocument;

    const updateFixture = createMotionFixture({
      document: afterCreate,
      commandIntent: { type: "UPDATE", timelineId: created.proposal.timeline.id },
    });
    const updateEngine = createMotionEngine({
      frameProvider: createDeterministicFrameProvider(updateFixture.sequence),
    });
    const updated = updateEngine.run({ task: updateFixture.task, document: afterCreate, timestamp: MOTION_NOW });
    const updateCommand = updated.proposal.commandPlan.commands[0];
    if (!updateCommand || !updated.proposal.timeline) throw new Error("Expected update proposal.");
    expect(updateCommand.type).toBe("timeline.update");
    const afterUpdate = executeCommand(afterCreate, updateCommand).newDocument;
    expect(afterUpdate.timelines[created.proposal.timeline.id]?.version).toBe("1.0.1");

    const deleteFixture = createMotionFixture({
      document: afterUpdate,
      commandIntent: { type: "DELETE", timelineId: created.proposal.timeline.id },
    });
    const deleteEngine = createMotionEngine({
      frameProvider: createDeterministicFrameProvider(deleteFixture.sequence),
    });
    const deleted = deleteEngine.run({ task: deleteFixture.task, document: afterUpdate, timestamp: MOTION_NOW });
    const deleteCommand = deleted.proposal.commandPlan.commands[0];
    if (!deleteCommand) throw new Error("Expected delete proposal.");
    expect(deleted.proposal.timeline).toBeUndefined();
    expect(deleteCommand.type).toBe("timeline.delete");
    expect(
      executeCommand(afterUpdate, deleteCommand).newDocument.timelines[created.proposal.timeline.id],
    ).toBeUndefined();
  });

  it("runs the inactive worker with no listener, persistence, or deployment side effects", () => {
    const fixture = createMotionFixture();
    const worker = createMotionReconstructionWorker();
    const input = {
      id: "motion-job-1",
      task: fixture.task,
      document: fixture.document,
      frameSequence: fixture.sequence,
      timestamp: MOTION_NOW,
    };
    const first = worker.execute(input);
    const second = worker.execute(input);
    expect(first).toEqual(second);
    expect(first.success).toBe(true);
    expect(first.result.report.runtimeSamples).toHaveLength(3);
  });
});
