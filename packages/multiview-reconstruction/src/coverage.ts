import { averageConfidence } from "./confidence.js";
import { deterministicScopedId } from "./deterministic.js";
import { diagnostic } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import { CoverageReportSchema, type CoverageReport, type MultiViewDiagnostic, type ViewRecord } from "./schemas.js";

const DIRECTIONS = ["FRONT", "BACK", "LEFT", "RIGHT", "TOP", "BOTTOM"] as const;
const WEAK_CONFIDENCE_THRESHOLD = 0.5;

export interface BuildCoverageReportResult {
  readonly coverage: CoverageReport;
  readonly diagnostics: readonly MultiViewDiagnostic[];
}

/** Determines, for each of the six primary directions, whether the reference set has strong,
 * weak, or no evidence. This is real bookkeeping over the resolved view roles, not a guess. */
export function buildCoverageReport(views: readonly ViewRecord[]): BuildCoverageReportResult {
  const directions: Record<string, { status: "COVERED" | "WEAK" | "MISSING"; confidence: number; viewIds: string[] }> =
    {};

  for (const direction of DIRECTIONS) {
    const matches = views.filter((view) => view.role.role === direction);
    if (matches.length === 0) {
      directions[direction] = { status: "MISSING", confidence: 0, viewIds: [] };
      continue;
    }
    const confidence = averageConfidence(matches.map((view) => view.role.confidence));
    directions[direction] = {
      status: confidence >= WEAK_CONFIDENCE_THRESHOLD ? "COVERED" : "WEAK",
      confidence,
      viewIds: matches.map((view) => view.id),
    };
  }

  const coveredCount = Object.values(directions).filter((entry) => entry.status === "COVERED").length;
  const weakCount = Object.values(directions).filter((entry) => entry.status === "WEAK").length;
  const diversityScore = (coveredCount + weakCount * 0.5) / DIRECTIONS.length;
  const overallScore = (coveredCount * 1 + weakCount * 0.5) / DIRECTIONS.length;

  const diagnostics: MultiViewDiagnostic[] = [];
  if (coveredCount + weakCount < 2) {
    diagnostics.push(
      diagnostic({
        code: "VIEW_COVERAGE_INSUFFICIENT",
        severity: "ERROR",
        message: "Fewer than two directions have any camera coverage; depth cannot be constrained.",
        stage: "COVERAGE_ANALYSIS",
        recoverable: true,
      }),
    );
  } else if (coveredCount < 3) {
    diagnostics.push(
      diagnostic({
        code: "VIEW_COVERAGE_INSUFFICIENT",
        severity: "WARNING",
        message: "Fewer than three directions have strong coverage; reconstruction confidence will be limited.",
        stage: "COVERAGE_ANALYSIS",
        recoverable: true,
      }),
    );
  }

  const coverage = deepFreeze(
    CoverageReportSchema.parse({
      id: deterministicScopedId("coverage", { directions }),
      directions,
      diversityScore,
      overallScore,
    }),
  );

  return { coverage, diagnostics };
}
