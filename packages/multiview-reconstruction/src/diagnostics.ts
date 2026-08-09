import { deepFreeze } from "./immutable.js";
import { MultiViewDiagnosticSchema, type MultiViewDiagnostic } from "./schemas.js";

const severityOrder = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 } as const;

export function diagnostic(
  input: Omit<MultiViewDiagnostic, "relatedIds" | "details"> & {
    readonly relatedIds?: readonly string[];
    readonly details?: Readonly<Record<string, unknown>>;
  },
): MultiViewDiagnostic {
  return deepFreeze(MultiViewDiagnosticSchema.parse({ relatedIds: [], details: {}, ...input }));
}

export function sortDiagnostics(input: readonly MultiViewDiagnostic[]): readonly MultiViewDiagnostic[] {
  const unique = new Map<string, MultiViewDiagnostic>();
  for (const entry of input) {
    const key = [entry.code, entry.stage, entry.path ?? "", ...entry.relatedIds].join("|");
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

export function hasBlockingDiagnostics(input: readonly MultiViewDiagnostic[]): boolean {
  return input.some((entry) => entry.severity === "CRITICAL");
}

export function hasErrorDiagnostics(input: readonly MultiViewDiagnostic[]): boolean {
  return input.some((entry) => entry.severity === "CRITICAL" || entry.severity === "ERROR");
}
