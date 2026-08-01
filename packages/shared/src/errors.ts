export type ErrorRecoverability = "RECOVERABLE" | "RETRYABLE" | "FATAL";

export const AEVUM_ERROR_CODES = [
  "AUTHENTICATION_ERROR",
  "AUTHORIZATION_ERROR",
  "WORKSPACE_ACCESS_DENIED",
  "PROJECT_NOT_FOUND",
  "DOCUMENT_NOT_FOUND",
  "DOCUMENT_VERSION_CONFLICT",
  "SCHEMA_VALIDATION_ERROR",
  "COMMAND_VALIDATION_ERROR",
  "TRANSACTION_FAILED",
  "ASSET_NOT_FOUND",
  "ASSET_CORRUPT",
  "FORMAT_UNSUPPORTED",
  "CAPABILITY_UNSUPPORTED",
  "PROVIDER_UNAVAILABLE",
  "JOB_FAILED",
  "JOB_CANCELLED",
  "RENDER_FAILED",
  "VALIDATION_FAILED",
  "EXPORT_FAILED",
  "RESOURCE_LIMIT_EXCEEDED",
  "SANDBOX_VIOLATION",
  "BLENDER_BRIDGE_ERROR",
  "CONFIGURATION_ERROR",
  "INTERNAL_ERROR",
] as const;

export type AevumErrorCode = (typeof AEVUM_ERROR_CODES)[number];

export interface AevumErrorContext {
  readonly correlationId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly jobId?: string | undefined;
  readonly projectId?: string | undefined;
  readonly documentId?: string | undefined;
  readonly documentVersion?: number | undefined;
  readonly nodeId?: string | undefined;
  readonly assetId?: string | undefined;
  readonly details?: Record<string, unknown> | undefined;
}

export interface AevumErrorShape extends AevumErrorContext {
  readonly code: AevumErrorCode;
  readonly message: string;
  readonly recoverability: ErrorRecoverability;
  readonly suggestedAction?: string | undefined;
}

export class AevumError extends Error implements AevumErrorShape {
  public readonly code: AevumErrorCode;
  public readonly recoverability: ErrorRecoverability;
  public readonly suggestedAction?: string | undefined;
  public readonly correlationId?: string | undefined;
  public readonly requestId?: string | undefined;
  public readonly jobId?: string | undefined;
  public readonly projectId?: string | undefined;
  public readonly documentId?: string | undefined;
  public readonly documentVersion?: number | undefined;
  public readonly nodeId?: string | undefined;
  public readonly assetId?: string | undefined;
  public readonly details?: Record<string, unknown> | undefined;

  public constructor(shape: AevumErrorShape) {
    super(shape.message);
    this.name = "AevumError";
    this.code = shape.code;
    this.recoverability = shape.recoverability;
    this.suggestedAction = shape.suggestedAction;
    this.correlationId = shape.correlationId;
    this.requestId = shape.requestId;
    this.jobId = shape.jobId;
    this.projectId = shape.projectId;
    this.documentId = shape.documentId;
    this.documentVersion = shape.documentVersion;
    this.nodeId = shape.nodeId;
    this.assetId = shape.assetId;
    this.details = shape.details;
  }

  public toJSON(): AevumErrorShape {
    return {
      code: this.code,
      message: this.message,
      recoverability: this.recoverability,
      suggestedAction: this.suggestedAction,
      correlationId: this.correlationId,
      requestId: this.requestId,
      jobId: this.jobId,
      projectId: this.projectId,
      documentId: this.documentId,
      documentVersion: this.documentVersion,
      nodeId: this.nodeId,
      assetId: this.assetId,
      details: this.details,
    };
  }
}

export function createAevumError(shape: AevumErrorShape): AevumError {
  return new AevumError(shape);
}
