export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  readonly correlationId?: string | undefined;
  readonly requestId?: string | undefined;
  readonly jobId?: string | undefined;
  readonly projectId?: string | undefined;
  readonly documentId?: string | undefined;
  readonly documentVersion?: number | undefined;
  readonly actorId?: string | undefined;
}

export interface StructuredLogEntry extends LogContext {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly message: string;
  readonly data?: Record<string, unknown> | undefined;
}

export type LogSink = (entry: StructuredLogEntry) => void;

export interface AevumLogger {
  debug(event: string, message: string, data?: Record<string, unknown>): void;
  info(event: string, message: string, data?: Record<string, unknown>): void;
  warn(event: string, message: string, data?: Record<string, unknown>): void;
  error(event: string, message: string, data?: Record<string, unknown>): void;
  child(context: LogContext): AevumLogger;
}

const defaultSink: LogSink = (entry) => {
  const serialized = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(serialized);
    return;
  }
  console.log(serialized);
};

export function createLogger(context: LogContext = {}, sink: LogSink = defaultSink): AevumLogger {
  const emit = (level: LogLevel, event: string, message: string, data?: Record<string, unknown>) => {
    sink({
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      data,
      ...context,
    });
  };

  return {
    debug: (event, message, data) => emit("debug", event, message, data),
    info: (event, message, data) => emit("info", event, message, data),
    warn: (event, message, data) => emit("warn", event, message, data),
    error: (event, message, data) => emit("error", event, message, data),
    child: (childContext) => createLogger({ ...context, ...childContext }, sink),
  };
}
