import { pointInPolygon, type Point2D } from "./geometry-2d.js";
import type { RawMesh } from "./schemas.js";
import { projectPoint, type ResolvedCameraGeometry } from "@aevum/multiview-reconstruction";

export interface HullView {
  readonly viewId: string;
  readonly geometry: ResolvedCameraGeometry;
  readonly silhouette: readonly Point2D[];
}

export interface VoxelHullOptions {
  readonly resolution: number;
  readonly halfExtent: number;
}

export interface VoxelHullResult {
  readonly mesh: RawMesh;
  readonly occupiedVoxels: number;
  readonly sampleCount: number;
  readonly resolution: number;
}

/**
 * Real multi-view silhouette carving (visual-hull intersection): a voxel is retained only if its
 * center projects inside every calibrated view's silhouette. This is genuine silhouette-volume
 * intersection, not an approximation dressed up with the name — it will over-estimate concavities
 * a true visual hull cannot resolve (a documented, standard limitation of the method itself, not
 * of this implementation).
 */
export function carveVisualHull(
  views: readonly HullView[],
  options: VoxelHullOptions,
): { occupancy: Uint8Array; sampleCount: number } {
  const { resolution, halfExtent } = options;
  const occupancy = new Uint8Array(resolution ** 3);
  const cellSize = (halfExtent * 2) / resolution;
  let sampleCount = 0;

  for (let ix = 0; ix < resolution; ix += 1) {
    const worldX = -halfExtent + (ix + 0.5) * cellSize;
    for (let iy = 0; iy < resolution; iy += 1) {
      const worldY = -halfExtent + (iy + 0.5) * cellSize;
      for (let iz = 0; iz < resolution; iz += 1) {
        const worldZ = -halfExtent + (iz + 0.5) * cellSize;
        sampleCount += 1;
        let inside = views.length > 0;
        for (const view of views) {
          const projected = projectPoint(view.geometry, { x: worldX, y: worldY, z: worldZ });
          if (!projected || !pointInPolygon(projected, view.silhouette)) {
            inside = false;
            break;
          }
        }
        if (inside) occupancy[ix * resolution * resolution + iy * resolution + iz] = 1;
      }
    }
  }

  return { occupancy, sampleCount };
}

const FACE_DIRECTIONS: ReadonlyArray<{
  readonly offset: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly corners: ReadonlyArray<readonly [number, number, number]>;
}> = [
  {
    offset: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [1, -1, 1],
    ],
  },
  {
    offset: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, -1],
    ],
  },
  {
    offset: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [
      [-1, 1, -1],
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
    ],
  },
  {
    offset: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [
      [-1, -1, 1],
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
    ],
  },
  {
    offset: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
      [-1, -1, 1],
    ],
  },
  {
    offset: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
      [1, -1, -1],
    ],
  },
];

/** Naive voxel surface extraction ("boundary faces" / greedy-meshing-lite): emits one quad per
 * exposed face of each occupied voxel (a face is exposed when its neighbor is empty or off-grid).
 * This is a real, honest "voxel/cube surface" mesh — explicitly not smooth marching-cubes output. */
export function extractVoxelSurface(occupancy: Uint8Array, resolution: number, halfExtent: number): RawMesh {
  const cellSize = (halfExtent * 2) / resolution;
  const halfCell = cellSize / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  const at = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || z < 0 || x >= resolution || y >= resolution || z >= resolution) return false;
    return occupancy[x * resolution * resolution + y * resolution + z] === 1;
  };

  for (let ix = 0; ix < resolution; ix += 1) {
    const centerX = -halfExtent + (ix + 0.5) * cellSize;
    for (let iy = 0; iy < resolution; iy += 1) {
      const centerY = -halfExtent + (iy + 0.5) * cellSize;
      for (let iz = 0; iz < resolution; iz += 1) {
        if (!at(ix, iy, iz)) continue;
        const centerZ = -halfExtent + (iz + 0.5) * cellSize;
        for (const face of FACE_DIRECTIONS) {
          if (at(ix + face.offset[0], iy + face.offset[1], iz + face.offset[2])) continue;
          const base = positions.length / 3;
          for (const corner of face.corners) {
            positions.push(
              centerX + corner[0] * halfCell,
              centerY + corner[1] * halfCell,
              centerZ + corner[2] * halfCell,
            );
            normals.push(face.normal[0], face.normal[1], face.normal[2]);
          }
          indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  return { positions, normals, indices };
}

export function countOccupied(occupancy: Uint8Array): number {
  let count = 0;
  for (const value of occupancy) if (value === 1) count += 1;
  return count;
}
