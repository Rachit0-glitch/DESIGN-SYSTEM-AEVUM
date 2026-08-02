import { createLogger, env } from "@aevum/shared";
import { createAevumApiServer } from "./server-factory.js";

const logger = createLogger();
const port = env.services.platformPort ?? env.services.apiPort;
const server = createAevumApiServer({ logger });

server.listen(port, "0.0.0.0", () => {
  logger.info("api.started", "AEVUM foundation API health runtime is listening.", { port });
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info("api.shutdown", "AEVUM foundation API health runtime is shutting down.", { signal });
  server.close((error) => {
    if (error) {
      logger.error("api.shutdown.failed", "API server did not close cleanly.", { message: error.message });
      process.exitCode = 1;
      return;
    }
    process.exitCode = 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
