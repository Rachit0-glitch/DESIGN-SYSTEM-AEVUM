import { deepFreeze } from "./immutable.js";
import { RigDiagnosticSchema, type RigDiagnostic } from "./schemas.js";

const severityOrder = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 } as const;

export function diagnostic(
  input: Omit<RigDiagnostic, "relatedIds" | "details"> & {
    readonly relatedIds?: readonly string[];
    readonly details?: Readonly<Record<string, unknown>>;
  },
): RigDiagnostic {
  return deepFreeze(RigDiagnosticSchema.parse({ relatedIds: [], details: {}, ...input }));
}

export function sortDiagnostics(input: readonly RigDiagnostic[]): readonly RigDiagnostic[] {
  const unique = new Map<string, RigDiagnostic>();
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

export function hasBlockingDiagnostics(input: readonly RigDiagnostic[]): boolean {
  return input.some((entry) => entry.severity === "CRITICAL");
}

export function hasErrorDiagnostics(input: readonly RigDiagnostic[]): boolean {
  return input.some((entry) => entry.severity === "CRITICAL" || entry.severity === "ERROR");
}
