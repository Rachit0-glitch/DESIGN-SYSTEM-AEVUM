import type { PackageContract } from "@aevum/shared";

export * from "./core/fixture.js";
export * from "./core/agent.js";
export * from "./core/session.js";
export * from "./core/studio-state.js";

export const packageContract: PackageContract = {
  name: "@aevum/studio",
  kind: "app",
  responsibility: "Professional visual editing and AI control over canonical AEVUM projects.",
  owns: "Transient editor state, typed data access, interaction orchestration, and accessible visual workspaces.",
  mustNotOwn: "Canonical project state, renderer logic, command execution policy, or MCP authorization.",
  status: "IMPLEMENTED",
};

export const STUDIO_STATUS = packageContract.status;
