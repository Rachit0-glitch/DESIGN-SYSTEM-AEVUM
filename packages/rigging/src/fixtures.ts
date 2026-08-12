import type { BoneSpec, VertexInfluence } from "./schemas.js";

export function createCyclicBoneSpecs(): readonly BoneSpec[] {
  return [
    { key: "a", parentKey: "c", head: { x: 0, y: 0, z: 0 }, tail: { x: 0, y: 1, z: 0 }, deforming: true },
    { key: "b", parentKey: "a", head: { x: 0, y: 1, z: 0 }, tail: { x: 0, y: 2, z: 0 }, deforming: true },
    { key: "c", parentKey: "b", head: { x: 0, y: 2, z: 0 }, tail: { x: 0, y: 3, z: 0 }, deforming: true },
  ];
}

export function createDanglingParentBoneSpecs(): readonly BoneSpec[] {
  return [
    { key: "root", parentKey: null, head: { x: 0, y: 0, z: 0 }, tail: { x: 0, y: 1, z: 0 }, deforming: true },
    { key: "child", parentKey: "missing", head: { x: 0, y: 1, z: 0 }, tail: { x: 0, y: 2, z: 0 }, deforming: true },
  ];
}

/** A small mesh with 4 vertices bound to 2 joints: v0/v1 cleanly weighted to joint 0, v2 has a
 * genuine repair case (sums to 1.4, one negative influence), v3 is entirely unweighted. */
export function createSampleVertexInfluences(): readonly (readonly VertexInfluence[])[] {
  return [
    [{ jointIndex: 0, weight: 1 }],
    [
      { jointIndex: 0, weight: 0.6 },
      { jointIndex: 1, weight: 0.4 },
    ],
    [
      { jointIndex: 0, weight: 0.9 },
      { jointIndex: 1, weight: 0.5 },
      { jointIndex: 1, weight: -0.1 },
    ],
    [],
  ];
}
