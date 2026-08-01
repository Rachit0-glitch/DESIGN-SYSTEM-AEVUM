import type { RuntimeDiagnostic } from "./types.js";

const severityRank = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 } as const;

export function compareDiagnostics(left: RuntimeDiagnostic, right: RuntimeDiagnostic): number {
  return (
    severityRank[left.severity] - severityRank[right.severity] ||
    left.code.localeCompare(right.code) ||
    (left.path ?? "").localeCompare(right.path ?? "") ||
    (left.entityId ?? "").localeCompare(right.entityId ?? "") ||
    left.message.localeCompare(right.message)
  );
}

export function hasStructuralFailure(diagnostics: readonly RuntimeDiagnostic[]): boolean {
  return diagnostics.some((entry) => entry.severity === "ERROR" || entry.severity === "CRITICAL");
}
