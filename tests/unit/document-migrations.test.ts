import {
  CURRENT_MIGRATION_VERSION,
  CURRENT_SCHEMA_VERSION,
  MigrationRegistry,
  TokenSchema,
  currentSchema,
  fixtures,
  migrate,
} from "../../packages/document-model/src/index.js";
import { describe, expect, it } from "vitest";

describe("document migrations", () => {
  it("reports the current schema version", () => {
    expect(currentSchema()).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("executes a registered path and validates the migrated document", () => {
    const current = fixtures.empty();
    const legacy = { ...current, schemaVersion: "0.9.0", migrationVersion: -1 };
    const registry = new MigrationRegistry();
    registry.registerMigration("0.9.0", CURRENT_SCHEMA_VERSION, (document, context) => ({
      ...document,
      schemaVersion: context.toVersion,
      migrationVersion: CURRENT_MIGRATION_VERSION,
    }));

    expect(registry.migrate(legacy).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("migrates Phase 1 documents through the asset and responsive contracts without data loss", () => {
    const current = fixtures.assetDemo();
    const legacy = { ...current, schemaVersion: "1.0.0", migrationVersion: 0 };

    const migrated = migrate(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.migrationVersion).toBe(CURRENT_MIGRATION_VERSION);
    expect(migrated.assets).toEqual(current.assets);
  });

  it("migrates 1.4 through the professional camera contract losslessly and deterministically", () => {
    const current = fixtures.assetDemo();
    const legacy = { ...current, schemaVersion: "1.4.0", migrationVersion: 4 };

    const first = migrate(legacy);
    const second = migrate(legacy);

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(first.migrationVersion).toBe(CURRENT_MIGRATION_VERSION);
    expect(first.lightingRigs).toEqual({});
    expect(first.cameraPaths).toEqual({});
    expect(first.cinematicShots).toEqual({});
    expect(first.cinematicSequences).toEqual({});
    expect(first.nodes).toEqual(current.nodes);
    expect(first.assets).toEqual(current.assets);
    expect(first.metadata).toEqual(current.metadata);
  });

  it("rejects duplicate registrations and incomplete migration paths", () => {
    const registry = new MigrationRegistry();
    const migration = (document: Readonly<Record<string, unknown>>) => ({ ...document, schemaVersion: "1.0.0" });
    registry.registerMigration("0.9.0", "1.0.0", migration);

    expect(() => registry.registerMigration("0.9.0", "1.0.1", migration)).toThrow("already registered");
    expect(() => new MigrationRegistry().migrate({ schemaVersion: "0.8.0" })).toThrow("No migration path");
  });

  it("rejects migrations that fail to advance their declared version", () => {
    const registry = new MigrationRegistry();
    registry.registerMigration("0.9.0", "1.0.0", (document) => ({ ...document }));
    expect(() => registry.migrate({ schemaVersion: "0.9.0" })).toThrow("did not set schemaVersion");
  });

  it("validates a real GRADIENT token (CDD 1.9.0)", () => {
    const gradient = TokenSchema.parse({
      id: "token_10000000-0000-4000-8000-000000000099",
      name: "gradient.reconstructed.primary",
      type: "GRADIENT",
      value: {
        type: "LINEAR_GRADIENT",
        angle: 45,
        stops: [
          { offset: 0, color: { r: 1, g: 0, b: 0, a: 1, colorSpace: "SRGB" } },
          { offset: 1, color: { r: 0, g: 0, b: 1, a: 1, colorSpace: "SRGB" } },
        ],
      },
    });
    expect(gradient.type).toBe("GRADIENT");
    expect(gradient.value).toMatchObject({ type: "LINEAR_GRADIENT" });
    // NOTE: TokenSchema.value is a loose z.union(...) that includes a permissive JsonObjectSchema
    // fallback, so a malformed gradient value (e.g. only one stop) does NOT get rejected here — it
    // silently falls through to being accepted as "just some JSON object." This is real,
    // pre-existing behavior across every token type in the union (not introduced by GRADIENT), and
    // out of scope for this change; tightening TokenValueSchema into a real discriminated union is
    // a separate task.
  });
});
