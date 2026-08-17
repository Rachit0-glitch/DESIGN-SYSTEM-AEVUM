import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  MCP_PROTOCOL_VERSION,
  TOOL_SCHEMAS,
  SystemCapabilitiesOutputSchema,
  type McpResponseEnvelope,
} from "@aevum/mcp-protocol";
import { CANONICAL_PRODUCT_NAME, createLogger, type AevumLogger } from "@aevum/shared";
import { z } from "zod";
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
    "access-control-allow-headers": "authorization, content-type, x-request-id, mcp-protocol-version, mcp-session-id",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-origin": origin,
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

type JsonRpcId = string | number | null;

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function executionMetadata(value: unknown): {
  readonly input: Record<string, unknown>;
  readonly dryRun: boolean;
  readonly idempotencyKey?: string;
  readonly documentVersion?: number;
} {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  const raw = source.aevumExecution;
  delete source.aevumExecution;
  const execution = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    input: source,
    dryRun: execution.dryRun === true,
    ...(typeof execution.idempotencyKey === "string" ? { idempotencyKey: execution.idempotencyKey } : {}),
    ...(typeof execution.documentVersion === "number" ? { documentVersion: execution.documentVersion } : {}),
  };
}

async function executeStreamableMcp(input: {
  readonly body: Record<string, unknown>;
  readonly url: URL;
  readonly authorization?: string;
  readonly ip: string;
  readonly executor: McpExecutor;
  readonly deploymentVersion: string;
}): Promise<{ readonly status: number; readonly body?: object }> {
  const id =
    typeof input.body.id === "string" || typeof input.body.id === "number" || input.body.id === null
      ? input.body.id
      : null;
  const method = typeof input.body.method === "string" ? input.body.method : "";
  if (method.startsWith("notifications/")) return { status: 202 };
  if (method === "initialize") {
    const params =
      input.body.params && typeof input.body.params === "object" ? (input.body.params as Record<string, unknown>) : {};
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "AEVUM AI Reconstruction Engine", version: input.deploymentVersion },
          instructions:
            "AEVUM canonical reads and writes require URL scope parameters. Dry-run every write with aevumExecution.dryRun=true, then apply with a unique idempotencyKey and the expected document version. Never bypass validation or protected-node rules.",
        },
      },
    };
  }
  if (method === "ping") return { status: 200, body: { jsonrpc: "2.0", id, result: {} } };
  const workspaceId = input.url.searchParams.get("workspaceId") ?? undefined;
  const projectId = input.url.searchParams.get("projectId") ?? undefined;
  const documentId = input.url.searchParams.get("documentId") ?? undefined;
  if (!workspaceId) return { status: 400, body: jsonRpcError(id, -32602, "The MCP URL must include workspaceId.") };
  if (method === "tools/list") {
    const response = await input.executor.execute(
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        requestId: createMcpRequestId(),
        workspaceId,
        ...(projectId ? { projectId } : {}),
        ...(documentId ? { documentId } : {}),
        tool: "system.get_capabilities",
        input: {},
        dryRun: false,
      },
      { ...(input.authorization ? { authorization: input.authorization } : {}), ip: input.ip },
    );
    if (!response.success || response.data === undefined) {
      return {
        status: statusFor(response),
        body: jsonRpcError(id, -32001, response.errors[0]?.message ?? "Capability discovery failed."),
      };
    }
    const capabilities = SystemCapabilitiesOutputSchema.parse(response.data);
    const schemas = TOOL_SCHEMAS as Readonly<Record<string, { readonly input: z.ZodType; readonly output: z.ZodType }>>;
    const tools = capabilities.tools
      .filter((tool) => tool.enabled)
      .map((tool) => {
        const schema = schemas[tool.name];
        const inputSchema = schema ? (z.toJSONSchema(schema.input) as Record<string, unknown>) : { type: "object" };
        const properties =
          inputSchema.properties && typeof inputSchema.properties === "object" ? inputSchema.properties : {};
        return {
          name: tool.name,
          description: `${tool.description} Required permissions: ${tool.requiredPermissions.join(", ") || "authenticated workspace access"}.${tool.supportsDryRun ? " For writes, pass aevumExecution with dryRun, idempotencyKey, and documentVersion." : ""}`,
          inputSchema: {
            ...inputSchema,
            properties: {
              ...properties,
              ...(tool.classification === "WRITE"
                ? {
                    aevumExecution: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        dryRun: { type: "boolean" },
                        idempotencyKey: { type: "string", minLength: 8, maxLength: 255 },
                        documentVersion: { type: "integer", minimum: 1 },
                      },
                    },
                  }
                : {}),
            },
          },
          // MCP requires outputSchema, when present, to be an object-rooted JSON Schema. A handful
          // of real tool outputs (e.g. document.get's projection-dependent union of summary/full/
          // subtree shapes) are legitimately not a single object at the top level; z.toJSONSchema
          // renders those as a bare `anyOf` with no `type: "object"`, which a strict MCP client
          // (found live: Claude Code's own CLI) rejects outright for the whole tools/list response,
          // not just that tool. outputSchema is optional per spec, so omit it rather than advertise
          // a non-compliant one -- the tool's actual response is unaffected either way.
          ...(schema && (z.toJSONSchema(schema.output) as { type?: unknown }).type === "object"
            ? { outputSchema: z.toJSONSchema(schema.output) }
            : {}),
          annotations: {
            readOnlyHint: tool.classification === "READ",
            destructiveHint: tool.name.includes("delete"),
            idempotentHint: tool.classification === "READ" || tool.supportsIdempotency,
            openWorldHint: false,
          },
        };
      });
    return { status: 200, body: { jsonrpc: "2.0", id, result: { tools } } };
  }
  if (method === "tools/call") {
    const params =
      input.body.params && typeof input.body.params === "object" ? (input.body.params as Record<string, unknown>) : {};
    if (typeof params.name !== "string")
      return { status: 400, body: jsonRpcError(id, -32602, "Tool name is required.") };
    const execution = executionMetadata(params.arguments);
    const response = await input.executor.execute(
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        requestId: createMcpRequestId(),
        correlationId: `external_mcp_${createMcpRequestId().slice(8)}`,
        workspaceId,
        ...(projectId ? { projectId } : {}),
        ...(documentId ? { documentId } : {}),
        ...(execution.documentVersion ? { documentVersion: execution.documentVersion } : {}),
        tool: params.name,
        input: execution.input,
        dryRun: execution.dryRun,
        ...(execution.idempotencyKey ? { idempotencyKey: execution.idempotencyKey } : {}),
        metadata: { transport: "streamable-http" },
      },
      { ...(input.authorization ? { authorization: input.authorization } : {}), ip: input.ip },
    );
    const result = response.success
      ? {
          content: [{ type: "text", text: JSON.stringify(response.data ?? null) }],
          ...(response.data === undefined ? {} : { structuredContent: response.data }),
          isError: false,
        }
      : {
          content: [{ type: "text", text: response.errors[0]?.message ?? "AEVUM tool failed." }],
          structuredContent: { errors: response.errors, requestId: response.requestId },
          isError: true,
        };
    return { status: response.success ? 200 : statusFor(response), body: { jsonrpc: "2.0", id, result } };
  }
  return { status: 404, body: jsonRpcError(id, -32601, "Method not found.") };
}

export function clientIp(request: IncomingMessage, trustProxy: boolean): string {
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
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const path = requestUrl.pathname;
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
      if (
        body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        (body as Record<string, unknown>).jsonrpc === "2.0"
      ) {
        const result = await executeStreamableMcp({
          body: body as Record<string, unknown>,
          url: requestUrl,
          ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
          ip: clientIp(request, options.trustProxy),
          executor: options.executor,
          deploymentVersion: options.deploymentVersion,
        });
        if (result.body)
          writeJson(response, result.status, result.body, { ...responseHeaders, "mcp-protocol-version": "2025-06-18" });
        else response.writeHead(result.status, responseHeaders).end();
        return;
      }
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
