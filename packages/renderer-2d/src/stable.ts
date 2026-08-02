import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (value instanceof Map) {
    return [...value.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)));
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}
