import { CURRENT_SCHEMA_VERSION, type CanonicalDesignDocument } from "./schema.js";
import { assertValidDocument } from "./validation.js";

export interface MigrationContext {
  readonly fromVersion: string;
  readonly toVersion: string;
}

export type DocumentMigration = (
  document: Readonly<Record<string, unknown>>,
  context: MigrationContext,
) => Record<string, unknown>;

interface RegisteredMigration {
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly migrate: DocumentMigration;
}

export class MigrationRegistry {
  readonly #currentVersion: string;
  readonly #migrations = new Map<string, RegisteredMigration>();

  public constructor(currentVersion = CURRENT_SCHEMA_VERSION) {
    this.#currentVersion = currentVersion;
  }

  public currentSchema(): string {
    return this.#currentVersion;
  }

  public registerMigration(fromVersion: string, toVersion: string, migrate: DocumentMigration): void {
    if (fromVersion === toVersion) throw new Error("A migration must change the schema version.");
    if (this.#migrations.has(fromVersion)) throw new Error(`A migration from ${fromVersion} is already registered.`);
    this.#migrations.set(fromVersion, { fromVersion, toVersion, migrate });
  }

  public migrate(input: Readonly<Record<string, unknown>>): CanonicalDesignDocument {
    let document = structuredClone(input);
    let version = typeof document.schemaVersion === "string" ? document.schemaVersion : "";
    const visited = new Set<string>();

    while (version !== this.#currentVersion) {
      if (visited.has(version)) throw new Error(`Migration cycle detected at schema ${version}.`);
      visited.add(version);
      const migration = this.#migrations.get(version);
      if (!migration) throw new Error(`No migration path from schema ${version} to ${this.#currentVersion}.`);
      document = migration.migrate(document, { fromVersion: migration.fromVersion, toVersion: migration.toVersion });
      if (document.schemaVersion !== migration.toVersion) {
        throw new Error(`Migration ${migration.fromVersion} -> ${migration.toVersion} did not set schemaVersion.`);
      }
      version = migration.toVersion;
    }
    return assertValidDocument(document);
  }
}

const defaultRegistry = new MigrationRegistry();
defaultRegistry.registerMigration("1.0.0", "1.1.0", (document, context) => ({
  ...document,
  schemaVersion: context.toVersion,
  migrationVersion: 1,
}));
defaultRegistry.registerMigration("1.1.0", CURRENT_SCHEMA_VERSION, (document, context) => ({
  ...document,
  schemaVersion: context.toVersion,
  migrationVersion: 2,
}));

export function currentSchema(): string {
  return defaultRegistry.currentSchema();
}

export function registerMigration(fromVersion: string, toVersion: string, migration: DocumentMigration): void {
  defaultRegistry.registerMigration(fromVersion, toVersion, migration);
}

export function migrate(input: Readonly<Record<string, unknown>>): CanonicalDesignDocument {
  return defaultRegistry.migrate(input);
}
