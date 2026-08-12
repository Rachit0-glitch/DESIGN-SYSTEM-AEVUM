import { beginTransaction, CURRENT_COMMAND_VERSION, type ApplyLightingRigCommand } from "@aevum/command-engine";
import { CURRENT_SCHEMA_VERSION, migrate, validateDocument } from "@aevum/document-model";
import { analyzeReferenceLighting, buildLightingRig, resolveLighting, validateLighting } from "@aevum/lighting";
import { create3DRenderPlan } from "@aevum/renderer-3d";
import { createRuntimeViewport, project3DScene, projectScene, sceneRuntimeFixtures } from "@aevum/scene-runtime";
import { describe, expect, it } from "vitest";

const NOW = "2026-08-12T12:00:00.000Z";
const COLORS = [
  { r: 0.95, g: 0.8, b: 0.6, a: 1, region: "HIGHLIGHT" as const },
  { r: 0.5, g: 0.45, b: 0.4, a: 1, region: "SUBJECT" as const },
  { r: 0.1, g: 0.12, b: 0.15, a: 1, region: "SHADOW" as const },
  { r: 0.02, g: 0.03, b: 0.04, a: 1, region: "BACKGROUND" as const },
];
const REFERENCE = {
  referenceId: "reference_11111111-1111-4111-8111-111111111111",
  width: 4,
  height: 4,
  samples: Array.from({ length: 16 }, (_, index) => {
    const color = COLORS[index % COLORS.length] ?? COLORS[0];
    return { x: index % 4, y: Math.floor(index / 4), ...color };
  }),
};

function fixture() {
  const document = sceneRuntimeFixtures.mixed();
  const scene = Object.values(document.nodes).find((node) => node.type === "SCENE_3D");
  if (scene?.type !== "SCENE_3D") throw new Error("Expected canonical 3D fixture scene.");
  const estimate = analyzeReferenceLighting(REFERENCE);
  const built = buildLightingRig({
    sceneId: scene.id,
    name: "Reference studio",
    type: "STUDIO",
    estimate,
  });
  const command: ApplyLightingRigCommand = {
    id: "cmd_11111111-1111-4111-8111-111111111111",
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: document.metadata.id,
    expectedDocumentVersion: document.documentVersion,
    timestamp: NOW,
    actor: { id: "phase20-test", type: "SYSTEM" },
    correlationId: "phase20-lighting",
    transactionId: "tx_11111111-1111-4111-8111-111111111111",
    type: "lighting.apply_rig",
    payload: {
      sceneId: scene.id,
      rig: built.rig,
      lights: [...built.lights],
      environment: built.environment,
      profiles: [...built.profiles],
      reflectionProbes: [...built.reflectionProbes],
    },
  };
  const commit = beginTransaction(document, { transactionId: command.transactionId }).execute(command).commit();
  return { built, command, document, estimate, scene, committed: commit.newDocument };
}

describe("Phase 20 lighting system", () => {
  it("derives deterministic structured lighting evidence from bounded reference pixels", () => {
    const first = analyzeReferenceLighting(REFERENCE);
    const second = analyzeReferenceLighting(REFERENCE);
    expect(first).toEqual(second);
    expect(first.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.keyToFillRatio).toBeGreaterThan(1);
    expect(first.temperatureKelvin).toBeGreaterThanOrEqual(1_000);
    expect(first.evidence.sampleCount).toBe(16);
    expect(() => analyzeReferenceLighting({ ...REFERENCE, samples: [] })).toThrow();
  });

  it("applies a complete rig atomically without mutating the source document", () => {
    const { built, committed, document, scene } = fixture();
    expect(document.nodes[scene.id]?.type === "SCENE_3D" && document.nodes[scene.id].lightingRigId).toBeUndefined();
    expect(committed.lightingRigs[built.rig.id]).toEqual(built.rig);
    expect(committed.nodes[scene.id]?.type === "SCENE_3D" && committed.nodes[scene.id].lightingRigId).toBe(
      built.rig.id,
    );
    expect(validateDocument(committed).success).toBe(true);
    expect(Object.isFrozen(built)).toBe(true);
  });

  it("rejects stale and locked writes without partial canonical changes", () => {
    const { command, document, scene } = fixture();
    expect(() =>
      beginTransaction(document).execute({ ...command, expectedDocumentVersion: document.documentVersion + 1 }),
    ).toThrow();
    const locked = {
      ...document,
      nodes: { ...document.nodes, [scene.id]: { ...scene, locked: true } },
    };
    expect(() => beginTransaction(locked, { transactionId: command.transactionId }).execute(command)).toThrow(
      /locked/i,
    );
    expect(Object.keys(document.lightingRigs)).toHaveLength(0);
  });

  it("resolves distinct realtime, offline, and bounded mobile profiles", () => {
    const { committed, scene } = fixture();
    const realtime = resolveLighting(committed, scene.id, "REALTIME");
    const offline = resolveLighting(committed, scene.id, "OFFLINE");
    const mobile = resolveLighting(committed, scene.id, "MOBILE");
    expect(offline.profile.shadowMapSize).toBeGreaterThan(realtime.profile.shadowMapSize);
    expect(mobile.profile.maxActiveLights).toBeLessThanOrEqual(realtime.profile.maxActiveLights);
    expect(mobile.profile.reflectionMode).toBe("ENVIRONMENT");
    expect(mobile.lights.length).toBeLessThanOrEqual(mobile.profile.maxActiveLights);
  });

  it("keeps lighting and material validation attribution separate", () => {
    const { committed, estimate, scene } = fixture();
    const report = validateLighting({ resolved: resolveLighting(committed, scene.id, "REALTIME"), expected: estimate });
    expect(report.lightingScore).toBeGreaterThanOrEqual(0);
    expect(report.materialScore).toBe(1);
    expect(report.shadowScore).toBeGreaterThan(0);
    expect(report.reflectionScore).toBeGreaterThan(0);
    expect(report.diagnostics.every((entry) => entry.domain !== "MATERIAL")).toBe(true);
  });

  it("projects resolved lighting into renderer-independent 3D operations", () => {
    const { committed, scene } = fixture();
    const viewport = {
      ...createRuntimeViewport(committed),
      width: 390,
      height: 844,
      category: "MOBILE" as const,
      qualityMode: "HIGH_QUALITY" as const,
    };
    const projection = project3DScene(committed, projectScene(committed, viewport));
    const plan = create3DRenderPlan(projection, scene.id);
    expect(projection.lighting.get(scene.id)?.target).toBe("MOBILE");
    expect(plan.operations.map((operation) => operation.kind)).toEqual(
      expect.arrayContaining(["LIGHTING_PROFILE_BIND", "ENVIRONMENT_BIND", "REFLECTION_PROBE_BIND", "LIGHT_BIND"]),
    );
    expect(create3DRenderPlan(projection, scene.id)).toEqual(plan);
  });

  it("migrates the complete 1.5 document shape losslessly to CDD 1.6", () => {
    const document = sceneRuntimeFixtures.mixed();
    const legacy = structuredClone(document) as unknown as Record<string, unknown>;
    legacy.schemaVersion = "1.5.0";
    legacy.migrationVersion = 5;
    for (const key of ["environments", "lightingRigs", "lightingProfiles", "reflectionProbes", "lightingBakes"])
      delete legacy[key];
    const migrated = migrate(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.migrationVersion).toBe(7);
    expect(migrated.lightingRigs).toEqual({});
    expect(validateDocument(migrated).success).toBe(true);
  });
});
