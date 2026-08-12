import {
  CURRENT_MIGRATION_VERSION,
  CURRENT_SCHEMA_VERSION,
  MigrationRegistry,
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

  it("migrates 1.4 directly to 1.5 losslessly and deterministically", () => {
    const current = fixtures.assetDemo();
    const legacy = { ...current, schemaVersion: "1.4.0", migrationVersion: 4 };

    const first = migrate(legacy);
    const second = migrate(legacy);

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe("1.5.0");
    expect(first.migrationVersion).toBe(5);
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
});
