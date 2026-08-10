import type { MultiViewReconstructionProposal, MultiViewReferenceSet } from "@aevum/multiview-reconstruction";
import { generateInitialCandidates, type RawCandidate } from "./candidate-generation.js";
import { boxDimensionNeighbors, checkViewRegression, cylinderDimensionNeighbors } from "./correction.js";
import { deterministicScopedId, fingerprint } from "./deterministic.js";
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { exportMeshToGlb } from "./glb-export.js";
import { deepFreeze } from "./immutable.js";
import { checkStructuralValidity, computeMeshBounds, mergeMeshes, translateMesh } from "./mesh-utils.js";
import { resolveDimensionTargets, resolveScaleFactor } from "./primitives.js";
import {
  computeCrossViewFitScore,
  computeDifferenceEvidence,
  scoreLandmarks,
  scoreView,
  type ConstraintSatisfactionInput,
} from "./scoring.js";
import {
  CandidateReconstructionSchema,
  GEOMETRY_RECONSTRUCTION_SESSION_VERSION,
  ReconstructionConfigSchema,
  ReconstructionPassSchema,
  ReconstructionSessionReportSchema,
  type CandidateReconstruction,
  type GeometryDiagnostic,
  type QualityModeSchema,
  type ReconstructionConfigInput,
  type ReconstructionPass,
  type ReconstructionProviderIdSchema,
  type ReconstructionSessionReport,
  type ReconstructionStopReasonSchema,
} from "./schemas.js";
import type { RawMesh } from "./schemas.js";
import type { z } from "zod";

type QualityMode = z.infer<typeof QualityModeSchema>;
type ProviderId = z.infer<typeof ReconstructionProviderIdSchema>;
type StopReason = z.infer<typeof ReconstructionStopReasonSchema>;

const QUALITY_PRESETS: Record<QualityMode, Partial<ReconstructionConfigInput>> = {
  DRAFT: { voxelResolution: 16, maxCandidates: 2, maxPasses: 2 },
  STANDARD: { voxelResolution: 32, maxCandidates: 3, maxPasses: 6 },
  HIGH: { voxelResolution: 48, maxCandidates: 4, maxPasses: 10 },
};

export interface RunReconstructionSessionInput {
  readonly referenceSet: MultiViewReferenceSet;
  readonly proposal: MultiViewReconstructionProposal;
  readonly providerId: ProviderId;
  readonly providerVersion: string;
  readonly config?: Partial<ReconstructionConfigInput>;
  readonly createdAt: string;
}

export interface RunReconstructionSessionResult {
  readonly report: ReconstructionSessionReport;
  readonly selectedGlb?: Uint8Array;
}

function extractBoxHalfExtents(mesh: RawMesh) {
  const bounds = computeMeshBounds(mesh);
  return { x: bounds.size.x / 2, y: bounds.size.y / 2, z: bounds.size.z / 2 };
}

function extractCylinderDimensions(mesh: RawMesh) {
  const bounds = computeMeshBounds(mesh);
  return { radius: Math.max(bounds.size.x, bounds.size.z) / 2, halfHeight: bounds.size.y / 2 };
}

function buildConstraintEntries(referenceSet: MultiViewReferenceSet, mesh: RawMesh): ConstraintSatisfactionInput[] {
  const bounds = computeMeshBounds(mesh);
  const actualByLabel: Record<string, number> = {
    FRONT_WIDTH: bounds.size.x,
    SIDE_DEPTH: bounds.size.z,
    OVERALL_HEIGHT: bounds.size.y,
  };
  return resolveDimensionTargets(referenceSet).map((target) => ({
    targetLength: target.worldLength,
    actualLength: actualByLabel[target.label] ?? 0,
  }));
}

function buildPass(
  sessionId: string,
  passNumber: number,
  action: z.infer<typeof ReconstructionPassSchema>["action"],
  before: CandidateReconstruction | undefined,
  after: CandidateReconstruction,
  accepted: boolean,
  regressedViewIds: readonly string[],
  passDiagnostics: readonly GeometryDiagnostic[],
): ReconstructionPass {
  const base = {
    sessionId,
    passNumber,
    action,
    ...(before ? { candidateIdBefore: before.id } : {}),
    candidateIdAfter: after.id,
    ...(before ? { scoreBefore: before.score.overall } : {}),
    scoreAfter: after.score.overall,
    accepted,
    regressedViewIds: [...regressedViewIds],
  };
  return deepFreeze(
    ReconstructionPassSchema.parse({
      id: deterministicScopedId("reconstruction-pass", base),
      ...base,
      diagnostics: passDiagnostics,
      fingerprint: fingerprint(base),
    }),
  );
}

/**
 * The full Phase 18 deterministic reconstruction execution: checks camera-evidence sufficiency,
 * generates candidate geometry (box/cylinder primitive fit and/or voxel visual hull), scores every
 * candidate against real Phase 17 evidence, selects the best deterministically, then runs a
 * bounded local-search correction loop with a hard non-regression gate before finalizing. Produces
 * a GLB for the winning candidate but does not register any asset or touch any canonical document
 * — that is a separate, explicit step (see `canonical-import.ts` / `asset-registration.ts`).
 */
export async function runReconstructionSession(
  input: RunReconstructionSessionInput,
): Promise<RunReconstructionSessionResult> {
  const startedAt = Date.now();
  const qualityMode = input.config?.qualityMode ?? "STANDARD";
  const preset = QUALITY_PRESETS[qualityMode];
  const config = ReconstructionConfigSchema.parse({ qualityMode, ...preset, ...input.config });

  const diagnostics: GeometryDiagnostic[] = [];
  const sessionIdentity = {
    referenceSetId: input.referenceSet.id,
    providerId: input.providerId,
    providerVersion: input.providerVersion,
    config,
  };
  const sessionId = deterministicScopedId("reconstruction-session", sessionIdentity);

  const buildReport = (
    status: "BLOCKED" | "COMPLETED",
    stopReason: StopReason,
    candidates: readonly CandidateReconstruction[],
    passes: readonly ReconstructionPass[],
    selected?: CandidateReconstruction,
  ): ReconstructionSessionReport => {
    const differenceEvidence = selected ? computeDifferenceEvidence(input.referenceSet, mergedMeshOf(selected)) : [];
    const base = {
      taskId: input.referenceSet.taskId,
      referenceSetId: input.referenceSet.id,
      providerId: input.providerId,
      providerVersion: input.providerVersion,
      qualityMode,
      status,
      stopReason,
      candidates,
      ...(selected ? { selectedCandidateId: selected.id } : {}),
      passes,
      differenceEvidence,
      ...(selected ? { finalScore: selected.score } : {}),
      resourceUsage: {
        voxelResolution: config.voxelResolution,
        durationMs: Date.now() - startedAt,
      },
    };
    return deepFreeze(
      ReconstructionSessionReportSchema.parse({
        id: sessionId,
        reportVersion: GEOMETRY_RECONSTRUCTION_SESSION_VERSION,
        createdAt: input.createdAt,
        ...base,
        diagnostics: sortDiagnostics(diagnostics),
        reportFingerprint: fingerprint(base),
      }),
    );
  };

  if (input.proposal.readiness.classification === "INSUFFICIENT") {
    diagnostics.push(
      diagnostic({
        code: "RECONSTRUCTION_CAMERA_EVIDENCE_INSUFFICIENT",
        severity: "CRITICAL",
        message:
          "Reconstruction readiness is INSUFFICIENT; camera/landmark/silhouette evidence cannot support geometry generation without inventing depth.",
        stage: "EVIDENCE_CHECK",
        recoverable: true,
      }),
    );
    return { report: buildReport("BLOCKED", "INSUFFICIENT_EVIDENCE", [], []) };
  }

  const generation = generateInitialCandidates(input.referenceSet, config);
  diagnostics.push(...generation.diagnostics);
  if (generation.candidates.length === 0) {
    diagnostics.push(
      diagnostic({
        code: "RECONSTRUCTION_BLOCKED",
        severity: "CRITICAL",
        message: "No candidate geometry could be generated from the available evidence.",
        stage: "CANDIDATE_GENERATION",
        recoverable: true,
      }),
    );
    return { report: buildReport("BLOCKED", "INSUFFICIENT_EVIDENCE", [], []) };
  }

  function mergedMeshOf(candidate: CandidateReconstruction): RawMesh {
    return mergeMeshes(candidate.geometry.parts.map((part) => translateMesh(part.mesh, part.localTransform.position)));
  }

  function scoreCandidate(raw: RawCandidate): CandidateReconstruction {
    const merged = mergeMeshes(raw.parts.map((part) => translateMesh(part.mesh, part.localTransform.position)));
    const structural = checkStructuralValidity(merged, config.maxTriangles);
    const viewMetrics = input.referenceSet.views
      .map((view) => scoreView(view, merged))
      .filter((metric) => metric !== undefined);
    const landmarkMetrics = scoreLandmarks(input.referenceSet, merged);
    const constraintEntries = buildConstraintEntries(input.referenceSet, merged);
    const scaleResult = resolveScaleFactor(input.referenceSet, extractBoxHalfExtents(merged));
    const score = computeCrossViewFitScore({
      viewMetrics,
      landmarkMetrics,
      cameraConfidence: input.proposal.readiness.factors.cameraConfidence,
      coverageScore: input.proposal.readiness.factors.viewDiversity,
      scaleResolved: scaleResult.resolved,
      constraintEntries,
      structurallyValid: structural.valid,
      degenerateRatio: structural.triangleCount > 0 ? structural.degenerateTriangleCount / structural.triangleCount : 1,
    });
    const bounds = computeMeshBounds(merged);
    const candidateDiagnostics: GeometryDiagnostic[] = [];
    if (!structural.valid) {
      candidateDiagnostics.push(
        diagnostic({
          code: "CANDIDATE_REJECTED_INVALID_TOPOLOGY",
          severity: structural.triangleCount > config.maxTriangles ? "ERROR" : "WARNING",
          message: structural.issues.join(" "),
          stage: "CANDIDATE_SCORING",
          recoverable: true,
        }),
      );
    }
    const base = {
      taskId: input.referenceSet.taskId,
      referenceSetId: input.referenceSet.id,
      providerId: input.providerId,
      providerVersion: input.providerVersion,
      sourceEvidenceFingerprint: input.referenceSet.fingerprint,
      generationMethod: raw.generationMethod,
      triangleCount: structural.triangleCount,
      partCount: raw.parts.length,
      bounds,
      score,
      viewMetrics,
      landmarkMetrics,
    };
    return deepFreeze(
      CandidateReconstructionSchema.parse({
        id: deterministicScopedId("candidate", { ...base, parts: raw.parts }),
        ...base,
        geometry: { parts: raw.parts },
        diagnostics: candidateDiagnostics,
        provenance: {
          source: "RECONSTRUCTION_PROVIDER",
          provider: input.providerId,
          providerVersion: input.providerVersion,
          confidence: score.overall,
        },
        fingerprint: fingerprint(base),
      }),
    );
  }

  const scoredCandidates = generation.candidates.map(scoreCandidate);
  let selected = scoredCandidates.reduce((best, candidate) =>
    candidate.score.overall > best.score.overall ||
    (candidate.score.overall === best.score.overall && candidate.id < best.id)
      ? candidate
      : best,
  );

  const passes: ReconstructionPass[] = [];
  let stopReason: StopReason = "MAXIMUM_PASSES_REACHED";

  if (selected.score.overall >= config.targetScore) {
    stopReason = "TARGET_SCORE_REACHED";
  } else {
    for (let passNumber = 1; passNumber <= config.maxPasses; passNumber += 1) {
      if (
        selected.partCount !== 1 ||
        (selected.generationMethod !== "BOX_PRIMITIVE" && selected.generationMethod !== "CYLINDER_PRIMITIVE")
      ) {
        stopReason = "NO_IMPROVEMENT";
        break;
      }
      const currentPart = selected.geometry.parts[0];
      if (!currentPart) {
        stopReason = "NO_IMPROVEMENT";
        break;
      }
      const neighbors =
        selected.generationMethod === "BOX_PRIMITIVE"
          ? boxDimensionNeighbors(extractBoxHalfExtents(currentPart.mesh))
          : cylinderDimensionNeighbors(extractCylinderDimensions(currentPart.mesh));

      let bestNeighbor: CandidateReconstruction | undefined;
      let bestRegression: readonly string[] = [];
      for (const neighbor of neighbors) {
        const rawNeighbor: RawCandidate = {
          generationMethod: selected.generationMethod,
          parts: [{ ...currentPart, mesh: neighbor.mesh }],
        };
        const scoredNeighbor = scoreCandidate(rawNeighbor);
        const regression = checkViewRegression(selected.viewMetrics, scoredNeighbor.viewMetrics);
        if (regression.regressed) continue;
        if (!bestNeighbor || scoredNeighbor.score.overall > bestNeighbor.score.overall) {
          bestNeighbor = scoredNeighbor;
          bestRegression = regression.regressedViewIds;
        }
      }

      if (bestNeighbor && bestNeighbor.score.overall > selected.score.overall) {
        passes.push(
          buildPass(sessionId, passNumber, "ADJUST_BOX_DIMENSION", selected, bestNeighbor, true, bestRegression, []),
        );
        selected = bestNeighbor;
        if (selected.score.overall >= config.targetScore) {
          stopReason = "TARGET_SCORE_REACHED";
          break;
        }
      } else {
        passes.push(
          buildPass(
            sessionId,
            passNumber,
            selected.generationMethod === "BOX_PRIMITIVE" ? "ADJUST_BOX_DIMENSION" : "ADJUST_CYLINDER_DIMENSION",
            selected,
            selected,
            false,
            [],
            [
              diagnostic({
                code: "CORRECTION_NO_IMPROVEMENT",
                severity: "INFO",
                message: `Pass ${passNumber} found no dimension adjustment that improves the score without regressing a view.`,
                stage: "CORRECTION",
                recoverable: true,
              }),
            ],
          ),
        );
        stopReason = "NO_IMPROVEMENT";
        break;
      }
    }
  }

  const glb = await exportMeshToGlb(mergedMeshOf(selected), selected.id.replace(/[^a-zA-Z0-9-]/g, "-"));

  const finalCandidates = scoredCandidates.some((candidate) => candidate.id === selected.id)
    ? scoredCandidates
    : [...scoredCandidates, selected];

  return {
    report: buildReport("COMPLETED", stopReason, finalCandidates, passes, selected),
    selectedGlb: glb,
  };
}
