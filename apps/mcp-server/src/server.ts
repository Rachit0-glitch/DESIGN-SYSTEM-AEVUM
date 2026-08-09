import { createLogger, env } from "@aevum/shared";
import { createProductionMcpRuntime } from "./runtime.js";
import { createMcpHttpServer } from "./server-factory.js";

const logger = createLogger();
const executor = createProductionMcpRuntime(env, logger);
const server = createMcpHttpServer({
  executor,
  allowedOrigins: env.mcp.allowedOrigins,
  deploymentVersion: env.mcp.deploymentVersion,
  requestBodyBytes: env.mcp.limits.requestBodyBytes,
  requestTimeoutMs: env.mcp.requestTimeoutMs,
  trustProxy: env.mcp.trustProxy,
  production: env.nodeEnv === "production",
  logger,
});

server.listen(env.mcp.port, env.mcp.host, () => {
  logger.info("mcp.started", "AEVUM MCP server is listening.", {
    host: env.mcp.host,
    port: env.mcp.port,
    protocolVersion: "1.0.0",
    deploymentVersion: env.mcp.deploymentVersion,
  });
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("mcp.shutdown.started", "AEVUM MCP server is shutting down.", { signal });
  const forced = setTimeout(() => {
    logger.error("mcp.shutdown.forced", "AEVUM MCP server exceeded its shutdown grace period.");
    server.closeAllConnections();
    process.exitCode = 1;
  }, env.mcp.shutdownGraceMs);
  forced.unref();
  server.close(async (error) => {
    clearTimeout(forced);
    await executor.close();
    if (error) {
      logger.error("mcp.shutdown.failed", "AEVUM MCP server did not close cleanly.", { message: error.message });
      process.exitCode = 1;
      return;
    }
    logger.info("mcp.shutdown.completed", "AEVUM MCP server stopped cleanly.");
    process.exitCode = 0;
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
