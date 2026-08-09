const sensitiveKey = /authorization|cookie|token|secret|password|api.?key|service.?role|database.?url/i;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const databaseUrlPattern = /\b(?:postgres(?:ql)?|redis):\/\/[^\s"']+/gi;

function redactString(value: string): string {
  return value.replace(jwtPattern, "[REDACTED_JWT]").replace(databaseUrlPattern, "[REDACTED_URL]");
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : redactSecrets(entry)]),
    );
  }
  return value;
}
