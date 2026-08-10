/**
 * Provider-independent 2D geometry used to compare a candidate's projected footprint against a
 * Phase 17 source silhouette: convex hull, point-in-polygon, rasterized overlap metrics (IoU,
 * precision, recall), and a Chamfer-style boundary distance. All real, deterministic computation.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

function cross(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Andrew's monotone chain convex hull. Returns points in counter-clockwise order. */
export function convexHull(points: readonly Point2D[]): Point2D[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;

  const lower: Point2D[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] as Point2D, lower[lower.length - 1] as Point2D, point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: Point2D[] = [];
  for (const point of [...sorted].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] as Point2D, upper[upper.length - 1] as Point2D, point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Standard ray-casting point-in-polygon test. */
export function pointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i] as Point2D;
    const pj = polygon[j] as Point2D;
    const intersects =
      pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export interface RasterGrid {
  readonly size: number;
  readonly cells: Uint8Array;
}

/** Rasterizes a normalized (0..1) polygon onto a `size x size` boolean grid by testing each cell
 * center for containment. Bounded, deterministic, and cheap for the small grids this package uses. */
export function rasterizePolygon(polygon: readonly Point2D[], size: number): RasterGrid {
  const cells = new Uint8Array(size * size);
  if (polygon.length < 3) return { size, cells };
  for (let row = 0; row < size; row += 1) {
    const y = (row + 0.5) / size;
    for (let col = 0; col < size; col += 1) {
      const x = (col + 0.5) / size;
      if (pointInPolygon({ x, y }, polygon)) cells[row * size + col] = 1;
    }
  }
  return { size, cells };
}

export interface RasterOverlapMetrics {
  readonly iou: number;
  readonly precision: number;
  readonly recall: number;
  readonly aCount: number;
  readonly bCount: number;
  readonly intersectionCount: number;
  readonly unionCount: number;
}

/** Real intersection-over-union, precision, and recall between two same-size raster grids. `a` is
 * treated as the candidate (predicted) silhouette, `b` as the source (ground-truth) silhouette. */
export function compareRasterGrids(a: RasterGrid, b: RasterGrid): RasterOverlapMetrics {
  if (a.size !== b.size) throw new Error("Cannot compare raster grids of different sizes.");
  let intersectionCount = 0;
  let aCount = 0;
  let bCount = 0;
  for (let index = 0; index < a.cells.length; index += 1) {
    const inA = a.cells[index] === 1;
    const inB = b.cells[index] === 1;
    if (inA) aCount += 1;
    if (inB) bCount += 1;
    if (inA && inB) intersectionCount += 1;
  }
  const unionCount = aCount + bCount - intersectionCount;
  return {
    iou: unionCount === 0 ? 0 : intersectionCount / unionCount,
    precision: aCount === 0 ? 0 : intersectionCount / aCount,
    recall: bCount === 0 ? 0 : intersectionCount / bCount,
    aCount,
    bCount,
    intersectionCount,
    unionCount,
  };
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestDistance(point: Point2D, targets: readonly Point2D[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const target of targets) best = Math.min(best, distance(point, target));
  return best;
}

/** Symmetric Chamfer distance between two boundary point sets — a real, standard (if approximate,
 * vertex-only rather than edge-aware) measure of how far two contours are from each other. */
export function chamferBoundaryDistance(a: readonly Point2D[], b: readonly Point2D[]): number {
  if (a.length === 0 || b.length === 0) return Number.POSITIVE_INFINITY;
  const aToB = a.reduce((sum, point) => sum + nearestDistance(point, b), 0) / a.length;
  const bToA = b.reduce((sum, point) => sum + nearestDistance(point, a), 0) / b.length;
  return (aToB + bToA) / 2;
}

export interface Rect2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Real, standard axis-aligned bounding-box IoU — used for part-level (bounding-box) evidence,
 * where Phase 17 part observations are already rectangles rather than full silhouette contours. */
export function rectIoU(a: Rect2D, b: Rect2D): number {
  const ix0 = Math.max(a.minX, b.minX);
  const iy0 = Math.max(a.minY, b.minY);
  const ix1 = Math.min(a.maxX, b.maxX);
  const iy1 = Math.min(a.maxY, b.maxY);
  const intersection = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
  const areaA = Math.max(0, a.maxX - a.minX) * Math.max(0, a.maxY - a.minY);
  const areaB = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
  const union = areaA + areaB - intersection;
  return union <= 0 ? 0 : intersection / union;
}

export function rectArea(rect: Rect2D): number {
  return Math.max(0, rect.maxX - rect.minX) * Math.max(0, rect.maxY - rect.minY);
}

export function rectCentroid(rect: Rect2D): Point2D {
  return { x: (rect.minX + rect.maxX) / 2, y: (rect.minY + rect.maxY) / 2 };
}

export function boundsOfPoints(points: readonly Point2D[]): Rect2D {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function centroidOf(points: readonly Point2D[]): Point2D {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
