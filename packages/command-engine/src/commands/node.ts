import type { DesignNode } from "@aevum/document-model";
import { commandError } from "../errors.js";
import {
  addNode,
  collectSubtreeIds,
  insertAt,
  moveWithin,
  removeNodeSubtree,
  replaceNode,
  requireDocument,
  requireNode,
  wouldCreateCycle,
} from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  CreateNodeCommandSchema,
  CreateRigCommandSchema,
  DeleteNodeCommandSchema,
  DuplicateNodeCommandSchema,
  MoveNodeCommandSchema,
  ReparentNodeCommandSchema,
  UpdateNodeCommandSchema,
  type CreateNodeCommand,
  type CreateRigCommand,
  type DeleteNodeCommand,
  type DuplicateNodeCommand,
  type MoveNodeCommand,
  type ReparentNodeCommand,
  type UpdateNodeCommand,
} from "../schemas.js";

registerCommand<CreateRigCommand>({
  type: "rig.create",
  schema: CreateRigCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const { rig, bones } = command.payload;
    if (rig.type !== "RIG_3D" || bones.some((bone) => bone.type !== "BONE_3D")) {
      throw commandError("COMMAND_VALIDATION_ERROR", "rig.create requires one RIG_3D node and BONE_3D nodes.");
    }
    if (!rig.parentId) throw commandError("COMMAND_VALIDATION_ERROR", "A created rig requires a canonical parent.");
    const parent = requireNode(source, rig.parentId);
    if (parent.locked) throw commandError("LOCKED_ENTITY", `Node ${parent.id} is locked.`, { nodeId: parent.id });
    const ids = [rig.id, ...bones.map((bone) => bone.id)];
    if (new Set(ids).size !== ids.length) throw commandError("DUPLICATE_ID", "Rig and bone IDs must be unique.");
    for (const id of ids) {
      if (source.nodes[id]) throw commandError("DUPLICATE_ID", `Node ${id} already exists.`, { nodeId: id });
    }
    const boneIds = new Set(bones.map((bone) => bone.id));
    if (rig.boneIds.length !== boneIds.size || rig.boneIds.some((id) => !boneIds.has(id))) {
      throw commandError("COMMAND_VALIDATION_ERROR", "Rig boneIds must exactly match the supplied bones.");
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const rig = command.payload.rig as Extract<DesignNode, { type: "RIG_3D" }>;
    const parent = requireNode(source, rig.parentId ?? "");
    const nodes = {
      ...source.nodes,
      [parent.id]: { ...parent, childIds: [...parent.childIds, rig.id] },
      [rig.id]: rig,
    };
    for (const bone of command.payload.bones) nodes[bone.id] = bone;
    return {
      document: { ...source, nodes },
      changes: { added: [rig.id, ...command.payload.bones.map((bone) => bone.id)], updated: [parent.id] },
      event: { type: "RigCreated", entityIds: [rig.id, ...command.payload.bones.map((bone) => bone.id)] },
    };
  },
});

registerCommand<CreateNodeCommand>({
  type: "node.create",
  schema: CreateNodeCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const node = command.payload.node;
    if (node.type === "PAGE") throw commandError("CONFLICT_ERROR", "PAGE nodes must use page.create.");
    if (node.type === "COMPONENT_INSTANCE" && !source.components[node.componentId]) {
      throw commandError("REFERENCE_MISSING", `Component ${node.componentId} does not exist.`, {
        componentId: node.componentId,
      });
    }
    if (source.nodes[node.id])
      throw commandError("DUPLICATE_ID", `Node ${node.id} already exists.`, { nodeId: node.id });
    if (node.childIds.length > 0)
      throw commandError("CONFLICT_ERROR", "A created node must not contain existing children.");
    if (node.parentId) {
      const parent = requireNode(source, node.parentId);
      if (parent.locked) {
        throw commandError("LOCKED_ENTITY", `Node ${parent.id} is locked.`, { nodeId: parent.id });
      }
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const next = addNode(source, command.payload.node, command.payload.index);
    return {
      document: next,
      changes: {
        added: [command.payload.node.id],
        updated: command.payload.node.parentId ? [command.payload.node.parentId] : [],
      },
      event: { type: "NodeCreated", entityIds: [command.payload.node.id] },
    };
  },
});

registerCommand<DeleteNodeCommand>({
  type: "node.delete",
  schema: DeleteNodeCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const node = requireNode(source, command.payload.nodeId);
    if (node.type === "PAGE") throw commandError("CONFLICT_ERROR", "PAGE nodes must use page.delete.");
    const lockedNodeId = collectSubtreeIds(source, node.id).find((nodeId) => requireNode(source, nodeId).locked);
    if (lockedNodeId) {
      throw commandError("LOCKED_ENTITY", `Node ${lockedNodeId} is locked.`, { nodeId: lockedNodeId });
    }
    const subtreeIds = collectSubtreeIds(source, node.id);
    const protectedRigIds = subtreeIds.filter((nodeId) => {
      const candidate = requireNode(source, nodeId);
      return (
        candidate.type === "RIG_3D" ||
        candidate.type === "BONE_3D" ||
        candidate.type === "MODEL_3D" ||
        (candidate.type === "MESH_3D" && candidate.skinBinding !== undefined)
      );
    });
    if (protectedRigIds.length > 0) {
      throw commandError(
        "CONFLICT_ERROR",
        "Generic node deletion cannot remove rig, bone, rig-linked model, or skinned-mesh state. Use an explicit rig-aware command.",
        { nodeId: node.id, protectedRigIds },
      );
    }
    if (node.parentId) {
      const parent = requireNode(source, node.parentId);
      if (parent.locked) {
        throw commandError("LOCKED_ENTITY", `Node ${parent.id} is locked.`, { nodeId: parent.id });
      }
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const parentId = requireNode(source, command.payload.nodeId).parentId;
    const removed = removeNodeSubtree(source, command.payload.nodeId);
    return {
      document: removed.document,
      changes: { removed: removed.removedIds, updated: parentId ? [parentId] : [] },
      event: { type: "NodeDeleted", entityIds: removed.removedIds },
    };
  },
});

registerCommand<MoveNodeCommand>({
  type: "node.move",
  schema: MoveNodeCommandSchema,
  canExecute(document, command) {
    const node = requireNode(requireDocument(document), command.payload.nodeId);
    if (node.locked) {
      throw commandError("LOCKED_ENTITY", `Node ${node.id} is locked.`, { nodeId: node.id });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const node = requireNode(source, command.payload.nodeId);
    if (node.parentId) {
      const parent = requireNode(source, node.parentId);
      const next = replaceNode(source, {
        ...parent,
        childIds: moveWithin(parent.childIds, node.id, command.payload.index),
      });
      return {
        document: next,
        changes: { moved: [node.id], updated: [parent.id] },
        event: { type: "NodeMoved", entityIds: [node.id], data: { index: command.payload.index } },
      };
    }
    const rootNodeIds = moveWithin(source.rootNodeIds, node.id, command.payload.index);
    const pages = node.type === "PAGE" ? moveWithin(source.pages, node.id, command.payload.index) : source.pages;
    return {
      document: { ...source, rootNodeIds, pages },
      changes: { moved: [node.id] },
      event: { type: "NodeMoved", entityIds: [node.id], data: { index: command.payload.index } },
    };
  },
});

registerCommand<ReparentNodeCommand>({
  type: "node.reparent",
  schema: ReparentNodeCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const node = requireNode(source, command.payload.nodeId);
    if (node.type === "PAGE") throw commandError("CONFLICT_ERROR", "A page cannot be reparented.");
    if (node.locked) throw commandError("LOCKED_ENTITY", `Node ${node.id} is locked.`, { nodeId: node.id });
    if (node.parentId) {
      const oldParent = requireNode(source, node.parentId);
      if (oldParent.locked) {
        throw commandError("LOCKED_ENTITY", `Node ${oldParent.id} is locked.`, { nodeId: oldParent.id });
      }
    }
    if (command.payload.parentId) {
      const newParent = requireNode(source, command.payload.parentId);
      if (newParent.locked) {
        throw commandError("LOCKED_ENTITY", `Node ${newParent.id} is locked.`, { nodeId: newParent.id });
      }
    }
    if (wouldCreateCycle(source, node.id, command.payload.parentId)) {
      throw commandError("CYCLE_DETECTED", `Reparenting ${node.id} would create a hierarchy cycle.`, {
        nodeId: node.id,
        parentId: command.payload.parentId,
      });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const node = requireNode(source, command.payload.nodeId);
    const nodes = { ...source.nodes };
    const updatedIds: string[] = [];

    if (node.parentId) {
      const oldParent = requireNode(source, node.parentId);
      nodes[oldParent.id] = { ...oldParent, childIds: oldParent.childIds.filter((id) => id !== node.id) };
      updatedIds.push(oldParent.id);
    }

    let rootNodeIds = source.rootNodeIds.filter((id) => id !== node.id);
    if (command.payload.parentId) {
      const newParent = nodes[command.payload.parentId] ?? requireNode(source, command.payload.parentId);
      nodes[newParent.id] = { ...newParent, childIds: insertAt(newParent.childIds, node.id, command.payload.index) };
      updatedIds.push(newParent.id);
    } else {
      rootNodeIds = insertAt(rootNodeIds, node.id, command.payload.index);
    }
    nodes[node.id] = { ...node, parentId: command.payload.parentId };

    return {
      document: { ...source, nodes, rootNodeIds },
      changes: { moved: [node.id], updated: updatedIds },
      event: { type: "NodeReparented", entityIds: [node.id], data: { parentId: command.payload.parentId } },
    };
  },
});

registerCommand<DuplicateNodeCommand>({
  type: "node.duplicate",
  schema: DuplicateNodeCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const sourceNode = requireNode(source, command.payload.sourceNodeId);
    if (sourceNode.type === "PAGE")
      throw commandError("CONFLICT_ERROR", "Page duplication is not supported by node.duplicate.");
    if (command.payload.parentId) requireNode(source, command.payload.parentId);
    const subtree = collectSubtreeIds(source, sourceNode.id);
    if (command.payload.parentId && subtree.includes(command.payload.parentId)) {
      throw commandError("CYCLE_DETECTED", "A duplicate cannot be inserted inside its source subtree.");
    }
    const mappedSourceIds = Object.keys(command.payload.idMap);
    if (mappedSourceIds.length !== subtree.length || subtree.some((id) => !command.payload.idMap[id])) {
      throw commandError(
        "COMMAND_VALIDATION_ERROR",
        "DuplicateNode idMap must map every source subtree node exactly once.",
      );
    }
    const targetIds = Object.values(command.payload.idMap);
    if (new Set(targetIds).size !== targetIds.length)
      throw commandError("DUPLICATE_ID", "DuplicateNode target IDs must be unique.");
    for (const targetId of targetIds) {
      if (source.nodes[targetId])
        throw commandError("DUPLICATE_ID", `Node ${targetId} already exists.`, { nodeId: targetId });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const subtree = collectSubtreeIds(source, command.payload.sourceNodeId);
    const nodes = { ...source.nodes };
    for (const sourceId of subtree) {
      const original = requireNode(source, sourceId);
      const id = command.payload.idMap[sourceId];
      if (!id) throw commandError("COMMAND_VALIDATION_ERROR", `Missing duplicate ID for ${sourceId}.`);
      const isRoot = sourceId === command.payload.sourceNodeId;
      nodes[id] = {
        ...original,
        id,
        name: isRoot && command.payload.name ? command.payload.name : original.name,
        parentId: isRoot ? command.payload.parentId : (command.payload.idMap[original.parentId ?? ""] ?? null),
        childIds: original.childIds.map((childId) => command.payload.idMap[childId] ?? childId),
      } as DesignNode;
    }
    const duplicatedRootId = command.payload.idMap[command.payload.sourceNodeId];
    if (!duplicatedRootId) throw commandError("COMMAND_VALIDATION_ERROR", "Missing duplicate root ID.");

    let rootNodeIds = source.rootNodeIds;
    const updated: string[] = [];
    if (command.payload.parentId) {
      const parent = requireNode(source, command.payload.parentId);
      nodes[parent.id] = { ...parent, childIds: insertAt(parent.childIds, duplicatedRootId, command.payload.index) };
      updated.push(parent.id);
    } else {
      rootNodeIds = insertAt(rootNodeIds, duplicatedRootId, command.payload.index);
    }
    return {
      document: { ...source, nodes, rootNodeIds },
      changes: { added: Object.values(command.payload.idMap), updated },
      event: {
        type: "NodeDuplicated",
        entityIds: Object.values(command.payload.idMap),
        data: { sourceNodeId: command.payload.sourceNodeId },
      },
    };
  },
});

const forbiddenUpdateKeys = new Set(["id", "type", "parentId", "childIds"]);

registerCommand<UpdateNodeCommand>({
  type: "node.update",
  schema: UpdateNodeCommandSchema,
  canExecute(document, command) {
    const node = requireNode(requireDocument(document), command.payload.nodeId);
    if (node.locked) {
      throw commandError("LOCKED_ENTITY", `Node ${node.id} is locked.`, { nodeId: node.id });
    }
    const keys = Object.keys(command.payload.changes);
    if (keys.length === 0) throw commandError("COMMAND_VALIDATION_ERROR", "UpdateNode changes must not be empty.");
    const forbidden = keys.filter((key) => forbiddenUpdateKeys.has(key));
    if (forbidden.length > 0) {
      throw commandError("CONFLICT_ERROR", `UpdateNode cannot change structural fields: ${forbidden.join(", ")}.`, {
        forbidden,
      });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const node = requireNode(source, command.payload.nodeId);
    const updated = { ...node, ...command.payload.changes } as DesignNode;
    return {
      document: replaceNode(source, updated),
      changes: { updated: [node.id] },
      event: { type: "NodeUpdated", entityIds: [node.id], data: { fields: Object.keys(command.payload.changes) } },
    };
  },
});
