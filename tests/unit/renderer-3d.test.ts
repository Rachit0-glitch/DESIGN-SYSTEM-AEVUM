import { computeSha256 } from "@aevum/assets";
import { createAsset, fixtures } from "@aevum/document-model";
import {
  create3DImportProposal,
  inspect3DAsset,
  ThreeFoundationError,
  validate3DImportProposal,
} from "@aevum/renderer-3d";
import { createSkinnedThreeFixture, createThreeFixture, createThreeFixtureSet } from "@aevum/test-fixtures";
import { describe, expect, it } from "vitest";

function registeredAsset(type: "GLB" | "GLTF", bytes: Uint8Array) {
  return createAsset({
    type,
    name: `Fixture.${type.toLowerCase()}`,
    hash: computeSha256(bytes),
    uri: `registered/fixture.${type.toLowerCase()}`,
    mimeType: type === "GLB" ? "model/gltf-binary" : "model/gltf+json",
    byteSize: bytes.byteLength,
  });
}

describe("Phase 14 registered 3D asset inspection", () => {
  it("inspects equivalent real GLB and resource-backed GLTF assets", async () => {
    const fixture = await createThreeFixture();
    const glbAsset = registeredAsset("GLB", fixture.glb);
    const gltfAsset = registeredAsset("GLTF", fixture.gltf);
    const [glb, gltf] = await Promise.all([
      inspect3DAsset({ asset: glbAsset, bytes: fixture.glb }),
      inspect3DAsset({ asset: gltfAsset, bytes: fixture.gltf, resources: fixture.resources }),
    ]);

    expect(glb.complete).toBe(true);
    expect(glb.statistics).toMatchObject({
      sceneCount: 1,
      meshCount: 2,
      primitiveCount: 3,
      vertexCount: 12,
      triangleCount: 6,
      materialCount: 2,
      textureCount: 1,
      cameraCount: 1,
      lightCount: 1,
    });
    expect(gltf.statistics).toEqual(glb.statistics);
    expect(glb.sceneBounds?.center.x).toBeCloseTo(12);
    expect(JSON.stringify(glb)).toEqual(JSON.stringify(await inspect3DAsset({ asset: glbAsset, bytes: fixture.glb })));
    expect(Object.isFrozen(glb)).toBe(true);
    expect(Object.isFrozen(glb.statistics)).toBe(true);
    expect(Object.isFrozen(glb.diagnostics)).toBe(true);
  });

  it("creates deterministic, independently addressable canonical primitive proposals", async () => {
    const fixture = await createThreeFixture();
    const asset = registeredAsset("GLB", fixture.glb);
    const document = fixtures.empty();
    document.assets[asset.id] = asset;
    const input = { canonicalDocument: document, asset, bytes: fixture.glb };
    const first = await create3DImportProposal(input);
    const second = await create3DImportProposal(input);
    const meshes = first.nodes.filter((node) => node.type === "MESH_3D");

    expect(first).toEqual(second);
    expect(validate3DImportProposal(first, document).valid).toBe(true);
    expect(meshes).toHaveLength(3);
    expect(new Set(meshes.map((node) => node.id)).size).toBe(3);
    expect(first.materials).toContainEqual(
      expect.objectContaining({
        type: "PBR",
        pbr: expect.objectContaining({ roughness: 0.65, metalness: 0.25, alphaMode: "BLEND", doubleSided: true }),
      }),
    );
    expect(first.assets).toHaveLength(1);
    expect(first.assets[0]?.source).toMatchObject({ kind: "DERIVED", originalAssetId: asset.id });
    expect(first.cameras).toHaveLength(1);
    expect(first.lights).toHaveLength(1);
    expect(first.cameras[0]?.transform.position.x).toBeCloseTo(10);
    expect(first.lights[0]?.transform.position.x).toBeCloseTo(10);
  });

  it("provides the seven required deterministic real GLB/GLTF fixture roles", async () => {
    const fixtures = await createThreeFixtureSet();
    expect(Object.keys(fixtures)).toEqual([
      "simpleCube",
      "hierarchicalMultiMesh",
      "multiMaterial",
      "texturedObject",
      "cameraScene",
      "lightScene",
      "nestedTransforms",
    ]);
    const cube = await inspect3DAsset({
      asset: registeredAsset("GLB", fixtures.simpleCube.glb),
      bytes: fixtures.simpleCube.glb,
    });
    expect(cube.statistics).toMatchObject({ meshCount: 1, primitiveCount: 1, vertexCount: 8, triangleCount: 12 });
  });

  it("rejects hash mismatches, unsafe resources, malformed input, and configured limit overruns", async () => {
    const fixture = await createThreeFixture();
    const asset = registeredAsset("GLB", fixture.glb);
    await expect(
      inspect3DAsset({ asset: { ...asset, hash: `sha256:${"f".repeat(64)}` }, bytes: fixture.glb }),
    ).rejects.toMatchObject({
      code: "ASSET_HASH_MISMATCH",
    });
    await expect(inspect3DAsset({ asset, bytes: fixture.glb, limits: { maxNodes: 1 } })).rejects.toMatchObject({
      code: "RESOURCE_LIMIT_EXCEEDED",
    });

    const unsafe = new TextEncoder().encode(
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ uri: "https://example.com/model.bin", byteLength: 4 }],
        scenes: [{}],
      }),
    );
    await expect(inspect3DAsset({ asset: registeredAsset("GLTF", unsafe), bytes: unsafe })).rejects.toMatchObject({
      code: "NETWORK_RESOURCE_REJECTED",
    });
    const extensionJson = JSON.parse(new TextDecoder().decode(fixture.gltf)) as Record<string, unknown>;
    extensionJson.extensionsUsed = ["VENDOR_unimplemented_feature"];
    const extensionBytes = new TextEncoder().encode(JSON.stringify(extensionJson));
    const extensionInspection = await inspect3DAsset({
      asset: registeredAsset("GLTF", extensionBytes),
      bytes: extensionBytes,
      resources: fixture.resources,
    });
    expect(extensionInspection.diagnostics).toContainEqual(
      expect.objectContaining({ code: "UNSUPPORTED_EXTENSION", severity: "WARNING" }),
    );
    const malformed = Uint8Array.from([0, 1, 2, 3]);
    await expect(inspect3DAsset({ asset: registeredAsset("GLB", malformed), bytes: malformed })).rejects.toBeInstanceOf(
      ThreeFoundationError,
    );
  });
});

describe("Phase 19B glTF skin import", () => {
  it("creates one canonical rig when multiple mesh nodes share one glTF skin", async () => {
    const fixture = await createSkinnedThreeFixture({ meshNodeCount: 2 });
    const asset = registeredAsset("GLB", fixture.glb);
    const document = fixtures.empty();
    document.assets[asset.id] = asset;
    const proposal = await create3DImportProposal({
      canonicalDocument: document,
      asset,
      bytes: fixture.glb,
    });
    const rigs = proposal.nodes.filter((node) => node.type === "RIG_3D");
    const skinnedMeshes = proposal.nodes.filter((node) => node.type === "MESH_3D" && node.skinBinding);

    expect(rigs).toHaveLength(1);
    expect(skinnedMeshes).toHaveLength(2);
    expect(
      new Set(skinnedMeshes.map((node) => (node.type === "MESH_3D" ? node.skinBinding?.rigId : undefined))),
    ).toEqual(new Set([rigs[0]?.id]));
  });

  it("converts a real glTF skin into canonical RIG_3D/BONE_3D nodes and a MESH_3D skinBinding", async () => {
    const fixture = await createSkinnedThreeFixture();
    const asset = registeredAsset("GLB", fixture.glb);
    const document = fixtures.empty();
    document.assets[asset.id] = asset;
    const proposal = await create3DImportProposal({ canonicalDocument: document, asset, bytes: fixture.glb });

    const rig = proposal.nodes.find((node) => node.type === "RIG_3D");
    const bones = proposal.nodes.filter((node) => node.type === "BONE_3D");
    const mesh = proposal.nodes.find((node) => node.type === "MESH_3D");
    if (rig?.type !== "RIG_3D" || mesh?.type !== "MESH_3D") throw new Error("Expected a rig and a skinned mesh.");

    expect(rig.rigMethod).toBe("IMPORTED");
    expect(bones).toHaveLength(2);
    expect([...rig.boneIds].sort()).toEqual(bones.map((bone) => bone.id).sort());
    expect(rig.childIds).toEqual([rig.rootBoneId]);

    const rootBone = bones.find((bone) => bone.id === rig.rootBoneId);
    const tipBone = bones.find((bone) => bone.id !== rig.rootBoneId);
    if (rootBone?.type !== "BONE_3D" || tipBone?.type !== "BONE_3D") throw new Error("Expected two real bones.");
    expect(rootBone.parentId).toBe(rig.id);
    expect(tipBone.parentId).toBe(rootBone.id);
    expect(rootBone.deforming).toBe(true);
    expect(rootBone.length).toBeGreaterThan(0);
    // The tip joint's real inverse bind matrix (undoing its 0.66-unit rest translation) round-trips
    // through the accessor read verbatim, not a placeholder identity matrix.
    expect(tipBone.inverseBindMatrix?.[13]).toBeCloseTo(-0.66, 5);
    expect(rootBone.inverseBindMatrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    expect(mesh.skinBinding).toBeDefined();
    expect(mesh.skinBinding?.rigId).toBe(rig.id);
    expect([...(mesh.skinBinding?.jointIds ?? [])].sort()).toEqual(bones.map((bone) => bone.id).sort());
    expect(mesh.skinBinding?.weightMethod).toBe("IMPORTED");
    expect(mesh.skinBinding?.vertexCount).toBe(8);
    // Every vertex in the fixture has a real, nonzero influence — none are genuinely unweighted.
    expect(mesh.skinBinding?.unweightedVertexCount).toBe(0);
    // Every fixture vertex's weights already sum to 1 by construction.
    expect(mesh.skinBinding?.normalized).toBe(true);

    // The model's own rigId back-reference is set, and the whole proposal still parses/validates.
    const model = proposal.nodes.find((node) => node.type === "MODEL_3D");
    expect(model?.type === "MODEL_3D" && model.rigId).toBe(rig.id);
    expect(validate3DImportProposal(proposal, document).valid).toBe(true);
  });

  it("reports skin presence as an informational diagnostic, not a dropped-feature warning", async () => {
    const fixture = await createSkinnedThreeFixture();
    const asset = registeredAsset("GLB", fixture.glb);
    const inspection = await inspect3DAsset({ asset, bytes: fixture.glb });
    const skinDiagnostic = inspection.diagnostics.find((entry) => entry.code === "UNSUPPORTED_SKIN_FEATURE");
    expect(skinDiagnostic?.severity).toBe("INFO");
    expect(inspection.statistics.skinCount).toBe(1);
  });
});
