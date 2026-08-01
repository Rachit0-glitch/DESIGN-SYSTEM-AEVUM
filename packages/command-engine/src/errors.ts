export type CommandErrorCode =
  | "COMMAND_VALIDATION_ERROR"
  | "CONFLICT_ERROR"
  | "VERSION_MISMATCH"
  | "CYCLE_DETECTED"
  | "REFERENCE_MISSING"
  | "DUPLICATE_ID"
  | "UNKNOWN_COMMAND"
  | "TRANSACTION_ERROR"
  | "DOCUMENT_REQUIRED"
  | "DOCUMENT_ALREADY_EXISTS"
  | "INVALID_RESULT";

export interface SerializedCommandError {
  readonly name: "CommandEngineError";
  readonly code: CommandErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly details: Readonly<Record<string, unknown>>;
}

export class CommandEngineError extends Error {
  public override readonly name = "CommandEngineError";

  public constructor(
    public readonly code: CommandErrorCode,
    message: string,
    public readonly recoverable: boolean,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
  }

  public toJSON(): SerializedCommandError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      details: this.details,
    };
  }
}

export function commandError(
  code: CommandErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  recoverable = true,
): CommandEngineError {
  return new CommandEngineError(code, message, recoverable, details);
}
