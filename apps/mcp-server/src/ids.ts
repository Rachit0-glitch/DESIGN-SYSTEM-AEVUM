import { createHash, randomUUID } from "node:crypto";

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

export function createMcpRequestId(): `mcp_req_${string}` {
  return `mcp_req_${randomUUID()}`;
}

export function createMcpAuditId(): `mcp_audit_${string}` {
  return `mcp_audit_${randomUUID()}`;
}
