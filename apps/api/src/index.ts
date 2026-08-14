import type { PackageContract } from "@aevum/shared";

export { type AevumApiServerOptions, createAevumApiServer } from "./server-factory.js";
export { ApiRuntimeError, createProductionApiRuntime, createStarterDocument } from "./runtime.js";
export type { AevumApiRuntime, ApiActor, ApiBootstrapResult } from "./runtime.js";

export const packageContract: PackageContract = {
  name: "@aevum/api",
  kind: "app",
  responsibility: "Project, asset, job, export, version, and report API surface for Studio and external callbacks.",
  owns: "HTTP/API orchestration and metadata access.",
  mustNotOwn: "Own rendering, reconstruction, export logic, or canonical document mutation.",
  status: "IMPLEMENTED",
};

export const API_STATUS = packageContract.status;
