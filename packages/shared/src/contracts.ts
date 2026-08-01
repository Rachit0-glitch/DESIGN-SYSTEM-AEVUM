export type WorkspacePackageKind = "app" | "package" | "exporter";

export type WorkspacePackageStatus = "PHASE_0_SHELL" | "IMPLEMENTED" | "VALIDATED";

export interface PackageContract {
  readonly name: string;
  readonly kind: WorkspacePackageKind;
  readonly responsibility: string;
  readonly owns: string;
  readonly mustNotOwn: string;
  readonly status: WorkspacePackageStatus;
}

export const CANONICAL_PRODUCT_NAME = "AEVUM AI Reconstruction Engine";

export const CANONICAL_TERMS = [
  "AEVUM AI Reconstruction Engine",
  "Maximum Fidelity",
  "Canonical Design Document",
  "MCP",
  "Hybrid 2D Renderer",
  "3D Engine",
  "Reconstruction Pipeline",
  "Visual Validation",
  "Autonomous Correction Loop",
  "Multi-Stack Export",
  "Canva Export",
  "Command Engine",
] as const;

export type CanonicalTerm = (typeof CANONICAL_TERMS)[number];
