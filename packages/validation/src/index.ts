import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/validation",
  kind: "package",
  responsibility:
    "2D, 3D, typography, layout, export, performance, and accessibility validation contracts and scoring.",
  owns: "Measurable validation records and issue attribution.",
  mustNotOwn: "Mutate canonical state.",
  status: "PHASE_0_SHELL",
};

export const VALIDATION_STATUS = packageContract.status;
