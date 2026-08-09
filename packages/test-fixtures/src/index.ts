import type { PackageContract } from "@aevum/shared";

export * from "./gltf.js";

export const packageContract: PackageContract = {
  name: "@aevum/test-fixtures",
  kind: "package",
  responsibility: "Typed fixture helpers and references for unit, integration, visual, 3D, and golden-baseline tests.",
  owns: "Fixture contracts and fixture discovery helpers.",
  mustNotOwn: "Contain production logic.",
  status: "IMPLEMENTED",
};

export const TEST_FIXTURES_STATUS = packageContract.status;
