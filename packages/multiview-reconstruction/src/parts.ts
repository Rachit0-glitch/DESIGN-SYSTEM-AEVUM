import { averageConfidence } from "./confidence.js";
import { deterministicScopedId } from "./deterministic.js";
import { diagnostic } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import { PartSchema, type MultiViewConfig, type MultiViewDiagnostic, type Part, type PartHint } from "./schemas.js";

const VISIBLE_STATES = new Set(["VISIBLE", "PARTIALLY_OCCLUDED"]);

export interface BuildPartsInput {
  readonly hints: readonly PartHint[];
  readonly assetIdToViewId: ReadonlyMap<string, string>;
  readonly config: MultiViewConfig;
}

export interface BuildPartsResult {
  readonly parts: readonly Part[];
  readonly diagnostics: readonly MultiViewDiagnostic[];
}

/** Builds cross-view part evidence. Correspondence is explicit: one `Part` record IS the claim
 * that its observations across views refer to the same physical part. Duplicate labels across
 * separate hints are flagged as ambiguous rather than silently merged or silently kept apart. */
export function buildParts(input: BuildPartsInput): BuildPartsResult {
  const diagnostics: MultiViewDiagnostic[] = [];
  const parts: Part[] = [];

  const seenLabels = new Map<string, number>();
  for (const hint of input.hints) {
    seenLabels.set(hint.label, (seenLabels.get(hint.label) ?? 0) + 1);
  }
  for (const [label, count] of seenLabels) {
    if (count > 1) {
      diagnostics.push(
        diagnostic({
          code: "PART_CORRESPONDENCE_AMBIGUOUS",
          severity: "WARNING",
          message: `Part label "${label}" was supplied ${count} times as separate hints; correspondence is ambiguous.`,
          stage: "PART_CONSTRUCTION",
          recoverable: true,
        }),
      );
    }
  }

  const hints = input.hints.slice(0, input.config.maxParts);
  if (input.hints.length > input.config.maxParts) {
    diagnostics.push(
      diagnostic({
        code: "RESOURCE_LIMIT_EXCEEDED",
        severity: "WARNING",
        message: `${input.hints.length} part hints were supplied but only ${input.config.maxParts} are processed.`,
        stage: "PART_CONSTRUCTION",
        recoverable: true,
      }),
    );
  }

  for (const hint of hints) {
    const observations = hint.observations
      .map((observation) => {
        const viewId = input.assetIdToViewId.get(observation.assetId);
        if (!viewId) return undefined;
        return {
          viewId,
          bounds: observation.bounds,
          visibility: observation.visibility ?? ("VISIBLE" as const),
          confidence: 0.85,
          landmarkIds: [],
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

    if (observations.length === 0) continue;

    const partId = deterministicScopedId("part", { label: hint.label, observations });
    if (observations.every((observation) => !VISIBLE_STATES.has(observation.visibility))) {
      diagnostics.push(
        diagnostic({
          code: "PART_OCCLUDED",
          severity: "WARNING",
          message: `Part "${hint.label}" is not clearly visible in any supplied view; its existence is assumed, not observed.`,
          stage: "PART_CONSTRUCTION",
          recoverable: true,
          relatedIds: [partId],
        }),
      );
    }

    parts.push(
      deepFreeze(
        PartSchema.parse({
          id: partId,
          label: hint.label,
          observations,
          correspondenceConfidence: averageConfidence(observations.map((observation) => observation.confidence)),
          provenance: {
            source: "USER",
            provider: "task-input",
            providerVersion: "1.0.0",
            confidence: averageConfidence(observations.map((observation) => observation.confidence)),
          },
        }),
      ),
    );
  }

  return { parts: deepFreeze(parts), diagnostics };
}
