import type { CanonicalDesignDocument } from "@aevum/document-model";
import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import {
  CreateDocumentCommandSchema,
  RenameDocumentCommandSchema,
  type CreateDocumentCommand,
  type RenameDocumentCommand,
} from "../schemas.js";

registerCommand<CreateDocumentCommand>({
  type: "document.create",
  schema: CreateDocumentCommandSchema,
  canExecute(document, command) {
    if (document) throw commandError("DOCUMENT_ALREADY_EXISTS", "Cannot create a document when one is already open.");
    if (command.expectedDocumentVersion !== 0) {
      throw commandError("VERSION_MISMATCH", "CreateDocument requires expectedDocumentVersion 0.");
    }
    if (command.payload.document.metadata.id !== command.documentId) {
      throw commandError("CONFLICT_ERROR", "Command documentId does not match the created document.");
    }
    if (command.payload.document.documentVersion !== 1) {
      throw commandError("CONFLICT_ERROR", "A new document must begin at version 1.");
    }
  },
  apply(_document, command) {
    return {
      document: command.payload.document,
      changes: { added: [command.documentId] },
      event: { type: "DocumentCreated", entityIds: [command.documentId] },
    };
  },
});

registerCommand<RenameDocumentCommand>({
  type: "document.rename",
  schema: RenameDocumentCommandSchema,
  canExecute(document) {
    requireDocument(document);
  },
  apply(document, command) {
    const source = requireDocument(document);
    const next: CanonicalDesignDocument = {
      ...source,
      metadata: { ...source.metadata, name: command.payload.name },
    };
    return {
      document: next,
      changes: { updated: [source.metadata.id] },
      event: { type: "DocumentRenamed", entityIds: [source.metadata.id], data: { name: command.payload.name } },
    };
  },
});
