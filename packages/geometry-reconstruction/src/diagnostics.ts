import { deepFreeze } from "./immutable.js";
import { GeometryDiagnosticSchema, type GeometryDiagnostic } from "./schemas.js";

const severityOrder = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 } as const;

export function diagnostic(
  input: Omit<GeometryDiagnostic, "relatedIds" | "details"> & {
    readonly relatedIds?: readonly string[];
    readonly details?: Readonly<Record<string, unknown>>;
  },
): GeometryDiagnostic {
  return deepFreeze(GeometryDiagnosticSchema.parse({ relatedIds: [], details: {}, ...input }));
}

export function sortDiagnostics(input: readonly GeometryDiagnostic[]): readonly GeometryDiagnostic[] {
  const unique = new Map<string, GeometryDiagnostic>();
  for (const entry of input) {
    const key = [entry.code, entry.stage, ...entry.relatedIds].join("|");
    unique.set(key, entry);
  }
  return deepFreeze(
    [...unique.values()].sort(
      (left, right) =>
        severityOrder[left.severity] - severityOrder[right.severity] ||
        left.stage.localeCompare(right.stage) ||
        left.code.localeCompare(right.code),
    ),
  );
}

export function hasBlockingDiagnostics(input: readonly GeometryDiagnostic[]): boolean {
  return input.some((entry) => entry.severity === "CRITICAL");
}

export function hasErrorDiagnostics(input: readonly GeometryDiagnostic[]): boolean {
  return input.some((entry) => entry.severity === "CRITICAL" || entry.severity === "ERROR");
}
