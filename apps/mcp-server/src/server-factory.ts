import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { MCP_PROTOCOL_VERSION, type McpResponseEnvelope } from "@aevum/mcp-protocol";
import { CANONICAL_PRODUCT_NAME, createLogger, type AevumLogger } from "@aevum/shared";
import type { McpExecutor } from "./executor.js";
import { createMcpRequestId } from "./ids.js";

export interface McpHttpServerOptions {
  readonly executor: McpExecutor;
  readonly allowedOrigins: readonly string[];
  readonly deploymentVersion: string;
  readonly requestBodyBytes: number;
  readonly requestTimeoutMs: number;
  readonly trustProxy: boolean;
  readonly production?: boolean;
  readonly logger?: AevumLogger;
}

class PayloadTooLargeError extends Error {}
class RequestBodyError extends Error {}

const securityHeaders = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "content-type": "application/json; charset=utf-8",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

function writeJson(
  response: ServerResponse,
  statusCode: number,
  body: object,
  headers: Readonly<Record<string, string>> = {},
): void {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(statusCode, { ...securityHeaders, ...headers });
  response.end(JSON.stringify(body));
}

function originHeaders(request: IncomingMessage, allowedOrigins: readonly string[]): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "access-control-allow-headers": "authorization, content-type, x-request-id",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-origin": origin,
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
    if (first?.trim()) return first.trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new PayloadTooLargeError();
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      request.resume();
      throw new PayloadTooLargeError();
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new RequestBodyError("Request body is required.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestBodyError("Request body must be valid JSON.");
  }
}

function statusFor(response: McpResponseEnvelope): number {
  if (response.success) return 200;
  switch (response.errors[0]?.code) {
    case "MCP_AUTHENTICATION_REQUIRED":
    case "MCP_AUTHENTICATION_INVALID":
    case "MCP_TOKEN_EXPIRED":
      return 401;
    case "MCP_AUTHORIZATION_DENIED":
    case "MCP_WORKSPACE_ACCESS_DENIED":
      return 403;
    case "MCP_PROJECT_NOT_FOUND":
    case "MCP_DOCUMENT_NOT_FOUND":
    case "MCP_TOOL_NOT_FOUND":
      return 404;
    case "MCP_DOCUMENT_VERSION_CONFLICT":
    case "MCP_IDEMPOTENCY_CONFLICT":
      return 409;
    case "MCP_PAYLOAD_TOO_LARGE":
      return 413;
    case "MCP_RATE_LIMITED":
      return 429;
    case "MCP_TIMEOUT":
      return 504;
    case "MCP_INTERNAL_ERROR":
      return 500;
    default:
      return 400;
  }
}

export function createMcpHttpServer(options: McpHttpServerOptions): Server {
  const logger = options.logger ?? createLogger();
  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    const responseHeaders = {
      ...originHeaders(request, options.allowedOrigins),
      ...(options.production ? { "strict-transport-security": "max-age=31536000; includeSubDomains" } : {}),
    };
    response.setTimeout(options.requestTimeoutMs, () => {
      logger.warn("mcp.http.timeout", "MCP HTTP response timed out.", { method, path });
      response.destroy();
    });

    if (request.headers.origin && !options.allowedOrigins.includes(request.headers.origin)) {
      writeJson(response, 403, { code: "ORIGIN_DENIED", recoverable: false }, responseHeaders);
      return;
    }
    if (method === "OPTIONS" && path === "/mcp") {
      writeJson(response, 204, {}, responseHeaders);
      return;
    }
    if ((method === "GET" || method === "HEAD") && path === "/health") {
      writeJson(
        response,
        200,
        { product: CANONICAL_PRODUCT_NAME, service: "@aevum/mcp-server", status: "healthy" },
        responseHeaders,
      );
      return;
    }
    if ((method === "GET" || method === "HEAD") && path === "/version") {
      writeJson(
        response,
        200,
        { protocolVersion: MCP_PROTOCOL_VERSION, deploymentVersion: options.deploymentVersion },
        responseHeaders,
      );
      return;
    }
    if ((method === "GET" || method === "HEAD") && path === "/ready") {
      const readiness = await options.executor.readiness();
      writeJson(
        response,
        readiness.ok ? 200 : 503,
        { status: readiness.ok ? "ready" : "not_ready", ...readiness },
        responseHeaders,
      );
      return;
    }
    if (method !== "POST" || path !== "/mcp") {
      writeJson(response, 404, { code: "ROUTE_NOT_FOUND", recoverable: true }, responseHeaders);
      return;
    }
    if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      writeJson(response, 415, { code: "UNSUPPORTED_MEDIA_TYPE", recoverable: true }, responseHeaders);
      return;
    }

    const requestIdHeader = request.headers["x-request-id"];
    const requestId =
      typeof requestIdHeader === "string" && /^mcp_req_[0-9a-f-]{36}$/i.test(requestIdHeader)
        ? requestIdHeader
        : createMcpRequestId();
    try {
      const body = await readJson(request, options.requestBodyBytes);
      const result = await options.executor.execute(body, {
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
        ip: clientIp(request, options.trustProxy),
      });
      writeJson(response, statusFor(result), result, { ...responseHeaders, "x-request-id": result.requestId });
    } catch (error) {
      const result = await options.executor.execute(
        { requestId, tool: "transport.invalid" },
        {
          ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
          ip: clientIp(request, options.trustProxy),
        },
      );
      writeJson(response, error instanceof PayloadTooLargeError ? 413 : 400, result, {
        ...responseHeaders,
        "x-request-id": requestId,
      });
    }
  });
  server.requestTimeout = options.requestTimeoutMs;
  server.headersTimeout = Math.min(options.requestTimeoutMs, 15_000);
  server.keepAliveTimeout = 5_000;
  return server;
}
