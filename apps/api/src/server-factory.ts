import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AevumLogger, CANONICAL_PRODUCT_NAME, createLogger } from "@aevum/shared";
import { ApiRuntimeError, type AevumApiRuntime } from "./runtime.js";

export interface AevumApiServerOptions {
  readonly logger?: AevumLogger;
  readonly runtime?: AevumApiRuntime;
  readonly allowedOrigins?: readonly string[];
  readonly deploymentVersion?: string;
  readonly maxPayloadBytes?: number;
  readonly requestTimeoutMs?: number;
  readonly rateLimitPerMinute?: number;
  readonly production?: boolean;
}

const baseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: object,
  headers: Record<string, string> = {},
): void {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(statusCode, { ...baseHeaders, ...headers });
  response.end(JSON.stringify(body));
}

function corsHeaders(request: IncomingMessage, allowedOrigins: readonly string[]): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, content-type, x-request-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

async function readEmptyJson(request: IncomingMessage, maxBytes: number): Promise<void> {
  const declared = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiRuntimeError("PAYLOAD_TOO_LARGE", "Request payload is too large.");
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new ApiRuntimeError("PAYLOAD_TOO_LARGE", "Request payload is too large.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiRuntimeError("ACCESS_DENIED", "Request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length > 0) {
    throw new ApiRuntimeError("ACCESS_DENIED", "Bootstrap accepts only an empty JSON object.");
  }
}

export function createAevumApiServer(options: AevumApiServerOptions = {}): Server {
  const logger = options.logger ?? createLogger();
  const allowedOrigins = options.allowedOrigins ?? [];
  const rateBuckets = new Map<string, number[]>();
  const server = createServer(async (request, response) => {
    const started = Date.now();
    const requestId =
      typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : crypto.randomUUID();
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const headers = {
      ...corsHeaders(request, allowedOrigins),
      "x-request-id": requestId,
      ...(options.production ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
    };

    if (request.headers.origin && !allowedOrigins.includes(request.headers.origin)) {
      writeJson(response, 403, { code: "ORIGIN_DENIED", recoverable: false, requestId }, headers);
      return;
    }
    if (method === "OPTIONS" && path.startsWith("/v1/")) {
      writeJson(response, 204, {}, headers);
      return;
    }
    if ((method === "GET" || method === "HEAD") && (path === "/" || path === "/health")) {
      writeJson(
        response,
        200,
        {
          product: CANONICAL_PRODUCT_NAME,
          service: "@aevum/api",
          status: "ok",
          scope: options.runtime ? "production-bootstrap-runtime" : "foundation-health-runtime",
        },
        headers,
      );
      return;
    }
    if ((method === "GET" || method === "HEAD") && path === "/version") {
      writeJson(
        response,
        200,
        { service: "@aevum/api", deploymentVersion: options.deploymentVersion ?? "development" },
        headers,
      );
      return;
    }
    if ((method === "GET" || method === "HEAD") && path === "/ready") {
      if (!options.runtime) {
        writeJson(response, 200, {
          service: "@aevum/api",
          status: "ready",
          dependencies: "not-required-for-foundation-health-runtime",
        });
        return;
      }
      const readiness = await options.runtime.readiness();
      writeJson(
        response,
        readiness.ok ? 200 : 503,
        {
          service: "@aevum/api",
          status: readiness.ok ? "ready" : "not_ready",
          ...readiness,
        },
        headers,
      );
      return;
    }
    if (["/", "/health", "/ready", "/version"].includes(path) && !["GET", "HEAD"].includes(method)) {
      response.setHeader("allow", "GET, HEAD");
      writeJson(response, 405, { code: "METHOD_NOT_ALLOWED", recoverable: true });
      return;
    }
    if (!options.runtime || path !== "/v1/bootstrap" || !["GET", "POST"].includes(method)) {
      if (!["GET", "HEAD", "POST", "OPTIONS"].includes(method)) response.setHeader("allow", "GET, HEAD, POST, OPTIONS");
      if (!options.runtime) {
        writeJson(response, 404, { code: "ROUTE_NOT_FOUND", recoverable: true });
        return;
      }
      writeJson(
        response,
        path === "/v1/bootstrap" ? 405 : 404,
        { code: path === "/v1/bootstrap" ? "METHOD_NOT_ALLOWED" : "ROUTE_NOT_FOUND", recoverable: true, requestId },
        headers,
      );
      return;
    }

    const ip = request.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const active = (rateBuckets.get(ip) ?? []).filter((entry) => now - entry < 60_000);
    if (active.length >= (options.rateLimitPerMinute ?? 120)) {
      writeJson(response, 429, { code: "RATE_LIMITED", recoverable: true, requestId }, headers);
      return;
    }
    rateBuckets.set(ip, [...active, now]);

    try {
      if (method === "POST") await readEmptyJson(request, options.maxPayloadBytes ?? 65_536);
      const result = await options.runtime.bootstrap(request.headers.authorization, method === "POST");
      writeJson(response, 200, result, headers);
      logger.info("api.bootstrap.completed", "Authenticated Studio bootstrap completed.", {
        requestId,
        workspaceCount: result.workspaces.length,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      const runtimeError = error instanceof ApiRuntimeError ? error : undefined;
      const status =
        runtimeError?.code === "AUTH_REQUIRED" || runtimeError?.code === "AUTH_INVALID"
          ? 401
          : runtimeError?.code === "PAYLOAD_TOO_LARGE"
            ? 413
            : runtimeError?.code === "ACCESS_DENIED"
              ? 400
              : 500;
      logger.warn("api.bootstrap.failed", "Authenticated Studio bootstrap failed.", {
        requestId,
        code: runtimeError?.code ?? "INTERNAL_ERROR",
        durationMs: Date.now() - started,
      });
      writeJson(
        response,
        status,
        { code: runtimeError?.code ?? "INTERNAL_ERROR", recoverable: status !== 401, requestId },
        headers,
      );
    }
  });
  server.requestTimeout = options.requestTimeoutMs ?? 15_000;
  server.headersTimeout = Math.min(options.requestTimeoutMs ?? 15_000, 10_000);
  server.keepAliveTimeout = 5_000;
  return server;
}
