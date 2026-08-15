import type { CanonicalDesignDocument, DesignNode } from "@aevum/document-model";
import { commandError } from "./errors.js";

export function requireDocument(document: CanonicalDesignDocument | null): CanonicalDesignDocument {
  if (!document) throw commandError("DOCUMENT_REQUIRED", "This command requires an open Canonical Design Document.");
  return document;
}

export function requireNode(document: CanonicalDesignDocument, nodeId: string): DesignNode {
  const node = document.nodes[nodeId];
  if (!node) throw commandError("REFERENCE_MISSING", `Node ${nodeId} does not exist.`, { nodeId });
  return node;
}

export function insertAt<T>(items: readonly T[], item: T, index = items.length): T[] {
  const target = Math.min(index, items.length);
  return [...items.slice(0, target), item, ...items.slice(target)];
}

export function moveWithin<T>(items: readonly T[], item: T, index: number): T[] {
  const without = items.filter((entry) => entry !== item);
  return insertAt(without, item, index);
}

export function collectSubtreeIds(document: CanonicalDesignDocument, rootId: string): string[] {
  const result: string[] = [];
  const visit = (id: string): void => {
    const node = requireNode(document, id);
    result.push(id);
    for (const childId of node.childIds) visit(childId);
  };
  visit(rootId);
  return result;
}

export function wouldCreateCycle(document: CanonicalDesignDocument, nodeId: string, parentId: string | null): boolean {
  if (!parentId) return false;
  if (parentId === nodeId) return true;
  return collectSubtreeIds(document, nodeId).includes(parentId);
}

export function replaceNode(document: CanonicalDesignDocument, node: DesignNode): CanonicalDesignDocument {
  return { ...document, nodes: { ...document.nodes, [node.id]: node } };
}

export function addNode(document: CanonicalDesignDocument, node: DesignNode, index?: number): CanonicalDesignDocument {
  const nodes = { ...document.nodes, [node.id]: node };
  if (node.parentId) {
    const parent = requireNode(document, node.parentId);
    nodes[parent.id] = { ...parent, childIds: insertAt(parent.childIds, node.id, index) };
    return { ...document, nodes };
  }
  return { ...document, nodes, rootNodeIds: insertAt(document.rootNodeIds, node.id, index) };
}

/**
 * Removing a node can leave a timeline track pointing at a target that no longer exists — a track's
 * targetId is a required field, so the track (and its references from any clip's trackIds) must be
 * removed with the node rather than left dangling, the same cascade already applied to childIds,
 * rootNodeIds, and pages below.
 */
function removeDanglingAnimationTracks(
  timelines: CanonicalDesignDocument["timelines"],
  removedNodeIds: ReadonlySet<string>,
): CanonicalDesignDocument["timelines"] {
  const result: CanonicalDesignDocument["timelines"] = { ...timelines };
  for (const [timelineId, timeline] of Object.entries(timelines)) {
    const keptTracks = timeline.tracks.filter((track) => !removedNodeIds.has(track.targetId));
    if (keptTracks.length === timeline.tracks.length) continue;
    const keptTrackIds = new Set(keptTracks.map((track) => track.id));
    result[timelineId] = {
      ...timeline,
      tracks: keptTracks,
      clips: timeline.clips.map((clip) => ({
        ...clip,
        trackIds: clip.trackIds.filter((trackId) => keptTrackIds.has(trackId)),
      })),
    };
  }
  return result;
}

export function removeNodeSubtree(
  document: CanonicalDesignDocument,
  nodeId: string,
): { document: CanonicalDesignDocument; removedIds: readonly string[] } {
  const node = requireNode(document, nodeId);
  const removedIds = collectSubtreeIds(document, nodeId);
  const removed = new Set(removedIds);
  const nodes = Object.fromEntries(Object.entries(document.nodes).filter(([id]) => !removed.has(id)));
  if (node.parentId) {
    const parent = requireNode(document, node.parentId);
    nodes[parent.id] = { ...parent, childIds: parent.childIds.filter((id) => id !== nodeId) };
  }
  return {
    document: {
      ...document,
      nodes,
      rootNodeIds: document.rootNodeIds.filter((id) => !removed.has(id)),
      pages: document.pages.filter((id) => !removed.has(id)),
      timelines: removeDanglingAnimationTracks(document.timelines, removed),
    },
    removedIds,
  };
}
