import { createLogger, env } from "@aevum/shared";
import { createAevumApiServer } from "./server-factory.js";
import { createProductionApiRuntime } from "./runtime.js";

const logger = createLogger();
const port = env.services.platformPort ?? env.services.apiPort;
const runtime =
  env.nodeEnv === "production" && env.runtimeMode === "full" ? createProductionApiRuntime(env) : undefined;
const server = createAevumApiServer({
  logger,
  ...(runtime ? { runtime } : {}),
  allowedOrigins: env.api.allowedOrigins,
  deploymentVersion: env.api.deploymentVersion,
  maxPayloadBytes: env.api.maxPayloadBytes,
  requestTimeoutMs: env.api.requestTimeoutMs,
  rateLimitPerMinute: env.api.rateLimitPerMinute,
  production: env.nodeEnv === "production",
});

server.listen(port, "0.0.0.0", () => {
  logger.info("api.started", "AEVUM API runtime is listening.", { port, mode: runtime ? "production" : "foundation" });
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info("api.shutdown", "AEVUM foundation API health runtime is shutting down.", { signal });
  server.close((error) => {
    if (error) {
      logger.error("api.shutdown.failed", "API server did not close cleanly.", { message: error.message });
      process.exitCode = 1;
      return;
    }
    void runtime?.close();
    process.exitCode = 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
