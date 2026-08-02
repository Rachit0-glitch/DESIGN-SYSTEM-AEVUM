import { deepFreeze } from "./immutable.js";
import { ReconstructionDiagnosticSchema, type ReconstructionDiagnostic } from "./schemas.js";

const severityOrder = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 } as const;

export function diagnostic(
  input: Omit<ReconstructionDiagnostic, "relatedIds" | "details"> & {
    readonly relatedIds?: readonly string[];
    readonly details?: Readonly<Record<string, unknown>>;
  },
): ReconstructionDiagnostic {
  return deepFreeze(ReconstructionDiagnosticSchema.parse({ relatedIds: [], details: {}, ...input }));
}

export function sortDiagnostics(input: readonly ReconstructionDiagnostic[]): readonly ReconstructionDiagnostic[] {
  const unique = new Map<string, ReconstructionDiagnostic>();
  for (const entry of input) {
    const key = [entry.code, entry.stage, entry.entityId ?? "", entry.path ?? "", ...entry.relatedIds].join("|");
    unique.set(key, entry);
  }
  return deepFreeze(
    [...unique.values()].sort(
      (left, right) =>
        severityOrder[left.severity] - severityOrder[right.severity] ||
        left.stage.localeCompare(right.stage) ||
        (left.entityId ?? "").localeCompare(right.entityId ?? "") ||
        left.code.localeCompare(right.code),
    ),
  );
}

export function hasBlockingDiagnostics(input: readonly ReconstructionDiagnostic[]): boolean {
  return input.some((entry) => entry.severity === "CRITICAL");
}
