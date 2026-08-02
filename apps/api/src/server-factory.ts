import { createServer, type Server, type ServerResponse } from "node:http";
import { type AevumLogger, CANONICAL_PRODUCT_NAME, createLogger } from "@aevum/shared";

export interface AevumApiServerOptions {
  readonly logger?: AevumLogger;
}

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
} as const;

function writeJson(response: ServerResponse, statusCode: number, body: object): void {
  response.writeHead(statusCode, responseHeaders);
  response.end(JSON.stringify(body));
}

export function createAevumApiServer(options: AevumApiServerOptions = {}): Server {
  const logger = options.logger ?? createLogger();

  return createServer((request, response) => {
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (method !== "GET" && method !== "HEAD") {
      response.setHeader("allow", "GET, HEAD");
      writeJson(response, 405, { code: "METHOD_NOT_ALLOWED", recoverable: true });
      return;
    }

    if (path === "/" || path === "/health") {
      writeJson(response, 200, {
        product: CANONICAL_PRODUCT_NAME,
        service: "@aevum/api",
        status: "ok",
        scope: "foundation-health-runtime",
      });
      return;
    }

    if (path === "/ready") {
      writeJson(response, 200, {
        service: "@aevum/api",
        status: "ready",
        dependencies: "not-required-for-foundation-health-runtime",
      });
      return;
    }

    logger.warn("api.route.not_found", "Request did not match a foundation API route.", { method, path });
    writeJson(response, 404, { code: "ROUTE_NOT_FOUND", recoverable: true });
  });
}
