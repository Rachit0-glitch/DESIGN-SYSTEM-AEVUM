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

export function deterministicAgentId(scope: string, value: unknown): string {
  return `${scope}:${fingerprint(value).slice(7, 39)}`;
}

export function deterministicIdempotencyKey(input: {
  readonly sessionId: string;
  readonly runId: string;
  readonly stepId: string;
  readonly tool: string;
  readonly input: unknown;
}): string {
  return `agent:${fingerprint(input).slice(7, 55)}`;
}
