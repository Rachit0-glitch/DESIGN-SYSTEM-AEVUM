import { randomUUID } from "node:crypto";
import {
  MCP_PROTOCOL_VERSION,
  McpRequestEnvelopeSchema,
  McpResponseEnvelopeSchema,
  SystemCapabilitiesOutputSchema,
  type McpRequestEnvelope,
  type McpResponseEnvelope,
  type SystemCapabilitiesOutput,
} from "@aevum/mcp-protocol";

export interface McpTransportInput {
  readonly request: McpRequestEnvelope;
  readonly authorization?: string;
  readonly signal: AbortSignal;
}

export interface AgentMcpTransport {
  send(input: McpTransportInput): Promise<unknown>;
}

export interface AgentMcpClientOptions {
  readonly transport: AgentMcpTransport;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly documentId?: string;
  readonly authorization?: string;
  readonly correlationId: string;
  readonly timeoutMs: number;
}

export interface AgentMcpInvokeOptions {
  readonly dryRun?: boolean;
  readonly idempotencyKey?: string;
  readonly documentVersion?: number;
  readonly signal?: AbortSignal;
  readonly maxRetries?: number;
  readonly retryBackoffMs?: number;
  readonly onRetry?: (attempt: number, responseOrError: unknown) => void;
}

function requestId(): string {
  return `mcp_req_${randomUUID()}`;
}

function retryableResponse(response: McpResponseEnvelope): boolean {
  const error = response.errors[0];
  return Boolean(error?.retryable && ["MCP_RATE_LIMITED", "MCP_TIMEOUT", "MCP_INTERNAL_ERROR"].includes(error.code));
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("MCP retry cancelled."));
      },
      { once: true },
    );
  });
}

export function createInProcessMcpTransport(
  handler: (input: McpTransportInput) => Promise<unknown>,
): AgentMcpTransport {
  return Object.freeze({ send: handler });
}

export function createHttpMcpTransport(input: {
  readonly endpoint: string;
  readonly fetchImplementation?: typeof fetch;
}): AgentMcpTransport {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const endpoint = new URL("/mcp", input.endpoint).toString();
  const transport: AgentMcpTransport = {
    async send(call) {
      const response = await fetchImplementation(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": call.request.requestId,
          ...(call.authorization ? { authorization: call.authorization } : {}),
        },
        body: JSON.stringify(call.request),
        signal: call.signal,
      });
      return response.json();
    },
  };
  return Object.freeze(transport);
}

export function createAgentMcpClient(options: AgentMcpClientOptions) {
  async function invoke(tool: string, input: unknown, call: AgentMcpInvokeOptions = {}): Promise<McpResponseEnvelope> {
    const maxRetries = call.maxRetries ?? 0;
    let attempt = 0;
    while (true) {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(new Error("MCP tool timeout.")), options.timeoutMs);
      const combined = call.signal ? AbortSignal.any([call.signal, timeout.signal]) : timeout.signal;
      const request = McpRequestEnvelopeSchema.parse({
        protocolVersion: MCP_PROTOCOL_VERSION,
        requestId: requestId(),
        correlationId: options.correlationId,
        workspaceId: options.workspaceId,
        ...(options.projectId ? { projectId: options.projectId } : {}),
        ...(options.documentId ? { documentId: options.documentId } : {}),
        ...(call.documentVersion !== undefined ? { documentVersion: call.documentVersion } : {}),
        tool,
        input,
        dryRun: call.dryRun ?? false,
        ...(call.idempotencyKey ? { idempotencyKey: call.idempotencyKey } : {}),
      });
      try {
        const response = McpResponseEnvelopeSchema.parse(
          await options.transport.send({
            request,
            ...(options.authorization ? { authorization: options.authorization } : {}),
            signal: combined,
          }),
        );
        if (attempt >= maxRetries || !retryableResponse(response)) return response;
        attempt += 1;
        call.onRetry?.(attempt, response);
        await delay(call.retryBackoffMs ?? 0, combined);
      } catch (error) {
        if (call.signal?.aborted || attempt >= maxRetries) throw error;
        attempt += 1;
        call.onRetry?.(attempt, error);
        await delay(call.retryBackoffMs ?? 0, combined);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return Object.freeze({
    invoke,
    async discoverCapabilities(signal?: AbortSignal): Promise<SystemCapabilitiesOutput> {
      const response = await invoke("system.get_capabilities", {}, signal ? { signal } : {});
      if (!response.success || response.data === undefined) {
        throw new Error(response.errors[0]?.code ?? "MCP capability discovery failed.");
      }
      return SystemCapabilitiesOutputSchema.parse(response.data);
    },
  });
}

export type AgentMcpClient = ReturnType<typeof createAgentMcpClient>;
