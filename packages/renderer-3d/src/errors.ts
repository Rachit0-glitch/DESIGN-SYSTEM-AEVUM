import type { ThreeDiagnostic } from "./types.js";

export class ThreeFoundationError extends Error {
  public constructor(
    public readonly code: ThreeDiagnostic["code"],
    message: string,
    public readonly diagnostics: readonly ThreeDiagnostic[],
  ) {
    super(message);
    this.name = "ThreeFoundationError";
  }
}
