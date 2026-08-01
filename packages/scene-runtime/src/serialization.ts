import type { RuntimeNode, RuntimeReachability, SceneProjectionResult } from "./types.js";

export interface SerializableSceneProjection {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly schemaVersion: string;
  readonly projectionVersion: string;
  readonly viewport: SceneProjectionResult["viewport"];
  readonly qualityMode: SceneProjectionResult["qualityMode"];
  readonly rootIds: readonly string[];
  readonly nodes: readonly RuntimeNode[];
  readonly reachability: Readonly<Record<string, RuntimeReachability>>;
  readonly dependencyGraph: { readonly edges: SceneProjectionResult["dependencyGraph"]["edges"] };
  readonly diagnostics: SceneProjectionResult["diagnostics"];
  readonly statistics: SceneProjectionResult["statistics"];
  readonly fingerprint: string;
  readonly complete: boolean;
}

export function toSerializableSceneProjection(projection: SceneProjectionResult): SerializableSceneProjection {
  const nodes = [...projection.nodes.values()].sort((left, right) => left.traversalIndex - right.traversalIndex);
  const reachability = Object.fromEntries(
    [...projection.reachability].sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    documentId: projection.documentId,
    documentVersion: projection.documentVersion,
    schemaVersion: projection.schemaVersion,
    projectionVersion: projection.projectionVersion,
    viewport: projection.viewport,
    qualityMode: projection.qualityMode,
    rootIds: projection.rootIds,
    nodes,
    reachability,
    dependencyGraph: { edges: projection.dependencyGraph.edges },
    diagnostics: projection.diagnostics,
    statistics: projection.statistics,
    fingerprint: projection.fingerprint,
    complete: projection.complete,
  };
}

export function serializeSceneProjection(projection: SceneProjectionResult, pretty = false): string {
  return JSON.stringify(toSerializableSceneProjection(projection), null, pretty ? 2 : undefined);
}
