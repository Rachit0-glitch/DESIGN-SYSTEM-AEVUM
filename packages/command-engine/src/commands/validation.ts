import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import { RecordValidationCommandSchema, type RecordValidationCommand } from "../schemas.js";

registerCommand<RecordValidationCommand>({
  type: "validation.record",
  schema: RecordValidationCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    const record = command.payload.record;
    if (source.validations[record.id]) {
      throw commandError("DUPLICATE_ID", `Validation record ${record.id} already exists.`, { recordId: record.id });
    }
    for (const referenceId of record.referenceIds) {
      if (!source.references[referenceId]) {
        throw commandError("REFERENCE_MISSING", `Reference ${referenceId} does not exist.`, { referenceId });
      }
    }
    for (const assetId of [...record.heatmapAssetIds, ...(record.reportAssetId ? [record.reportAssetId] : [])]) {
      if (!source.assets[assetId]) {
        throw commandError("REFERENCE_MISSING", `Asset ${assetId} does not exist.`, { assetId });
      }
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const record = command.payload.record;
    return {
      document: { ...source, validations: { ...source.validations, [record.id]: record } },
      changes: { added: [record.id] },
      event: { type: "ValidationRecorded", entityIds: [record.id] },
    };
  },
});
