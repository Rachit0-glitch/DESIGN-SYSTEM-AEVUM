import { diagnostic } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import {
  ViewRoleClassificationSchema,
  type MultiViewDiagnostic,
  type ViewRoleClassification,
  type ViewRoleHint,
} from "./schemas.js";

export interface ClassifyViewRoleInput {
  readonly viewId: string;
  readonly assetId: string;
  readonly hints: readonly ViewRoleHint[];
}

export interface ClassifyViewRoleResult {
  readonly classification: ViewRoleClassification;
  readonly diagnostics: readonly MultiViewDiagnostic[];
}

/**
 * Classifies a view's semantic role. Phase 17 has no production computer-vision model, so role
 * evidence comes only from explicit hints supplied with the task (user-stated or otherwise
 * pre-labeled). Views without any hint are honestly classified UNKNOWN rather than guessed.
 */
export function classifyViewRole(input: ClassifyViewRoleInput): ClassifyViewRoleResult {
  const hint = input.hints.find((candidate) => candidate.assetId === input.assetId);

  if (!hint) {
    return {
      classification: deepFreeze(
        ViewRoleClassificationSchema.parse({
          role: "UNKNOWN",
          confidence: 0,
          evidence: [],
          method: "UNKNOWN",
        }),
      ),
      diagnostics: [
        diagnostic({
          code: "VIEW_ROLE_AMBIGUOUS",
          severity: "INFO",
          message: "No role hint was supplied for this view; it remains classified UNKNOWN.",
          stage: "VIEW_ROLE_CLASSIFICATION",
          recoverable: true,
          relatedIds: [input.viewId],
        }),
      ],
    };
  }

  const method = hint.userProvided ? "USER_PROVIDED" : "INFERRED_FROM_HINT";
  const confidence = hint.userProvided ? 0.95 : 0.6;
  return {
    classification: deepFreeze(
      ViewRoleClassificationSchema.parse({
        role: hint.role,
        confidence,
        evidence: [hint.userProvided ? "User-stated view role." : "Caller-supplied role hint."],
        method,
      }),
    ),
    diagnostics: [],
  };
}

/** Detects two or more non-UNKNOWN, non-DETAIL views independently claiming the same role. */
export function detectDuplicateRoles(
  views: ReadonlyArray<{ readonly viewId: string; readonly role: ViewRoleClassification }>,
): readonly MultiViewDiagnostic[] {
  const byRole = new Map<string, string[]>();
  for (const view of views) {
    if (view.role.role === "UNKNOWN" || view.role.role === "DETAIL") continue;
    byRole.set(view.role.role, [...(byRole.get(view.role.role) ?? []), view.viewId]);
  }
  const diagnostics: MultiViewDiagnostic[] = [];
  for (const [role, viewIds] of byRole) {
    if (viewIds.length > 1) {
      diagnostics.push(
        diagnostic({
          code: "VIEW_DUPLICATE",
          severity: "WARNING",
          message: `Views ${viewIds.join(", ")} are all classified as ${role}.`,
          stage: "VIEW_ROLE_CLASSIFICATION",
          recoverable: true,
          relatedIds: viewIds,
        }),
      );
    }
  }
  return diagnostics;
}
