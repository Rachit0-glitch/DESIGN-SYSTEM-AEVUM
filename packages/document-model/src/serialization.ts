import type { CanonicalDesignDocument } from "./schema.js";
import { assertValidDocument } from "./validation.js";

export function serialize(document: CanonicalDesignDocument, pretty = false): string {
  return JSON.stringify(assertValidDocument(document), null, pretty ? 2 : undefined);
}

export function deserialize(serialized: string): CanonicalDesignDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new SyntaxError(
      `Canonical Design Document is not valid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
    );
  }
  return assertValidDocument(parsed);
}
