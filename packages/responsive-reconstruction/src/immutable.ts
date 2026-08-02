export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !ArrayBuffer.isView(value) && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
