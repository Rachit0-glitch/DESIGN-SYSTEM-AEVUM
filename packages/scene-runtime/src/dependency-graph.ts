import { deepFreeze, immutableMap } from "./immutable.js";
import type { RuntimeDependencyEdge, RuntimeDependencyGraph } from "./types.js";

const edgeKey = (edge: RuntimeDependencyEdge): string => `${edge.fromId}\u0000${edge.type}\u0000${edge.toId}`;

export function buildDependencyGraph(input: readonly RuntimeDependencyEdge[]): RuntimeDependencyGraph {
  const unique = new Map<string, RuntimeDependencyEdge>();
  for (const edge of input) unique.set(edgeKey(edge), deepFreeze({ ...edge }));
  const edges = [...unique.values()].sort(
    (left, right) =>
      left.fromId.localeCompare(right.fromId) ||
      left.type.localeCompare(right.type) ||
      left.toId.localeCompare(right.toId),
  );
  const outgoing = new Map<string, RuntimeDependencyEdge[]>();
  const incoming = new Map<string, RuntimeDependencyEdge[]>();
  for (const edge of edges) {
    outgoing.set(edge.fromId, [...(outgoing.get(edge.fromId) ?? []), edge]);
    incoming.set(edge.toId, [...(incoming.get(edge.toId) ?? []), edge]);
  }
  return deepFreeze({
    edges,
    outgoing: immutableMap([...outgoing].map(([id, values]) => [id, Object.freeze(values)] as const)),
    incoming: immutableMap([...incoming].map(([id, values]) => [id, Object.freeze(values)] as const)),
  });
}
