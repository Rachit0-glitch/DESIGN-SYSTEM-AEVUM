import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/vector-engine",
  kind: "package",
  responsibility: "Bezier paths, vector operations, tracing contracts, SVG handling, warps, and morphing.",
  owns: "Vector geometry operations and vector-native import/export helpers.",
  mustNotOwn: "Own full document state or renderer/exporter orchestration.",
  status: "PHASE_0_SHELL",
};

export const VECTOR_ENGINE_STATUS = packageContract.status;
