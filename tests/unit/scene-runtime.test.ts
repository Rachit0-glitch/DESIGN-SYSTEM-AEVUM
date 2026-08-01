import {
  ProjectionLimitExceededError,
  StrictProjectionFailedError,
  UnsupportedSchemaVersionError,
  createProjectedInstanceId,
  createRuntimeViewport,
  createSceneProjector,
  projectScene,
  sceneRuntimeFixtures,
  serializeSceneProjection,
} from "@aevum/scene-runtime";
import { createEntityId, createTransform, fixtures } from "@aevum/document-model";
import { describe, expect, it } from "vitest";

function requireNode<T>(value: T | undefined, message = "Expected node is missing."): T {
  if (value === undefined) throw new Error(message);
  return value;
}

describe("canonical scene projection", () => {
  it("preserves root and child order while resolving parent links and world transforms", () => {
    const document = sceneRuntimeFixtures.nested();
    const pageId = requireNode(document.rootNodeIds[0]);
    const page = requireNode(document.nodes[pageId]);
    page.transform.position = { x: 100, y: 50, z: 2 };
    const before = JSON.stringify(document);

    const projection = projectScene(document, createRuntimeViewport(document));
    const ordered = [...projection.nodes.values()];
    const nested = requireNode(ordered.find((node) => node.name === "Nested frame"));

    expect(projection.rootIds).toEqual(document.rootNodeIds);
    expect(ordered.map((node) => node.traversalIndex)).toEqual(ordered.map((_, index) => index));
    expect(nested.parentId).toBe(pageId);
    expect(nested.worldTransform.position).toEqual({ x: 110, y: 70, z: 5 });
    expect(JSON.stringify(document)).toBe(before);
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(nested.sourceNode)).toBe(true);
    expect("set" in projection.nodes).toBe(false);
  });

  it("resolves breakpoint specificity before orientation overrides", () => {
    const document = sceneRuntimeFixtures.responsive();
    const viewport = {
      ...createRuntimeViewport(document, "compact"),
      width: 390,
      height: 844,
      category: "MOBILE" as const,
      orientation: "PORTRAIT" as const,
    };

    const projection = projectScene(document, viewport);
    const node = requireNode([...projection.nodes.values()].find((entry) => entry.name === "Nested frame"));

    expect(node.visible).toBe(true);
    expect(node.localTransform.position).toEqual({ x: 9, y: 10, z: 0 });
    expect(node.responsive.appliedOverrideKeys).toEqual([
      "breakpoint:MOBILE",
      "breakpoint:compact",
      "orientation:PORTRAIT",
    ]);
    expect(node.responsive.changedPaths).toEqual(expect.arrayContaining(["transform"]));
  });

  it("expands component instances with stable runtime-only IDs and attribution", () => {
    const document = sceneRuntimeFixtures.component();
    const instance = requireNode(Object.values(document.nodes).find((node) => node.type === "COMPONENT_INSTANCE"));
    if (instance.type !== "COMPONENT_INSTANCE") throw new Error("Expected component instance.");
    const component = requireNode(document.components[instance.componentId]);
    const expectedId = createProjectedInstanceId(instance.id, component.id, component.rootNodeId);

    const first = projectScene(document, createRuntimeViewport(document));
    const second = projectScene(document, createRuntimeViewport(document));
    const expanded = requireNode(first.nodes.get(expectedId));

    expect(first.fingerprint).toBe(second.fingerprint);
    expect([...first.nodes.keys()]).toEqual([...second.nodes.keys()]);
    expect(expanded.parentId).toBe(instance.id);
    expect(expanded.componentOrigin).toMatchObject({
      instanceId: instance.id,
      componentId: component.id,
      sourceNodeId: component.rootNodeId,
      overrides: { label: "Continue" },
    });
    expect(document.nodes[expectedId]).toBeUndefined();
    expect(first.statistics.unreachableNodes).toBe(0);
  });

  it("projects mixed 2D and 3D nodes with asset, material, and camera dependencies", () => {
    const document = sceneRuntimeFixtures.mixed();
    const projection = projectScene(document, createRuntimeViewport(document));
    const edgeTypes = new Set(projection.dependencyGraph.edges.map((edge) => edge.type));

    expect(projection.statistics.twoDimensionalNodes).toBeGreaterThan(0);
    expect(projection.statistics.threeDimensionalNodes).toBe(2);
    expect(edgeTypes.has("USES_ASSET")).toBe(true);
    expect(edgeTypes.has("USES_MATERIAL")).toBe(true);
    expect(edgeTypes.has("USES_CAMERA")).toBe(true);
    expect(projection.complete).toBe(true);
  });

  it("returns safe partial output with structured missing-reference and unreachable diagnostics", () => {
    const document = sceneRuntimeFixtures.mixed();
    const mesh = requireNode(Object.values(document.nodes).find((node) => node.type === "MESH_3D"));
    if (mesh.type !== "MESH_3D") throw new Error("Expected mesh node.");
    delete document.assets[mesh.geometryAssetId];
    const orphanId = createEntityId("group");
    document.nodes[orphanId] = {
      id: orphanId,
      type: "GROUP",
      name: "Orphan",
      parentId: null,
      childIds: [],
      visible: true,
      locked: false,
      transform: createTransform(),
      sourceLinks: [],
      metadata: { tags: [], customData: {} },
      isolation: false,
      passThroughBlend: true,
    };

    const projection = projectScene(document, createRuntimeViewport(document), { strictMode: false });

    expect(projection.complete).toBe(false);
    expect(projection.nodes.has(mesh.id)).toBe(true);
    expect(projection.reachability.get(orphanId)).toBe("UNREACHABLE");
    expect(projection.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["MISSING_ASSET", "UNREACHABLE_NODE"]),
    );
  });

  it("fails strict mode with the same structured diagnostics", () => {
    const document = sceneRuntimeFixtures.mixed();
    const mesh = requireNode(Object.values(document.nodes).find((node) => node.type === "MESH_3D"));
    if (mesh.type !== "MESH_3D") throw new Error("Expected mesh node.");
    delete document.assets[mesh.geometryAssetId];

    expect(() => projectScene(document, createRuntimeViewport(document))).toThrow(StrictProjectionFailedError);
    try {
      projectScene(document, createRuntimeViewport(document));
    } catch (error) {
      expect(error).toBeInstanceOf(StrictProjectionFailedError);
      expect((error as StrictProjectionFailedError).diagnostics.some((entry) => entry.code === "MISSING_ASSET")).toBe(
        true,
      );
    }
  });

  it("detects cycles and parent-child conflicts without mutating the malformed document", () => {
    const document = fixtures.landingPage();
    const pageId = requireNode(document.rootNodeIds[0]);
    const page = requireNode(document.nodes[pageId]);
    const frameId = requireNode(page.childIds[0]);
    const frame = requireNode(document.nodes[frameId]);
    const headingId = requireNode(frame.childIds[0]);
    const heading = requireNode(document.nodes[headingId]);
    heading.parentId = null;
    heading.childIds.push(pageId);
    const before = JSON.stringify(document);

    const projection = projectScene(document, createRuntimeViewport(document), { strictMode: false });

    expect(projection.diagnostics.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["CYCLE_DETECTED", "PARENT_CHILD_MISMATCH"]),
    );
    expect(projection.nodes.size).toBe(3);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("enforces maximum depth and node count in strict and diagnostic modes", () => {
    const document = sceneRuntimeFixtures.nested();
    const viewport = createRuntimeViewport(document);

    expect(() => projectScene(document, viewport, { maxDepth: 1 })).toThrow(ProjectionLimitExceededError);
    expect(() => projectScene(document, viewport, { maxNodes: 2 })).toThrow(ProjectionLimitExceededError);

    const partial = projectScene(document, viewport, { strictMode: false, maxNodes: 2 });
    expect(partial.nodes.size).toBe(2);
    expect(partial.diagnostics.some((entry) => entry.code === "MAX_NODE_COUNT_EXCEEDED")).toBe(true);
  });

  it("rejects unsupported schema versions before traversal", () => {
    const document = fixtures.landingPage();
    document.schemaVersion = "9.0.0";
    expect(() => projectScene(document, createRuntimeViewport(document), { strictMode: false })).toThrow(
      UnsupportedSchemaVersionError,
    );
  });

  it("uses deterministic cache keys, records hits, and serializes maps as ordered data", () => {
    const document = sceneRuntimeFixtures.nested();
    const viewport = createRuntimeViewport(document);
    const projector = createSceneProjector({ configuration: { cacheSize: 2 } });

    const first = projector.project(document, viewport);
    const second = projector.project(document, viewport);
    const serialized = JSON.parse(serializeSceneProjection(second)) as {
      nodes: Array<{ traversalIndex: number }>;
      dependencyGraph: { edges: unknown[] };
    };

    expect(second).toBe(first);
    expect(projector.cacheStatistics()).toMatchObject({ hits: 1, misses: 1, entries: 1 });
    expect(serialized.nodes.map((node) => node.traversalIndex)).toEqual(serialized.nodes.map((_, index) => index));
    expect(Array.isArray(serialized.dependencyGraph.edges)).toBe(true);

    const disabled = createSceneProjector({ configuration: { enableCache: false } });
    expect(disabled.project(document, viewport)).not.toBe(disabled.project(document, viewport));
    expect(disabled.cacheStatistics()).toMatchObject({ hits: 0, misses: 0, entries: 0 });
  });
});
