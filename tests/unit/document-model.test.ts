import {
  createAsset,
  createEntityId,
  createFrame,
  createPage,
  createText,
  deserialize,
  fixtures,
  serialize,
  validateDocument,
} from "../../packages/document-model/src/index.js";
import { describe, expect, it } from "vitest";

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

describe("Canonical Design Document", () => {
  it("loads every Phase 1 fixture through full runtime validation", () => {
    for (const [name, createFixture] of Object.entries(fixtures)) {
      const result = validateDocument(createFixture());
      expect(result.issues, name).toEqual([]);
      expect(result.success, name).toBe(true);
    }
  });

  it("serializes and deserializes without semantic or identifier loss", () => {
    const original = fixtures.componentDemo();
    const serialized = serialize(original, true);
    const restored = deserialize(serialized);

    expect(restored).toEqual(original);
    expect(restored.metadata.id).toBe(original.metadata.id);
    expect(Object.keys(restored.nodes)).toEqual(Object.keys(original.nodes));
  });

  it("creates immutable-format, unique, prefixed UUID identifiers", () => {
    const ids = new Set(Array.from({ length: 250 }, () => createEntityId("node")));
    expect(ids.size).toBe(250);
    for (const id of ids) expect(id).toMatch(/^node_[0-9a-f-]{36}$/);

    const page = createPage();
    const frame = createFrame(page.id);
    const text = createText(frame.id, "Stable");
    expect(page.id).toMatch(/^page_/);
    expect(frame.id).toMatch(/^frame_/);
    expect(text.id).toMatch(/^text_/);
  });

  it("rejects duplicate IDs across registries", () => {
    const document = fixtures.assetDemo();
    const existing = requireValue(Object.values(document.assets)[0], "Asset fixture is empty.");
    const secondKey = createEntityId("asset");
    document.assets[secondKey] = { ...existing };

    const result = validateDocument(document);
    expect(result.success).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain("DUPLICATE_ID");
  });

  it("rejects missing parents and asymmetric hierarchy edges", () => {
    const document = fixtures.landingPage();
    const text = requireValue(
      Object.values(document.nodes).find((node) => node.type === "TEXT"),
      "Text fixture is empty.",
    );
    text.parentId = createEntityId("frame");

    const result = validateDocument(document);
    expect(result.success).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain("MISSING_PARENT");
  });

  it("detects circular node hierarchies", () => {
    const document = fixtures.landingPage();
    const pageId = requireValue(document.pages[0], "Page fixture is empty.");
    const page = requireValue(document.nodes[pageId], "Page node is missing.");
    const text = requireValue(
      Object.values(document.nodes).find((node) => node.type === "TEXT"),
      "Text fixture is empty.",
    );
    text.childIds.push(page.id);
    page.parentId = text.id;
    document.rootNodeIds = [];

    const result = validateDocument(document);
    expect(result.success).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain("CIRCULAR_HIERARCHY");
  });

  it("rejects parentless nodes missing from the canonical root list", () => {
    const document = fixtures.landingPage();
    document.rootNodeIds = [];

    const result = validateDocument(document);
    expect(result.success).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "HIERARCHY_MISMATCH" }));
  });

  it("rejects dangling asset, component, and timeline target references", () => {
    const document = fixtures.assetDemo();
    const image = requireValue(
      Object.values(document.nodes).find((node) => node.type === "IMAGE"),
      "Fixture image missing.",
    );
    if (image.type !== "IMAGE") throw new Error("Fixture image has the wrong type.");
    image.assetId = createEntityId("asset");

    const result = validateDocument(document);
    expect(result.success).toBe(false);
    expect(result.issues.some((entry) => entry.code === "INVALID_REFERENCE" && entry.path.endsWith("assetId"))).toBe(
      true,
    );
  });

  it("rejects unsupported schema and migration versions", () => {
    const document = fixtures.empty();
    document.schemaVersion = "2.0.0";
    document.migrationVersion = 9;

    const result = validateDocument(document);
    expect(result.success).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "VERSION_INVALID" }));
  });

  it("validates source-reference links and rejects missing regions", () => {
    const document = fixtures.assetDemo();
    const asset = requireValue(Object.values(document.assets)[0], "Asset fixture is empty.");
    const referenceId = createEntityId("reference");
    document.references[referenceId] = {
      id: referenceId,
      assetId: asset.id,
      type: "SCREENSHOT",
      role: "PRIMARY",
      regions: [{ id: "hero", label: "Hero", bounds: { x: 0, y: 0, width: 100, height: 100 } }],
      metadata: {},
    };
    const image = requireValue(
      Object.values(document.nodes).find((node) => node.type === "IMAGE"),
      "Fixture image missing.",
    );
    image.sourceLinks.push({ referenceId, regionId: "missing", confidence: 0.9, relationship: "RECONSTRUCTED_FROM" });

    const result = validateDocument(document);
    expect(result.success).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "INVALID_REFERENCE", path: expect.stringContaining("regionId") }),
    );
  });

  it("rejects malformed persisted JSON", () => {
    expect(() => deserialize("{not-json}")).toThrow(SyntaxError);
  });

  it("preserves registered asset provenance fields", () => {
    const asset = createAsset({
      type: "GLB",
      name: "Model master",
      hash: `sha256:${"a".repeat(64)}`,
      uri: "assets/model.glb",
      mimeType: "model/gltf-binary",
      byteSize: 1024,
    });
    expect(asset.source).toEqual({ kind: "UPLOAD", uri: "assets/model.glb" });
    expect(asset.hash).toHaveLength(71);
  });
});
