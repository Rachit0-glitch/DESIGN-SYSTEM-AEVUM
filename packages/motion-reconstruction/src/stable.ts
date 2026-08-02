import { createHash } from "node:crypto";
import { EntityIdSchema, type EntityIdPrefix } from "@aevum/document-model";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function fingerprint(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function uuidFromValue(value: unknown): string {
  const hex = fingerprint(value).slice(7);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function deterministicEntityId(prefix: EntityIdPrefix, value: unknown): string {
  return EntityIdSchema.parse(`${prefix}_${uuidFromValue(value)}`);
}

export function deterministicId(scope: string, value: unknown): string {
  return `${scope}:${fingerprint(value).slice(7, 39)}`;
}

export function deterministicCommandId(value: unknown): `cmd_${string}` {
  return `cmd_${uuidFromValue(value)}`;
}

export function deterministicTransactionId(value: unknown): `tx_${string}` {
  return `tx_${uuidFromValue(value)}`;
}
