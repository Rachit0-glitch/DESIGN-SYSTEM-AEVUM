import { diagnostic } from "./diagnostics.js";
import type { PartBoneAssociation, RigDiagnostic } from "./schemas.js";

export interface PartLike {
  readonly partId: string;
  readonly label: string;
}

export interface PartAssociationResult {
  readonly associations: readonly PartBoneAssociation[];
  readonly unassociatedParts: readonly string[];
  readonly diagnostics: readonly RigDiagnostic[];
}

/**
 * Maps Phase 18/19A reconstructed parts to bone keys by exact (case-insensitive) label match
 * (Phase 19B §27). This is deliberately literal, not fuzzy or ML-driven — a part labeled "crown"
 * associates only with a bone literally keyed "crown", preserving part identity and provenance
 * rather than guessing.
 */
export function associatePartsToBones(parts: readonly PartLike[], boneKeys: readonly string[]): PartAssociationResult {
  const boneKeysByNormalized = new Map(boneKeys.map((key) => [key.toLowerCase(), key]));
  const associations: PartBoneAssociation[] = [];
  const unassociatedParts: string[] = [];
  const diagnostics: RigDiagnostic[] = [];

  for (const part of parts) {
    const boneKey = boneKeysByNormalized.get(part.label.toLowerCase());
    if (boneKey) {
      associations.push({ partId: part.partId, partLabel: part.label, boneKey });
    } else {
      unassociatedParts.push(part.partId);
    }
  }

  if (unassociatedParts.length > 0) {
    diagnostics.push(
      diagnostic({
        code: "RIG_BONE_MISSING",
        severity: "INFO",
        message: `${unassociatedParts.length} part(s) have no matching bone by label and remain unassociated.`,
        stage: "PART_ASSOCIATION",
        recoverable: true,
        relatedIds: unassociatedParts,
      }),
    );
  }

  return { associations, unassociatedParts, diagnostics };
}
