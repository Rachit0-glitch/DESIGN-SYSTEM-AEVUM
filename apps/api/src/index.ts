import type { PackageContract } from "@aevum/shared";

export const packageContract: PackageContract = {
  name: "@aevum/api",
  kind: "app",
  responsibility: "Project, asset, job, export, version, and report API surface for Studio and external callbacks.",
  owns: "HTTP/API orchestration and metadata access.",
  mustNotOwn: "Own rendering, reconstruction, export logic, or canonical document mutation.",
  status: "PHASE_0_SHELL",
};

export const API_STATUS = packageContract.status;
