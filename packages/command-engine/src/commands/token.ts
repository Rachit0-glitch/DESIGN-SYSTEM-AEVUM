import { commandError } from "../errors.js";
import { requireDocument } from "../immutable.js";
import { registerCommand } from "../registry.js";
import { RegisterTokenCommandSchema, type RegisterTokenCommand } from "../schemas.js";

registerCommand<RegisterTokenCommand>({
  type: "token.register",
  schema: RegisterTokenCommandSchema,
  canExecute(document, command) {
    const source = requireDocument(document);
    if (source.tokens[command.payload.token.id]) {
      throw commandError("DUPLICATE_ID", `Token ${command.payload.token.id} already exists.`, {
        tokenId: command.payload.token.id,
      });
    }
  },
  apply(document, command) {
    const source = requireDocument(document);
    const token = command.payload.token;
    return {
      document: { ...source, tokens: { ...source.tokens, [token.id]: token } },
      changes: { added: [token.id] },
      event: { type: "TokenRegistered", entityIds: [token.id] },
    };
  },
});
