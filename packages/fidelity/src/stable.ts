import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [key, normalize(item)]);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function fidelityFingerprint(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

export function fidelityId(scope: string, value: unknown): string {
  return `${scope}:${fidelityFingerprint(value).slice(7, 39)}`;
}

export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
