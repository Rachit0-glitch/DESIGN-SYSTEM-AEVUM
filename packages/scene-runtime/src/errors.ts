import type { RuntimeDiagnostic } from "./types.js";

export class SceneProjectionError extends Error {
  readonly code: string;
  readonly diagnostics: readonly RuntimeDiagnostic[];

  constructor(message: string, diagnostics: readonly RuntimeDiagnostic[], code = "SCENE_PROJECTION_FAILED") {
    super(message);
    this.name = "SceneProjectionError";
    this.code = code;
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

export class UnsupportedSchemaVersionError extends SceneProjectionError {
  constructor(diagnostics: readonly RuntimeDiagnostic[]) {
    super("The Canonical Design Document schema version is not supported.", diagnostics, "UNSUPPORTED_SCHEMA_VERSION");
    this.name = "UnsupportedSchemaVersionError";
  }
}

export class ProjectionLimitExceededError extends SceneProjectionError {
  constructor(diagnostics: readonly RuntimeDiagnostic[]) {
    super("A configured scene projection limit was exceeded.", diagnostics, "PROJECTION_LIMIT_EXCEEDED");
    this.name = "ProjectionLimitExceededError";
  }
}

export class StrictProjectionFailedError extends SceneProjectionError {
  constructor(diagnostics: readonly RuntimeDiagnostic[]) {
    super("Strict scene projection failed with structural diagnostics.", diagnostics, "STRICT_PROJECTION_FAILED");
    this.name = "StrictProjectionFailedError";
  }
}
