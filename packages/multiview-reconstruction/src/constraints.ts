import { deterministicScopedId } from "./deterministic.js";
import { diagnostic } from "./diagnostics.js";
import { deepFreeze } from "./immutable.js";
import {
  GeometricConstraintSchema,
  ScaleEvidenceSchema,
  type GeometricConstraint,
  type MultiViewConfig,
  type MultiViewDiagnostic,
  type ScaleEvidence,
  type ViewRecord,
} from "./schemas.js";

const METERS_PER_UNIT: Record<ScaleEvidence["unit"], number> = {
  MM: 0.001,
  CM: 0.01,
  M: 1,
  IN: 0.0254,
  FT: 0.3048,
};

export interface ResolveScaleEvidenceInput {
  readonly hints: ReadonlyArray<Omit<ScaleEvidence, "id">>;
}

export interface ResolveScaleEvidenceResult {
  readonly evidence: readonly ScaleEvidence[];
  readonly resolved: boolean;
  readonly diagnostics: readonly MultiViewDiagnostic[];
}

/** Resolves optional caller-supplied scale evidence. Without it, reconstruction stays scale-relative
 * rather than inventing a real-world size. Conflicting hints (>20% apart once converted to meters)
 * are flagged rather than silently averaged. */
export function resolveScaleEvidence(input: ResolveScaleEvidenceInput): ResolveScaleEvidenceResult {
  if (input.hints.length === 0) {
    return {
      evidence: [],
      resolved: false,
      diagnostics: [
        diagnostic({
          code: "SCALE_UNKNOWN",
          severity: "INFO",
          message: "No scale evidence was supplied; reconstruction will remain scale-relative.",
          stage: "SCALE_RESOLUTION",
          recoverable: true,
        }),
      ],
    };
  }

  const evidence = input.hints.map((hint) =>
    deepFreeze(ScaleEvidenceSchema.parse({ ...hint, id: deterministicScopedId("scale-evidence", hint) })),
  );

  const diagnostics: MultiViewDiagnostic[] = [];
  const metersValues = evidence.map((entry) => entry.value * METERS_PER_UNIT[entry.unit]);
  const min = Math.min(...metersValues);
  const max = Math.max(...metersValues);
  if (evidence.length > 1 && (max - min) / Math.max(min, 1e-9) > 0.2) {
    diagnostics.push(
      diagnostic({
        code: "SCALE_CONFLICT",
        severity: "ERROR",
        message: `Supplied scale evidence disagrees by more than 20% once converted to meters (${min.toFixed(4)}m vs ${max.toFixed(4)}m).`,
        stage: "SCALE_RESOLUTION",
        recoverable: true,
        relatedIds: evidence.map((entry) => entry.id),
      }),
    );
  }

  return { evidence: deepFreeze(evidence), resolved: true, diagnostics };
}

const DIRECTION_ROLE_MAP = {
  FRONT: "FRONT",
  BACK: "BACK",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
  TOP: "TOP",
  BOTTOM: "BOTTOM",
} as const;

function findSilhouetteView(
  views: readonly ViewRecord[],
  role: keyof typeof DIRECTION_ROLE_MAP,
): ViewRecord | undefined {
  return views.find((view) => view.role.role === role && view.silhouette !== undefined);
}

export interface DeriveConstraintsResult {
  readonly constraints: readonly GeometricConstraint[];
  readonly diagnostics: readonly MultiViewDiagnostic[];
}

/**
 * Derives real, silhouette-backed bounding-dimension constraints (width/depth/height/footprint)
 * from whichever canonical views have silhouette evidence. Missing views simply omit the
 * corresponding constraint rather than inventing a dimension with no evidence behind it.
 */
export function deriveSilhouetteDimensionConstraints(views: readonly ViewRecord[]): DeriveConstraintsResult {
  const constraints: GeometricConstraint[] = [];
  const diagnostics: MultiViewDiagnostic[] = [];

  const front = findSilhouetteView(views, "FRONT");
  const back = findSilhouetteView(views, "BACK");
  const left = findSilhouetteView(views, "LEFT");
  const right = findSilhouetteView(views, "RIGHT");
  const top = findSilhouetteView(views, "TOP");

  const widthSource = front ?? back;
  if (widthSource?.silhouette) {
    const width = widthSource.silhouette.bounds.maxX - widthSource.silhouette.bounds.minX;
    constraints.push(
      buildConstraint("BOUNDING_DIMENSION", [widthSource.id], width, widthSource.silhouette.confidence, {
        label: "FRONT_WIDTH",
        sourceRole: widthSource.role.role,
        unitNote: "Normalized image-width fraction; not a real-world unit without scale evidence.",
      }),
    );
  }

  const depthSource = left ?? right;
  if (depthSource?.silhouette) {
    const depth = depthSource.silhouette.bounds.maxX - depthSource.silhouette.bounds.minX;
    constraints.push(
      buildConstraint("BOUNDING_DIMENSION", [depthSource.id], depth, depthSource.silhouette.confidence, {
        label: "SIDE_DEPTH",
        sourceRole: depthSource.role.role,
        unitNote: "Normalized image-width fraction; not a real-world unit without scale evidence.",
      }),
    );
  }

  const heightEntries = [front, back, left, right]
    .map((view) => (view?.silhouette ? { viewId: view.id, silhouette: view.silhouette } : undefined))
    .filter(
      (entry): entry is { viewId: string; silhouette: NonNullable<ViewRecord["silhouette"]> } => entry !== undefined,
    );
  if (heightEntries.length > 0) {
    const heights = heightEntries.map((entry) => entry.silhouette.bounds.maxY - entry.silhouette.bounds.minY);
    const maxHeight = Math.max(...heights);
    const minHeight = Math.min(...heights);
    if (heights.length > 1 && (maxHeight - minHeight) / Math.max(minHeight, 1e-6) > 0.3) {
      diagnostics.push(
        diagnostic({
          code: "SILHOUETTE_CONFLICT",
          severity: "WARNING",
          message: `Height derived from different views disagrees by more than 30% (${minHeight.toFixed(3)} vs ${maxHeight.toFixed(3)}).`,
          stage: "CONSTRAINT_DERIVATION",
          recoverable: true,
          relatedIds: heightEntries.map((entry) => entry.viewId),
        }),
      );
    }
    constraints.push(
      buildConstraint(
        "BOUNDING_DIMENSION",
        heightEntries.map((entry) => entry.viewId),
        maxHeight,
        Math.min(...heightEntries.map((entry) => entry.silhouette.confidence)),
        {
          label: "OVERALL_HEIGHT",
          unitNote: "Normalized image-height fraction; not a real-world unit without scale evidence.",
        },
      ),
    );
  }

  if (top?.silhouette) {
    const footprintWidth = top.silhouette.bounds.maxX - top.silhouette.bounds.minX;
    const footprintDepth = top.silhouette.bounds.maxY - top.silhouette.bounds.minY;
    constraints.push(
      buildConstraint("BOUNDING_DIMENSION", [top.id], footprintWidth * footprintDepth, top.silhouette.confidence, {
        label: "TOP_FOOTPRINT_AREA",
        unitNote: "Normalized image-area fraction; not a real-world unit without scale evidence.",
      }),
    );
  }

  return { constraints: deepFreeze(constraints), diagnostics };
}

/** A bounded, honest bilateral-symmetry proxy: compares how far the silhouette's centroid sits
 * from the midpoint of its own bounding box on the X axis. A perfectly centered centroid is weak
 * evidence of left/right symmetry; a badly off-center one is real evidence against it. This is
 * disclosed as an approximate bounding-box heuristic, not true contour-matching symmetry detection. */
export function deriveSymmetryConstraint(views: readonly ViewRecord[]): GeometricConstraint | undefined {
  const source = findSilhouetteView(views, "FRONT") ?? findSilhouetteView(views, "BACK");
  if (!source?.silhouette) return undefined;
  const { bounds, centroid } = source.silhouette;
  const midpointX = (bounds.minX + bounds.maxX) / 2;
  const halfWidth = Math.max((bounds.maxX - bounds.minX) / 2, 1e-6);
  const offset = Math.abs(centroid.x - midpointX) / halfWidth;
  const symmetryScore = Math.max(0, 1 - offset);
  return buildConstraint("SYMMETRY", [source.id], symmetryScore, source.silhouette.confidence * 0.6, {
    axis: "X",
    kind: "BILATERAL",
    method: "BOUNDING_BOX_CENTROID_PROXY",
    note: "Approximate proxy from bounding-box centroid offset, not true contour-matching symmetry detection.",
  });
}

function buildConstraint(
  type: GeometricConstraint["type"],
  entityIds: readonly string[],
  value: number,
  confidence: number,
  details: Record<string, unknown>,
): GeometricConstraint {
  return deepFreeze(
    GeometricConstraintSchema.parse({
      id: deterministicScopedId("constraint", { type, entityIds, value, details }),
      type,
      entityIds,
      value,
      confidence,
      description: `${type} derived from silhouette evidence: ${JSON.stringify(details)}.`,
      details,
      provenance: {
        source: "DETERMINISTIC_ANALYZER",
        provider: "silhouette-constraint-analyzer",
        providerVersion: "1.0.0",
        confidence,
      },
    }),
  );
}

export function capConstraints(
  constraints: readonly GeometricConstraint[],
  config: MultiViewConfig,
): { readonly constraints: readonly GeometricConstraint[]; readonly diagnostics: readonly MultiViewDiagnostic[] } {
  if (constraints.length <= config.maxConstraints) return { constraints, diagnostics: [] };
  return {
    constraints: deepFreeze(constraints.slice(0, config.maxConstraints)),
    diagnostics: [
      diagnostic({
        code: "RESOURCE_LIMIT_EXCEEDED",
        severity: "WARNING",
        message: `${constraints.length} constraints were derived but only ${config.maxConstraints} are retained.`,
        stage: "CONSTRAINT_DERIVATION",
        recoverable: true,
      }),
    ],
  };
}
