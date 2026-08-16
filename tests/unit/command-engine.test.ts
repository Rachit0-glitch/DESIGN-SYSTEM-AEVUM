import {
  type Command,
  CommandEngineError,
  CURRENT_COMMAND_VERSION,
  createCommandId,
  createTransactionId,
  deserializeCommand,
  executeCommand,
  listCommands,
  serializeCommand,
  validateCommand,
} from "@aevum/command-engine";
import {
  type CanonicalDesignDocument,
  createAsset,
  createDocument,
  createEntityId,
  createFrame,
  fixtures,
  serialize,
  ValidationRecordSchema,
  validateDocument,
} from "@aevum/document-model";
import { buildMechanicalChainTemplate, buildRigNodes } from "@aevum/rigging";
import { describe, expect, it } from "vitest";

const TIME = "2026-08-01T01:00:00.000Z";
const actor = { id: "user_phase2", type: "USER" as const, displayName: "Phase 2 tester" };

function base(document: CanonicalDesignDocument, transactionId = createTransactionId()) {
  return {
    id: createCommandId(),
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    timestamp: TIME,
    actor,
    correlationId: "corr_command_test",
    transactionId,
  } as const;
}

function expectCommandError(action: () => unknown, code: CommandEngineError["code"]): void {
  try {
    action();
    throw new Error("Expected command to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(CommandEngineError);
    expect((error as CommandEngineError).code).toBe(code);
  }
}

describe("Command Engine", () => {
  it("self-registers the complete canonical command surface", () => {
    expect(listCommands()).toEqual([
      "asset.register",
      "asset.remove",
      "camera.create",
      "camera.update",
      "cinematic.apply_sequence",
      "document.create",
      "document.rename",
      "light.update",
      "lighting.apply_rig",
      "lighting.register_bake",
      "material.update",
      "node.create",
      "node.delete",
      "node.duplicate",
      "node.move",
      "node.reparent",
      "node.update",
      "page.create",
      "page.delete",
      "page.rename",
      "reference.register",
      "reference.update",
      "rig.create",
      "scene3d.import",
      "timeline.create",
      "timeline.delete",
      "timeline.update",
      "token.register",
      "validation.record",
    ]);
  });

  it("creates a document through the same validated transaction path", () => {
    const document = createDocument({ name: "Created by command", now: TIME, actorId: actor.id });
    const command: Command = {
      ...base(document),
      expectedDocumentVersion: 0,
      type: "document.create",
      payload: { document },
    };
    const result = executeCommand(null, command);

    expect(result.oldDocument).toBeNull();
    expect(result.newDocument.documentVersion).toBe(1);
    expect(result.events[0]?.type).toBe("DocumentCreated");
    expect(result.auditRecord.result).toBe("SUCCEEDED");
  });

  it("creates a node immutably while preserving unrelated registry identity", () => {
    const document = fixtures.landingPage();
    const pageId = document.pages[0];
    if (!pageId) throw new Error("Landing fixture requires a page.");
    const frame = createFrame(pageId, "Added frame");
    const command: Command = { ...base(document), type: "node.create", payload: { node: frame } };
    const original = serialize(document);

    const result = executeCommand(document, command);

    expect(serialize(document)).toBe(original);
    expect(result.oldDocument).toBe(document);
    expect(result.newDocument).not.toBe(document);
    expect(result.newDocument.assets).toBe(document.assets);
    expect(result.newDocument.typography).toBe(document.typography);
    expect(result.newDocument.nodes[frame.id]).toEqual(frame);
    expect(result.newDocument.documentVersion).toBe(document.documentVersion + 1);
    expect(validateDocument(result.newDocument).success).toBe(true);
  });

  it("serializes, deserializes, and freezes validated commands", () => {
    const document = fixtures.landingPage();
    const command: Command = { ...base(document), type: "document.rename", payload: { name: "Serialized" } };
    const restored = deserializeCommand(serializeCommand(command, true));

    expect(restored).toEqual(command);
    expect(Object.isFrozen(restored)).toBe(true);
    expect(Object.isFrozen(restored.payload)).toBe(true);
    expect(validateCommand(command)).toEqual(command);
  });

  it("rejects malformed payloads and unknown commands before execution", () => {
    const document = fixtures.empty();
    expectCommandError(
      () => executeCommand(document, { ...base(document), type: "document.rename", payload: { name: "" } }),
      "COMMAND_VALIDATION_ERROR",
    );
    expectCommandError(
      () => executeCommand(document, { ...base(document), type: "renderer.mutate", payload: {} }),
      "UNKNOWN_COMMAND",
    );
  });

  it("rejects optimistic concurrency mismatches without version changes", () => {
    const document = fixtures.empty();
    const command = {
      ...base(document),
      expectedDocumentVersion: 99,
      type: "document.rename",
      payload: { name: "Conflict" },
    };
    expectCommandError(() => executeCommand(document, command), "VERSION_MISMATCH");
    expect(document.documentVersion).toBe(1);
  });

  it("registers and removes an unreferenced asset through commands", () => {
    const document = fixtures.empty();
    const asset = createAsset({
      type: "IMAGE",
      name: "Command asset",
      hash: `sha256:${"c".repeat(64)}`,
      uri: "assets/command.png",
      mimeType: "image/png",
    });
    const registered = executeCommand(document, {
      ...base(document),
      type: "asset.register",
      payload: { asset },
    }).newDocument;
    const removed = executeCommand(registered, {
      ...base(registered),
      type: "asset.remove",
      payload: { assetId: asset.id },
    }).newDocument;

    expect(registered.assets[asset.id]).toEqual(asset);
    expect(removed.assets[asset.id]).toBeUndefined();
  });

  it("rejects asset.remove for an asset still referenced by a real Reference record (Block G forensic fix — no dangling assetId pointers)", () => {
    const document = fixtures.empty();
    const asset = createAsset({
      type: "IMAGE",
      name: "In-use asset",
      hash: `sha256:${"d".repeat(64)}`,
      uri: "assets/in-use.png",
      mimeType: "image/png",
    });
    const withAsset = executeCommand(document, {
      ...base(document),
      type: "asset.register",
      payload: { asset },
    }).newDocument;
    const reference = {
      id: createEntityId("reference"),
      assetId: asset.id,
      type: "IMAGE" as const,
      role: "PRIMARY" as const,
      regions: [],
      metadata: {},
    };
    const withReference = executeCommand(withAsset, {
      ...base(withAsset),
      type: "reference.register",
      payload: { reference },
    }).newDocument;

    expectCommandError(
      () =>
        executeCommand(withReference, {
          ...base(withReference),
          type: "asset.remove",
          payload: { assetId: asset.id },
        }),
      "CONFLICT_ERROR",
    );
    expect(withReference.assets[asset.id]).toEqual(asset);
  });

  it("records a real fidelity ValidationRecord into document.validations (Block D8)", () => {
    const document = fixtures.empty();
    const record = ValidationRecordSchema.parse({
      id: createEntityId("validation"),
      createdAt: TIME,
      status: "WARNING",
      scores: { RASTER: 0.82 },
      referenceIds: [],
      heatmapAssetIds: [],
      metadata: {},
    });
    const result = executeCommand(document, {
      ...base(document),
      type: "validation.record",
      payload: { record },
    }).newDocument;

    expect(result.validations[record.id]).toEqual(record);
    expect(document.validations[record.id]).toBeUndefined();
  });

  it("replaces an existing reference's underlying asset via reference.update (Block D completeness)", () => {
    const document = fixtures.empty();
    const originalAsset = createAsset({
      type: "IMAGE",
      name: "Original reference",
      hash: `sha256:${"1".repeat(64)}`,
      uri: "assets/original.png",
      mimeType: "image/png",
    });
    const replacementAsset = createAsset({
      type: "IMAGE",
      name: "Replacement reference",
      hash: `sha256:${"2".repeat(64)}`,
      uri: "assets/replacement.png",
      mimeType: "image/png",
    });
    const withOriginalAsset = executeCommand(document, {
      ...base(document),
      type: "asset.register",
      payload: { asset: originalAsset },
    }).newDocument;
    const withAssets = executeCommand(withOriginalAsset, {
      ...base(withOriginalAsset),
      type: "asset.register",
      payload: { asset: replacementAsset },
    }).newDocument;

    const reference = {
      id: createEntityId("reference"),
      assetId: originalAsset.id,
      type: "IMAGE" as const,
      role: "PRIMARY" as const,
      regions: [],
      metadata: {},
    };
    const withReference = executeCommand(withAssets, {
      ...base(withAssets),
      type: "reference.register",
      payload: { reference },
    }).newDocument;

    const replaced = executeCommand(withReference, {
      ...base(withReference),
      type: "reference.update",
      payload: { reference: { ...reference, assetId: replacementAsset.id } },
    }).newDocument;

    expect(replaced.references[reference.id]?.assetId).toBe(replacementAsset.id);
  });

  it("rejects reference.update for a reference that does not exist, or an asset that does not exist", () => {
    const document = fixtures.empty();
    const asset = createAsset({
      type: "IMAGE",
      name: "Some asset",
      hash: `sha256:${"3".repeat(64)}`,
      uri: "assets/some.png",
      mimeType: "image/png",
    });
    const withAsset = executeCommand(document, {
      ...base(document),
      type: "asset.register",
      payload: { asset },
    }).newDocument;

    expectCommandError(
      () =>
        executeCommand(withAsset, {
          ...base(withAsset),
          type: "reference.update",
          payload: {
            reference: {
              id: createEntityId("reference"),
              assetId: asset.id,
              type: "IMAGE",
              role: "PRIMARY",
              regions: [],
              metadata: {},
            },
          },
        }),
      "REFERENCE_MISSING",
    );

    const reference = {
      id: createEntityId("reference"),
      assetId: asset.id,
      type: "IMAGE" as const,
      role: "PRIMARY" as const,
      regions: [],
      metadata: {},
    };
    const withReference = executeCommand(withAsset, {
      ...base(withAsset),
      type: "reference.register",
      payload: { reference },
    }).newDocument;
    expectCommandError(
      () =>
        executeCommand(withReference, {
          ...base(withReference),
          type: "reference.update",
          payload: { reference: { ...reference, assetId: "asset_00000000-0000-4000-8000-000000000000" } },
        }),
      "REFERENCE_MISSING",
    );
  });

  it("rejects a ValidationRecord that references a non-existent asset or reference", () => {
    const document = fixtures.empty();
    const record = ValidationRecordSchema.parse({
      id: createEntityId("validation"),
      createdAt: TIME,
      status: "PASSED",
      scores: {},
      referenceIds: [],
      heatmapAssetIds: ["asset_00000000-0000-4000-8000-000000000000"],
      metadata: {},
    });
    expectCommandError(
      () => executeCommand(document, { ...base(document), type: "validation.record", payload: { record } }),
      "REFERENCE_MISSING",
    );
  });

  it("deletes a node subtree and detaches it from its parent", () => {
    const document = fixtures.landingPage();
    const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!text?.parentId) throw new Error("Landing fixture requires nested text.");
    const parentId = text.parentId;
    const result = executeCommand(document, {
      ...base(document),
      type: "node.delete",
      payload: { nodeId: text.id },
    });

    expect(result.newDocument.nodes[text.id]).toBeUndefined();
    expect(result.newDocument.nodes[parentId]?.childIds).not.toContain(text.id);
    expect(result.changeSet.removed).toContain(text.id);
    expect(document.nodes[text.id]).toBe(text);
  });

  it("removes a dangling timeline track (and prunes it from clips) when its target node is deleted", () => {
    const document = fixtures.landingPage();
    const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!text) throw new Error("Landing fixture requires a text node.");
    const track = {
      id: "track_20000000-0000-4000-8000-000000000001",
      targetId: text.id,
      property: "OPACITY",
      propertyPath: "transform.opacity",
      valueType: "NUMBER",
      muted: false,
      locked: false,
      layer: 0,
      keyframes: [],
    } as const;
    const otherTrack = { ...track, id: "track_20000000-0000-4000-8000-000000000002", targetId: text.parentId! };
    const timeline = {
      id: "timeline_20000000-0000-4000-8000-000000000001",
      version: "1.0.0",
      name: "Fade in",
      type: "TIME",
      duration: 1,
      frameRate: 60,
      timeScale: 1,
      loop: { enabled: false, count: null, mode: "RESTART" },
      tracks: [track, otherTrack],
      clips: [
        {
          id: "clip_20000000-0000-4000-8000-000000000001",
          name: "Fade",
          start: 0,
          end: 1,
          offset: 0,
          playbackRate: 1,
          trackIds: [track.id, otherTrack.id],
        },
      ],
      markers: [],
      triggers: [],
      events: [],
      labels: {},
      metadata: {},
    } as const;
    const withTimeline: CanonicalDesignDocument = { ...document, timelines: { [timeline.id]: timeline } };
    expect(validateDocument(withTimeline).success).toBe(true);

    const result = executeCommand(withTimeline, {
      ...base(withTimeline),
      type: "node.delete",
      payload: { nodeId: text.id },
    });

    expect(validateDocument(result.newDocument).success).toBe(true);
    const resultTimeline = result.newDocument.timelines[timeline.id];
    expect(resultTimeline?.tracks.map((entry) => entry.id)).toEqual([otherTrack.id]);
    expect(resultTimeline?.clips[0]?.trackIds).toEqual([otherTrack.id]);
  });

  it("rejects generic deletion of canonical rig state", () => {
    const document = fixtures.landingPage();
    const parentId = document.rootNodeIds[0];
    if (!parentId) throw new Error("Expected fixture root.");
    const built = buildRigNodes({
      parentId,
      rigName: "Protected Rig",
      bones: buildMechanicalChainTemplate({ segmentCount: 1 }).bones,
      rigMethod: "MANUAL",
      scope: "delete-safety",
    });
    const parent = document.nodes[parentId];
    if (!parent) throw new Error("Expected fixture parent.");
    const withRig: CanonicalDesignDocument = {
      ...document,
      nodes: {
        ...document.nodes,
        [parentId]: { ...parent, childIds: [...parent.childIds, built.rig.id] },
        [built.rig.id]: built.rig,
        ...Object.fromEntries(built.bones.map((bone) => [bone.id, bone])),
      },
    };

    expect(validateDocument(withRig).success).toBe(true);
    expectCommandError(
      () => executeCommand(withRig, { ...base(withRig), type: "node.delete", payload: { nodeId: built.rig.id } }),
      "CONFLICT_ERROR",
    );
  });

  it("rejects create, update, and delete operations that would modify locked nodes", () => {
    const document = structuredClone(fixtures.landingPage());
    const text = Object.values(document.nodes).find((node) => node.type === "TEXT");
    if (!text?.parentId) throw new Error("Landing fixture requires nested text.");
    const parent = document.nodes[text.parentId];
    if (!parent) throw new Error("Landing fixture requires the text parent.");
    parent.locked = true;
    text.locked = true;

    expectCommandError(
      () =>
        executeCommand(document, {
          ...base(document),
          type: "node.create",
          payload: { node: createFrame(parent.id, "Blocked child") },
        }),
      "LOCKED_ENTITY",
    );
    expectCommandError(
      () =>
        executeCommand(document, {
          ...base(document),
          type: "node.delete",
          payload: { nodeId: text.id },
        }),
      "LOCKED_ENTITY",
    );

    expectCommandError(
      () =>
        executeCommand(document, {
          ...base(document),
          type: "node.update",
          payload: { nodeId: text.id, changes: { name: "Blocked rename" } },
        }),
      "LOCKED_ENTITY",
    );
    expectCommandError(
      () =>
        executeCommand(document, {
          ...base(document),
          type: "node.delete",
          payload: { nodeId: parent.id },
        }),
      "LOCKED_ENTITY",
    );
  });

  it("produces identical documents for identical command sequences", () => {
    const document = fixtures.landingPage();
    const command: Command = { ...base(document), type: "document.rename", payload: { name: "Deterministic" } };
    const first = executeCommand(document, command);
    const second = executeCommand(document, command);

    expect(serialize(first.newDocument)).toBe(serialize(second.newDocument));
    expect(first.changeSet).toEqual(second.changeSet);
    expect(first.events).toEqual(second.events);
  });
});
