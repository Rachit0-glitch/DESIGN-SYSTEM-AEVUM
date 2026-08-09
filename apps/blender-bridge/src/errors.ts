import type { BlenderDiagnostic, BlenderDiagnosticCodeSchema } from "./protocol.js";
import type { z } from "zod";

export type BlenderDiagnosticCode = z.infer<typeof BlenderDiagnosticCodeSchema>;

export class BlenderBridgeError extends Error {
  public constructor(
    public readonly code: BlenderDiagnosticCode,
    message: string,
    public readonly diagnostics: readonly BlenderDiagnostic[],
  ) {
    super(message);
    this.name = "BlenderBridgeError";
  }
}

export function blenderError(code: BlenderDiagnosticCode, message: string, recoverable = false): BlenderBridgeError {
  return new BlenderBridgeError(code, message, [
    { code, severity: recoverable ? "ERROR" : "BLOCKING", message, recoverable },
  ]);
}
