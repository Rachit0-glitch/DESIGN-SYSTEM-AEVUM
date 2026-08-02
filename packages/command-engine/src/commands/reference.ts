import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import { RegisterReferenceCommandSchema, type RegisterReferenceCommand } from "../schemas.js";

registerCommand<RegisterReferenceCommand>({
  type: "reference.register",
  schema: RegisterReferenceCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const reference = command.payload.reference;
    if (source.references[reference.id]) {
      throw commandError("DUPLICATE_ID", `Reference ${reference.id} already exists.`, {
        referenceId: reference.id,
      });
    }
    if (!source.assets[reference.assetId]) {
      throw commandError("REFERENCE_MISSING", `Reference asset ${reference.assetId} does not exist.`, {
        assetId: reference.assetId,
      });
    }
    if (reference.viewportId && !source.settings.viewports[reference.viewportId]) {
      throw commandError("REFERENCE_MISSING", `Reference viewport ${reference.viewportId} does not exist.`, {
        viewportId: reference.viewportId,
      });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const reference = command.payload.reference;
    return {
      document: { ...source, references: { ...source.references, [reference.id]: reference } },
      changes: { added: [reference.id] },
      event: { type: "ReferenceRegistered", entityIds: [reference.id] },
    };
  },
});
