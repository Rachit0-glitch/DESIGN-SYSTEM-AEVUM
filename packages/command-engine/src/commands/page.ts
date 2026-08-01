import { commandError } from "../errors.js";
import { addNode, insertAt, removeNodeSubtree, replaceNode, requireDocument, requireNode } from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  CreatePageCommandSchema,
  DeletePageCommandSchema,
  RenamePageCommandSchema,
  type CreatePageCommand,
  type DeletePageCommand,
  type RenamePageCommand,
} from "../schemas.js";

registerCommand<CreatePageCommand>({
  type: "page.create",
  schema: CreatePageCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const page = command.payload.page;
    if (page.type !== "PAGE")
      throw commandError("COMMAND_VALIDATION_ERROR", "CreatePage payload must contain a PAGE node.");
    if (page.parentId !== null || page.childIds.length > 0) {
      throw commandError("CONFLICT_ERROR", "A created page must be a detached empty root.");
    }
    if (source.nodes[page.id])
      throw commandError("DUPLICATE_ID", `Node ${page.id} already exists.`, { nodeId: page.id });
  },
  apply(document, command) {
    const source = requireDocument(document);
    const page = command.payload.page;
    if (page.type !== "PAGE")
      throw commandError("COMMAND_VALIDATION_ERROR", "CreatePage payload must contain a PAGE node.");
    const withNode = addNode(source, page, command.payload.index);
    return {
      document: { ...withNode, pages: insertAt(withNode.pages, page.id, command.payload.index) },
      changes: { added: [page.id] },
      event: { type: "PageCreated", entityIds: [page.id] },
    };
  },
});

registerCommand<DeletePageCommand>({
  type: "page.delete",
  schema: DeletePageCommandSchema,
  canExecute(document, command) {
    const page = requireNode(requireDocument(document), command.payload.pageId);
    if (page.type !== "PAGE") throw commandError("CONFLICT_ERROR", `${page.id} is not a page.`);
  },
  apply(document, command) {
    const removed = removeNodeSubtree(requireDocument(document), command.payload.pageId);
    return {
      document: removed.document,
      changes: { removed: removed.removedIds },
      event: { type: "PageDeleted", entityIds: removed.removedIds },
    };
  },
});

registerCommand<RenamePageCommand>({
  type: "page.rename",
  schema: RenamePageCommandSchema,
  canExecute(document, command) {
    const page = requireNode(requireDocument(document), command.payload.pageId);
    if (page.type !== "PAGE") throw commandError("CONFLICT_ERROR", `${page.id} is not a page.`);
  },
  apply(document, command) {
    const source = requireDocument(document);
    const page = requireNode(source, command.payload.pageId);
    const next = replaceNode(source, { ...page, name: command.payload.name });
    return {
      document: next,
      changes: { updated: [page.id] },
      event: { type: "PageRenamed", entityIds: [page.id], data: { name: command.payload.name } },
    };
  },
});
