export type AssetSystemErrorCode =
  | "ASSET_INPUT_INVALID"
  | "ASSET_METADATA_INVALID"
  | "ORIGINAL_ASSET_MISSING"
  | "ORIGINAL_ASSET_REQUIRED";

export class AssetSystemError extends Error {
  public readonly recoverable = true;

  public constructor(
    public readonly code: AssetSystemErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "AssetSystemError";
  }

  public toJSON(): Readonly<Record<string, unknown>> {
    return { code: this.code, message: this.message, recoverable: this.recoverable, details: this.details };
  }
}
