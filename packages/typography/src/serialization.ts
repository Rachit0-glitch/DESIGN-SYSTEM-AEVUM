import { FontRecordSchema, type FontRecord } from "./schemas.js";

export function serializeFontRegistry(registry: Readonly<Record<string, FontRecord>>, pretty = false): string {
  return JSON.stringify(registry, null, pretty ? 2 : undefined);
}

export function deserializeFontRegistry(serialized: string): Readonly<Record<string, FontRecord>> {
  const parsed = JSON.parse(serialized) as unknown;
  const registry = Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).map(([key, value]) => {
      const font = FontRecordSchema.parse(value);
      if (key !== font.id) throw new Error(`Font registry key ${key} does not match ${font.id}.`);
      return [key, font];
    }),
  );
  return immutable(registry);
}

function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
