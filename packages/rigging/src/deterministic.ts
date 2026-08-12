import { createHash } from "node:crypto";

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

export function fingerprint(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

/** Deterministic, content-addressed EntityId ({prefix}_{uuid-shaped-hash}) matching
 * `@aevum/document-model`'s `EntityIdSchema` pattern exactly. */
export function deterministicEntityId(prefix: string, scope: unknown): string {
  const hex = createHash("sha256").update(stableStringify({ prefix, scope })).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  const uuid = `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
  return `${prefix}_${uuid}`;
}

export function deterministicScopedId(scope: string, value: unknown): string {
  return `${scope}:${fingerprint(value).slice(7, 39)}`;
}
