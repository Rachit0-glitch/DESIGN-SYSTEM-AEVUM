import type { MultiViewReconstructionProposal, MultiViewReferenceSet } from "@aevum/multiview-reconstruction";
import {
  buildHullViews,
  generateInitialCandidates,
  type RawCandidate,
  type VoxelOccupancy,
} from "./candidate-generation.js";
import { boxDimensionNeighbors, checkViewRegression, cylinderDimensionNeighbors } from "./correction.js";
import { deterministicScopedId, fingerprint } from "./deterministic.js";
import { diagnostic, sortDiagnostics } from "./diagnostics.js";
import { exportMeshToGlb } from "./glb-export.js";
import { deepFreeze } from "./immutable.js";
import { checkStructuralValidity, computeMeshBounds, mergeMeshes, translateMesh } from "./mesh-utils.js";
import { detectPartOverlaps } from "./part-overlap.js";
import {
  partAxisScaleNeighbors,
  partRepositionFromLandmarksNeighbor,
  partTranslationNeighbors,
} from "./part-correction.js";
import { scorePart } from "./part-scoring.js";
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
  type PartMesh,
  type PartScore,
  type QualityModeSchema,
  type ReconstructionConfigInput,
  type ReconstructionPass,
  type ReconstructionProviderIdSchema,
  type ReconstructionSessionReport,
  type ReconstructionStopReasonSchema,
} from "./schemas.js";
import type { RawMesh } from "./schemas.js";
import {
  countOccupied,
  dilateOccupancy,
  erodeOccupancy,
  extractVoxelSurface,
  refineOccupancyFromEvidence,
} from "./voxel-hull.js";
import type { z } from "zod";

type QualityMode = z.infer<typeof QualityModeSchema>;
type ProviderId = z.infer<typeof ReconstructionProviderIdSchema>;
type StopReason = z.infer<typeof ReconstructionStopReasonSchema>;

const QUALITY_PRESETS: Record<QualityMode, Partial<ReconstructionConfigInput>> = {
  DRAFT: { voxelResolution: 16, maxCandidates: 2, maxPasses: 2, maxPartPasses: 2, maxVoxelRefinementPasses: 2 },
  STANDARD: { voxelResolution: 32, maxCandidates: 3, maxPasses: 6, maxPartPasses: 4, maxVoxelRefinementPasses: 3 },
  HIGH: { voxelResolution: 48, maxCandidates: 4, maxPasses: 10, maxPartPasses: 6, maxVoxelRefinementPasses: 5 },
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

/**
 * The full Phase 18/19A deterministic reconstruction execution: checks camera-evidence
 * sufficiency, generates candidate geometry (box/cylinder primitive fit and/or voxel visual hull),
 * scores every candidate (including a real per-part score when Phase 17 part evidence exists),
 * selects the best deterministically, then runs a bounded correction loop — per-part local search
 * for multi-part candidates, occupancy refinement for voxel-hull candidates, dimension local
 * search otherwise — with a hard non-regression gate before finalizing. Produces a GLB for the
 * winning candidate but does not register any asset or touch any canonical document.
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

  // Session-local occupancy cache: VOXEL_HULL candidates carry their raw occupancy grid here so
  // refinement can operate directly on it. Never part of the persisted, serializable schema.
  const occupancyByCandidateId = new Map<string, VoxelOccupancy>();

  function mergedMeshOf(candidate: CandidateReconstruction): RawMesh {
    return mergeMeshes(candidate.geometry.parts.map((part) => translateMesh(part.mesh, part.localTransform.position)));
  }

  function buildPart(part: PartMesh): PartScore {
    const evidencePart = input.referenceSet.parts.find((entry) => entry.id === part.partId);
    return scorePart({
      partId: part.partId,
      label: part.label,
      worldMesh: translateMesh(part.mesh, part.localTransform.position),
      referenceSet: input.referenceSet,
      evidencePart,
      maxTriangles: config.maxTriangles,
    });
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
    const baseScore = computeCrossViewFitScore({
      viewMetrics,
      landmarkMetrics,
      cameraConfidence: input.proposal.readiness.factors.cameraConfidence,
      coverageScore: input.proposal.readiness.factors.viewDiversity,
      scaleResolved: scaleResult.resolved,
      constraintEntries,
      structurallyValid: structural.valid,
      degenerateRatio: structural.triangleCount > 0 ? structural.degenerateTriangleCount / structural.triangleCount : 1,
    });

    const partScores = raw.parts.length > 1 ? raw.parts.map(buildPart) : [];
    // Explicit, inspectable blend: multi-part candidates weight the aggregate part score
    // alongside the whole-mesh global score, rather than letting one dominate silently.
    const score =
      partScores.length > 0
        ? {
            ...baseScore,
            overall:
              baseScore.overall * 0.7 +
              (partScores.reduce((sum, part) => sum + part.overall, 0) / partScores.length) * 0.3,
          }
        : baseScore;

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
    if (raw.parts.length > 1) {
      candidateDiagnostics.push(...detectPartOverlaps(raw.parts, config.partOverlapToleranceRatio));
    }
    for (const partScore of partScores) candidateDiagnostics.push(...partScore.diagnostics);

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
      partScores,
    };
    const candidate = deepFreeze(
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
    if (raw.occupancy) occupancyByCandidateId.set(candidate.id, raw.occupancy);
    return candidate;
  }

  function buildPass(
    passNumber: number,
    action: z.infer<typeof ReconstructionPassSchema>["action"],
    before: CandidateReconstruction | undefined,
    after: CandidateReconstruction,
    accepted: boolean,
    regressedViewIds: readonly string[],
    regressedPartIds: readonly string[],
    passDiagnostics: readonly GeometryDiagnostic[],
    targetPartId?: string,
  ): ReconstructionPass {
    const passBase = {
      sessionId,
      passNumber,
      action,
      ...(targetPartId ? { targetPartId } : {}),
      ...(before ? { candidateIdBefore: before.id } : {}),
      candidateIdAfter: after.id,
      ...(before ? { scoreBefore: before.score.overall } : {}),
      scoreAfter: after.score.overall,
      accepted,
      regressedViewIds: [...regressedViewIds],
      regressedPartIds: [...regressedPartIds],
    };
    return deepFreeze(
      ReconstructionPassSchema.parse({
        id: deterministicScopedId("reconstruction-pass", passBase),
        ...passBase,
        diagnostics: passDiagnostics,
        fingerprint: fingerprint(passBase),
      }),
    );
  }

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

  const scoredCandidates = generation.candidates.map(scoreCandidate);
  let selected = scoredCandidates.reduce((best, candidate) =>
    candidate.score.overall > best.score.overall ||
    (candidate.score.overall === best.score.overall && candidate.id < best.id)
      ? candidate
      : best,
  );

  const passes: ReconstructionPass[] = [];
  let stopReason: StopReason = "MAXIMUM_PASSES_REACHED";
  let passNumber = 0;

  if (selected.score.overall >= config.targetScore) {
    stopReason = "TARGET_SCORE_REACHED";
  } else if (selected.partCount > 1) {
    stopReason = runMultiPartCorrection();
  } else if (selected.generationMethod === "VOXEL_HULL") {
    stopReason = runVoxelCorrection();
  } else {
    stopReason = runDimensionCorrection();
  }

  function runDimensionCorrection(): StopReason {
    for (; passNumber < config.maxPasses; ) {
      passNumber += 1;
      if (selected.generationMethod !== "BOX_PRIMITIVE" && selected.generationMethod !== "CYLINDER_PRIMITIVE") {
        return "NO_IMPROVEMENT";
      }
      const currentPart = selected.geometry.parts[0];
      if (!currentPart) return "NO_IMPROVEMENT";
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

      const action =
        selected.generationMethod === "BOX_PRIMITIVE" ? "ADJUST_BOX_DIMENSION" : "ADJUST_CYLINDER_DIMENSION";
      if (bestNeighbor && bestNeighbor.score.overall > selected.score.overall) {
        passes.push(buildPass(passNumber, action, selected, bestNeighbor, true, bestRegression, [], []));
        selected = bestNeighbor;
        if (selected.score.overall >= config.targetScore) return "TARGET_SCORE_REACHED";
      } else {
        passes.push(
          buildPass(
            passNumber,
            action,
            selected,
            selected,
            false,
            [],
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
        return "NO_IMPROVEMENT";
      }
    }
    return "MAXIMUM_PASSES_REACHED";
  }

  /** Refines each part independently: only box-primitive parts get axis-scale neighbors, every
   * part gets translation and (when Phase 17 landmarks exist) a reposition-from-landmarks
   * candidate. A part correction is only accepted when it improves both the target part and the
   * overall score, without regressing any other part's score or any global view. */
  function runMultiPartCorrection(): StopReason {
    let anyAcceptedThisSweep = true;
    while (anyAcceptedThisSweep && passNumber < config.maxPasses) {
      anyAcceptedThisSweep = false;
      for (const targetPart of selected.geometry.parts) {
        if (passNumber >= config.maxPasses) break;
        passNumber += 1;

        const evidencePart = input.referenceSet.parts.find((entry) => entry.id === targetPart.partId);
        const repositionNeighbor = partRepositionFromLandmarksNeighbor(targetPart, input.referenceSet, evidencePart);
        const neighbors = [
          ...partTranslationNeighbors(targetPart),
          ...partAxisScaleNeighbors(targetPart),
          ...(repositionNeighbor ? [repositionNeighbor] : []),
        ];

        const targetPartScoreBefore =
          selected.partScores.find((entry) => entry.partId === targetPart.partId)?.overall ?? 0;
        let bestCandidate: CandidateReconstruction | undefined;
        let bestAction: z.infer<typeof ReconstructionPassSchema>["action"] = "PART_TRANSLATE";
        let bestViewRegression: readonly string[] = [];
        let bestPartRegression: readonly string[] = [];

        for (const neighbor of neighbors) {
          const nextParts = selected.geometry.parts.map((part) =>
            part.partId === targetPart.partId ? neighbor.part : part,
          );
          const rawNeighbor: RawCandidate = { generationMethod: selected.generationMethod, parts: nextParts };
          const scoredNeighbor = scoreCandidate(rawNeighbor);

          const viewRegression = checkViewRegression(selected.viewMetrics, scoredNeighbor.viewMetrics);
          if (viewRegression.regressed) continue;

          const targetScoreAfter =
            scoredNeighbor.partScores.find((entry) => entry.partId === targetPart.partId)?.overall ?? 0;
          if (targetScoreAfter <= targetPartScoreBefore) continue;

          const regressedParts = scoredNeighbor.partScores.filter((afterScore) => {
            const beforeScore = selected.partScores.find((entry) => entry.partId === afterScore.partId);
            return (
              beforeScore !== undefined &&
              afterScore.partId !== targetPart.partId &&
              afterScore.overall < beforeScore.overall - 0.02
            );
          });
          if (regressedParts.length > 0) continue;

          if (scoredNeighbor.score.overall <= selected.score.overall) continue;

          if (!bestCandidate || scoredNeighbor.score.overall > bestCandidate.score.overall) {
            bestCandidate = scoredNeighbor;
            bestAction = neighbor.action;
            bestViewRegression = viewRegression.regressedViewIds;
            bestPartRegression = regressedParts.map((entry) => entry.partId);
          }
        }

        if (bestCandidate) {
          passes.push(
            buildPass(
              passNumber,
              bestAction,
              selected,
              bestCandidate,
              true,
              bestViewRegression,
              bestPartRegression,
              [],
              targetPart.partId,
            ),
          );
          selected = bestCandidate;
          anyAcceptedThisSweep = true;
          if (selected.score.overall >= config.targetScore) return "TARGET_SCORE_REACHED";
        } else {
          passes.push(
            buildPass(
              passNumber,
              "PART_TRANSLATE",
              selected,
              selected,
              false,
              [],
              [],
              [
                diagnostic({
                  code: "PART_CORRECTION_NO_IMPROVEMENT",
                  severity: "INFO",
                  message: `No correction for part "${targetPart.label}" improved its score without regressing another part or view.`,
                  stage: "PART_CORRECTION",
                  recoverable: true,
                  relatedIds: [targetPart.partId],
                }),
              ],
              targetPart.partId,
            ),
          );
        }
      }
    }
    return passNumber >= config.maxPasses ? "MAXIMUM_PASSES_REACHED" : "NO_IMPROVEMENT";
  }

  /** Refines voxel-hull occupancy using silhouette evidence with multi-view consensus, plus
   * bounded dilate/erode alternatives when evidence-driven refinement makes no change. Every
   * accepted refinement must improve the score, leave no critical view regressed, and keep the
   * occupied-volume change within `config.maxVoxelVolumeChangeRatio`. */
  function runVoxelCorrection(): StopReason {
    const initialOccupancy = occupancyByCandidateId.get(selected.id);
    if (!initialOccupancy) return "NO_IMPROVEMENT";
    const hullViews = buildHullViews(input.referenceSet);
    const initialVolume = countOccupied(initialOccupancy.grid);

    for (; passNumber < config.maxVoxelRefinementPasses; ) {
      passNumber += 1;
      const currentOccupancy = occupancyByCandidateId.get(selected.id);
      const currentPart = selected.geometry.parts[0];
      if (!currentOccupancy || !currentPart) return "NO_IMPROVEMENT";

      const refined = refineOccupancyFromEvidence(currentOccupancy.grid, {
        resolution: currentOccupancy.resolution,
        halfExtent: currentOccupancy.halfExtent,
        views: hullViews,
        consensusMinViews: Math.min(config.voxelConsensusMinViews, hullViews.length),
        maxChangedVoxelRatio: 0.05,
      });

      const candidateGrids: Array<{ label: string; grid: Uint8Array }> = [];
      if (refined.addedVoxels > 0 || refined.removedVoxels > 0) {
        candidateGrids.push({ label: "evidence-refined", grid: refined.occupancy });
      } else {
        candidateGrids.push(
          { label: "dilated", grid: dilateOccupancy(currentOccupancy.grid, currentOccupancy.resolution) },
          { label: "eroded", grid: erodeOccupancy(currentOccupancy.grid, currentOccupancy.resolution) },
        );
      }

      let bestCandidate: CandidateReconstruction | undefined;
      let bestGrid: Uint8Array | undefined;
      let bestRegression: readonly string[] = [];
      for (const attempt of candidateGrids) {
        const volume = countOccupied(attempt.grid);
        if (volume === 0) continue;
        const volumeChangeRatio = Math.abs(volume - initialVolume) / Math.max(1, initialVolume);
        if (volumeChangeRatio > config.maxVoxelVolumeChangeRatio) continue;

        const mesh = extractVoxelSurface(attempt.grid, currentOccupancy.resolution, currentOccupancy.halfExtent);
        const rawNeighbor: RawCandidate = {
          generationMethod: "VOXEL_HULL",
          occupancy: {
            grid: attempt.grid,
            resolution: currentOccupancy.resolution,
            halfExtent: currentOccupancy.halfExtent,
          },
          parts: [{ ...currentPart, mesh }],
        };
        const scoredNeighbor = scoreCandidate(rawNeighbor);
        const regression = checkViewRegression(selected.viewMetrics, scoredNeighbor.viewMetrics);
        if (regression.regressed) continue;
        if (scoredNeighbor.score.overall <= selected.score.overall) continue;
        if (!bestCandidate || scoredNeighbor.score.overall > bestCandidate.score.overall) {
          bestCandidate = scoredNeighbor;
          bestGrid = attempt.grid;
          bestRegression = regression.regressedViewIds;
        }
      }

      if (bestCandidate && bestGrid) {
        passes.push(
          buildPass(passNumber, "VOXEL_OCCUPANCY_REFINEMENT", selected, bestCandidate, true, bestRegression, [], []),
        );
        selected = bestCandidate;
        if (selected.score.overall >= config.targetScore) return "TARGET_SCORE_REACHED";
      } else {
        passes.push(
          buildPass(
            passNumber,
            "VOXEL_OCCUPANCY_REFINEMENT",
            selected,
            selected,
            false,
            [],
            [],
            [
              diagnostic({
                code: "VOXEL_REFINEMENT_NO_IMPROVEMENT",
                severity: "INFO",
                message: `Pass ${passNumber} found no occupancy refinement that improves the score without regressing a view or exceeding volume bounds.`,
                stage: "VOXEL_CORRECTION",
                recoverable: true,
              }),
            ],
          ),
        );
        return "NO_IMPROVEMENT";
      }
    }
    return "MAXIMUM_PASSES_REACHED";
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
