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
defaultRegistry.registerMigration("1.1.0", "1.2.0", (document, context) => ({
  ...document,
  schemaVersion: context.toVersion,
  migrationVersion: 2,
}));
defaultRegistry.registerMigration("1.2.0", "1.3.0", (document, context) => {
  const timelines = Object.fromEntries(
    Object.entries((document.timelines as Record<string, Record<string, unknown>> | undefined) ?? {}).map(
      ([id, timeline]) => [
        id,
        {
          ...timeline,
          version: "1.0.0",
          type: "TIME",
          timeScale: 1,
          loop: { enabled: false, count: 1, mode: "RESTART" },
          tracks: ((timeline.tracks as Record<string, unknown>[] | undefined) ?? []).map((track) => ({
            ...track,
            property: "OPACITY",
            valueType: "NUMBER",
            muted: false,
            locked: false,
            layer: 0,
            keyframes: ((track.keyframes as Record<string, unknown>[] | undefined) ?? []).map((keyframe) => {
              const legacyEasing = keyframe.easing;
              const easing =
                typeof legacyEasing === "string"
                  ? legacyEasing === "STEP"
                    ? { type: "STEPS", count: 1, position: "END" }
                    : { type: legacyEasing }
                  : legacyEasing && typeof legacyEasing === "object" && "cubicBezier" in legacyEasing
                    ? {
                        type: "CUBIC_BEZIER",
                        x1: (legacyEasing.cubicBezier as number[])[0],
                        y1: (legacyEasing.cubicBezier as number[])[1],
                        x2: (legacyEasing.cubicBezier as number[])[2],
                        y2: (legacyEasing.cubicBezier as number[])[3],
                      }
                    : { type: "LINEAR" };
              return {
                ...keyframe,
                easing,
                interpolation: typeof legacyEasing === "string" && legacyEasing === "STEP" ? "STEP" : "LINEAR",
                metadata: {},
              };
            }),
          })),
          clips: [],
          markers: [],
          triggers: [],
          events: [],
          metadata: {},
        },
      ],
    ),
  );
  return {
    ...document,
    schemaVersion: context.toVersion,
    migrationVersion: 3,
    timelines,
    stateMachines: {},
  };
});
defaultRegistry.registerMigration("1.3.0", "1.4.0", (document, context) => {
  const nodes = Object.fromEntries(
    Object.entries((document.nodes as Record<string, Record<string, unknown>> | undefined) ?? {}).map(([id, node]) => {
      if (node.type === "SCENE_3D") {
        return [
          id,
          {
            ...node,
            coordinateSystem: {
              handedness: "RIGHT_HANDED",
              upAxis: "Y",
              forwardAxis: "NEGATIVE_Z",
              unit: "M",
              rotationUnit: "RADIANS",
              quaternionOrder: "XYZW",
              transformComposition: "TRS",
            },
          },
        ];
      }
      if (node.type === "MESH_3D") {
        const topology = (node.topology as Record<string, unknown> | undefined) ?? {};
        return [
          id,
          {
            ...node,
            geometry: {
              sourceAssetId: node.geometryAssetId,
              sourceMeshIndex: 0,
              sourcePrimitiveIndex: 0,
              primitiveMode: "TRIANGLES",
              vertexCount: topology.vertices ?? 0,
              indexCount: Number(topology.triangles ?? 0) * 3,
              triangleCount: topology.triangles ?? 0,
              attributes: [],
              normalAvailable: false,
              tangentAvailable: false,
              texCoordSets: 0,
              skinAttributes: false,
              morphTargetCount: 0,
              drawCallEstimate: 1,
            },
          },
        ];
      }
      return [id, node];
    }),
  );
  return {
    ...document,
    schemaVersion: context.toVersion,
    migrationVersion: 4,
    nodes,
  };
});
// Phase 19B adds RIG_3D/BONE_3D node types plus optional skinBinding (Mesh3DNode) and rigId
// (Model3DNode) fields. No existing document has rig data to backfill — this is a structural
// passthrough, not a data transformation, mirroring how the "1.3.0" migration synthesizes
// coordinateSystem/geometry only for nodes that already carry the relevant type.
defaultRegistry.registerMigration("1.4.0", CURRENT_SCHEMA_VERSION, (document, context) => ({
  ...document,
  schemaVersion: context.toVersion,
  migrationVersion: 5,
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
