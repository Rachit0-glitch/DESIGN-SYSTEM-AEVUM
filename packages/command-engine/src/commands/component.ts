import { commandError } from "../errors.js";
import { requireDocument, requireNode } from "../immutable.js";
import { registerCommand } from "../registry.js";
import { RegisterComponentCommandSchema, type RegisterComponentCommand } from "../schemas.js";

// Registers a real ComponentSchema definition pointing at an already-real, already-materialized
// node subtree — built by the normal node-creation path, exactly like any other node, with its own
// real type (FRAME, TEXT, SHAPE, IMAGE, ...) intact. The root node is NOT retyped to "COMPONENT":
// document-model's own id-prefix validator requires a COMPONENT node's id to carry the
// "component_" prefix, and ComponentNodeSchema has no type-specific fields at all (no content/runs
// for TEXT, no geometry/fillTokenId for SHAPE, etc.) — retyping a leaf TEXT/SHAPE/IMAGE root would
// destroy its real content. @aevum/scene-runtime's projector only ever does
// `document.nodes[component.rootNodeId]` — it never requires that node to literally be type
// COMPONENT — so pointing at the real, unmodified node is both correct and sufficient.
registerCommand<RegisterComponentCommand>({
  type: "component.register",
  schema: RegisterComponentCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const component = command.payload.component;
    if (source.components[component.id]) {
      throw commandError("DUPLICATE_ID", `Component ${component.id} already exists.`, { componentId: component.id });
    }
    const root = requireNode(source, component.rootNodeId);
    if (root.locked) throw commandError("LOCKED_ENTITY", `Node ${root.id} is locked.`, { nodeId: root.id });
    if (root.type === "PAGE" || root.type === "COMPONENT_INSTANCE") {
      throw commandError(
        "COMMAND_VALIDATION_ERROR",
        `Node ${root.id} (${root.type}) cannot become a component definition.`,
        { nodeId: root.id, nodeType: root.type },
      );
    }
    const existingOwner = Object.values(source.components).find((entry) => entry.rootNodeId === root.id);
    if (existingOwner) {
      throw commandError(
        "CONFLICT_ERROR",
        `Node ${root.id} is already the definition root of component ${existingOwner.id}.`,
        { nodeId: root.id, componentId: existingOwner.id },
      );
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const component = command.payload.component;
    return {
      document: { ...source, components: { ...source.components, [component.id]: component } },
      changes: { added: [component.id] },
      event: { type: "ComponentRegistered", entityIds: [component.id, component.rootNodeId] },
    };
  },
});
