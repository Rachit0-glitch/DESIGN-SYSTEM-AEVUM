import { ZodError } from "zod";
import {
  MCP_PROTOCOL_VERSION,
  MCP_TOOL_VERSION,
  McpActorSchema,
  McpAuditRecordSchema,
  McpErrorSchema,
  McpPermissionSchema,
  McpProtocolError,
  McpRequestEnvelopeSchema,
  McpResponseEnvelopeSchema,
  ROLE_PERMISSIONS,
  type McpActor,
  type McpAuditRecord,
  type McpError,
  type McpErrorCode,
  type McpRequestEnvelope,
  type McpResponseEnvelope,
} from "@aevum/mcp-protocol";
import {
  PersistedIdempotencyRecordSchema,
  ProjectRepositoryError,
  type ProjectRepository,
  type WorkspaceMembershipRecord,
} from "@aevum/project-store";
import { createLogger, type AevumLogger } from "@aevum/shared";
import type { AuthVerifier, AuthenticationIdentity } from "./auth.js";
import { AuthenticationError } from "./auth.js";
import { createMcpAuditId, fingerprint, stableStringify } from "./ids.js";
import type { RateLimitProvider } from "./rate-limit.js";
import type { McpServerRuntimeConfig, McpToolRegistry, ToolHandlerResult } from "./registry.js";
import { redactSecrets } from "./redaction.js";

class ToolTimeoutError extends Error {}

export interface ExecuteMcpRequestOptions {
  readonly authorization?: string;
  readonly ip: string;
}

export interface McpExecutorOptions {
  readonly config: McpServerRuntimeConfig;
  readonly authVerifier: AuthVerifier;
  readonly repository: ProjectRepository;
  readonly registry: McpToolRegistry;
  readonly rateLimiter: RateLimitProvider;
  readonly logger?: AevumLogger;
  readonly now?: () => number;
}

function permissionsFor(membership: WorkspaceMembershipRecord) {
  const explicit = membership.permissions.flatMap((permission) => {
    const parsed = McpPermissionSchema.safeParse(permission);
    return parsed.success ? [parsed.data] : [];
  });
  return [...new Set([...ROLE_PERMISSIONS[membership.role], ...explicit])].sort();
}

function actorFrom(identity: AuthenticationIdentity, membership: WorkspaceMembershipRecord): McpActor {
  return McpActorSchema.parse({
    id: `${identity.provider.toLowerCase()}:${identity.subject}`,
    type: identity.type,
    authProvider: identity.provider,
    subject: identity.subject,
    ...(identity.email ? { email: identity.email } : {}),
    roles: [membership.role],
    permissions: permissionsFor(membership),
    workspaceIds: [membership.workspaceId],
  });
}

function errorValue(
  request: Partial<McpRequestEnvelope> & { requestId: string },
  code: McpErrorCode,
  message: string,
  options: { readonly retryable?: boolean; readonly details?: Record<string, unknown> } = {},
): McpError {
  return McpErrorSchema.parse({
    code,
    message,
    recoverable: code !== "MCP_INTERNAL_ERROR",
    retryable: options.retryable ?? false,
    requestId: request.requestId,
    ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
    ...(request.projectId ? { projectId: request.projectId } : {}),
    ...(request.documentId ? { documentId: request.documentId } : {}),
    ...(request.documentVersion ? { documentVersion: request.documentVersion } : {}),
    ...(options.details ? { details: options.details } : {}),
  });
}

function normalizeError(error: unknown, request: Partial<McpRequestEnvelope> & { requestId: string }): McpError {
  if (error instanceof McpProtocolError) return error.value;
  if (error instanceof AuthenticationError) {
    const code =
      error.code === "REQUIRED"
        ? "MCP_AUTHENTICATION_REQUIRED"
        : error.code === "EXPIRED"
          ? "MCP_TOKEN_EXPIRED"
          : "MCP_AUTHENTICATION_INVALID";
    return errorValue(request, code, error.message);
  }
  if (error instanceof ToolTimeoutError)
    return errorValue(request, "MCP_TIMEOUT", "MCP tool execution timed out.", { retryable: true });
  if (error instanceof ProjectRepositoryError) {
    if (error.code === "VERSION_CONFLICT") {
      return errorValue(request, "MCP_DOCUMENT_VERSION_CONFLICT", "The canonical document changed concurrently.", {
        retryable: true,
        ...(error.currentVersion ? { details: { currentVersion: error.currentVersion } } : {}),
      });
    }
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      return errorValue(request, "MCP_IDEMPOTENCY_CONFLICT", error.message);
    }
    return errorValue(request, "MCP_INTERNAL_ERROR", "Project persistence failed.");
  }
  if (error instanceof ZodError) {
    return errorValue(request, "MCP_INPUT_INVALID", "MCP input validation failed.", {
      details: { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
    });
  }
  if (error instanceof Error && /command|transaction|version|node|document/i.test(error.message)) {
    return errorValue(request, "MCP_COMMAND_FAILED", "The Command Engine rejected the requested write.");
  }
  return errorValue(request, "MCP_INTERNAL_ERROR", "The MCP request failed unexpectedly.");
}

function responseFor(
  request: McpRequestEnvelope,
  durationMs: number,
  auditId: string,
  data: unknown,
  mutation: ToolHandlerResult["mutation"],
): McpResponseEnvelope {
  return McpResponseEnvelopeSchema.parse({
    protocolVersion: MCP_PROTOCOL_VERSION,
    success: true,
    requestId: request.requestId,
    correlationId: request.correlationId ?? request.requestId,
    tool: request.tool,
    data,
    warnings: [],
    errors: [],
    ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
    ...(request.projectId ? { projectId: request.projectId } : {}),
    ...(request.documentId ? { documentId: request.documentId } : {}),
    ...(mutation
      ? {
          documentVersion: request.dryRun
            ? mutation.sourceDocument.documentVersion
            : mutation.commit.newDocument.documentVersion,
          transactionId: mutation.commit.auditRecord.transactionId,
        }
      : {}),
    auditId,
    durationMs,
  });
}

function failureResponse(
  request: Partial<McpRequestEnvelope> & { requestId: string; tool: string },
  error: McpError,
  durationMs: number,
  auditId: string,
): McpResponseEnvelope {
  return McpResponseEnvelopeSchema.parse({
    protocolVersion: MCP_PROTOCOL_VERSION,
    success: false,
    requestId: request.requestId,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    tool: request.tool,
    warnings: [],
    errors: [error],
    ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
    ...(request.projectId ? { projectId: request.projectId } : {}),
    ...(request.documentId ? { documentId: request.documentId } : {}),
    auditId,
    durationMs,
  });
}

function auditFor(input: {
  readonly request: Partial<McpRequestEnvelope> & { requestId: string; tool: string };
  readonly auditId: string;
  readonly actorId: string;
  readonly inputHash: string;
  readonly durationMs: number;
  readonly status: "SUCCEEDED" | "FAILED" | "DENIED";
  readonly errorCode?: McpErrorCode;
  readonly mutation?: ToolHandlerResult["mutation"];
}): McpAuditRecord {
  return McpAuditRecordSchema.parse({
    id: input.auditId,
    requestId: input.request.requestId,
    correlationId: input.request.correlationId ?? input.request.requestId,
    actorId: input.actorId,
    ...(input.request.workspaceId ? { workspaceId: input.request.workspaceId } : {}),
    ...(input.request.projectId ? { projectId: input.request.projectId } : {}),
    ...(input.request.documentId ? { documentId: input.request.documentId } : {}),
    tool: input.request.tool,
    toolVersion: MCP_TOOL_VERSION,
    inputHash: input.inputHash,
    dryRun: input.request.dryRun ?? false,
    ...(input.mutation
      ? {
          baseVersion: input.mutation.sourceDocument.documentVersion,
          resultVersion: input.request.dryRun
            ? input.mutation.sourceDocument.documentVersion
            : input.mutation.commit.newDocument.documentVersion,
          transactionId: input.mutation.commit.auditRecord.transactionId,
          commandIds: input.mutation.commit.auditRecord.commandIds,
        }
      : { commandIds: [] }),
    status: input.status,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    durationMs: input.durationMs,
    timestamp: new Date().toISOString(),
  });
}

export function createMcpExecutor(options: McpExecutorOptions) {
  const logger = options.logger ?? createLogger();
  const now = options.now ?? Date.now;

  return Object.freeze({
    async execute(rawRequest: unknown, execution: ExecuteMcpRequestOptions): Promise<McpResponseEnvelope> {
      const started = now();
      const fallback = rawRequest && typeof rawRequest === "object" ? (rawRequest as Record<string, unknown>) : {};
      const requestBase = {
        requestId:
          typeof fallback.requestId === "string" ? fallback.requestId : "mcp_req_00000000-0000-4000-8000-000000000000",
        tool: typeof fallback.tool === "string" ? fallback.tool : "unknown",
      };
      const auditId = createMcpAuditId();
      let request: McpRequestEnvelope | undefined;
      let actor: McpActor | undefined;
      let identity: AuthenticationIdentity | undefined;
      let inputHash = fingerprint({ tool: requestBase.tool, input: fallback.input });
      try {
        request = McpRequestEnvelopeSchema.parse(rawRequest);
        inputHash = fingerprint({
          tool: request.tool,
          workspaceId: request.workspaceId,
          projectId: request.projectId,
          documentId: request.documentId,
          dryRun: request.dryRun,
          input: request.input,
        });
        if (Buffer.byteLength(stableStringify(request.input), "utf8") > options.config.limits.toolInputBytes) {
          throw new McpProtocolError(
            errorValue(request, "MCP_PAYLOAD_TOO_LARGE", "Tool input exceeds its byte limit."),
          );
        }
        if (
          request.tool === "node.create" &&
          request.input &&
          typeof request.input === "object" &&
          !Array.isArray(request.input) &&
          Buffer.byteLength(stableStringify((request.input as Record<string, unknown>).node), "utf8") >
            options.config.limits.nodePayloadBytes
        ) {
          throw new McpProtocolError(
            errorValue(request, "MCP_PAYLOAD_TOO_LARGE", "Node payload exceeds its byte limit."),
          );
        }
        identity = await options.authVerifier.verify(execution.authorization);
        if (!request.workspaceId) {
          throw new McpProtocolError(errorValue(request, "MCP_INPUT_INVALID", "workspaceId is required."));
        }
        const membership = await options.repository.getMembership(identity.subject, request.workspaceId);
        if (membership?.status !== "ACTIVE") {
          throw new McpProtocolError(
            errorValue(request, "MCP_WORKSPACE_ACCESS_DENIED", "Workspace membership is unavailable or inactive."),
          );
        }
        if (
          request.projectId &&
          !["OWNER", "ADMIN", "SERVICE"].includes(membership.role) &&
          !membership.projectIds.includes(request.projectId)
        ) {
          throw new McpProtocolError(
            errorValue(request, "MCP_WORKSPACE_ACCESS_DENIED", "Actor cannot access this workspace project."),
          );
        }
        actor = actorFrom(identity, membership);
        const tool = options.registry.getTool(request.tool);
        if (!tool) throw new McpProtocolError(errorValue(request, "MCP_TOOL_NOT_FOUND", "MCP tool is not registered."));
        if (!tool.descriptor.enabled)
          throw new McpProtocolError(errorValue(request, "MCP_TOOL_DISABLED", "MCP tool is disabled."));
        if (!tool.descriptor.requiredPermissions.every((permission) => actor?.permissions.includes(permission))) {
          throw new McpProtocolError(
            errorValue(request, "MCP_AUTHORIZATION_DENIED", "Actor lacks a required tool permission."),
          );
        }
        if (request.dryRun && !tool.descriptor.supportsDryRun) {
          throw new McpProtocolError(
            errorValue(request, "MCP_INPUT_INVALID", "This MCP tool does not support dry runs."),
          );
        }
        if (
          tool.descriptor.classification === "WRITE" &&
          options.config.features.idempotency &&
          !request.idempotencyKey
        ) {
          throw new McpProtocolError(
            errorValue(request, "MCP_INPUT_INVALID", "Write tools require an idempotencyKey."),
          );
        }
        const rate = await options.rateLimiter.check({
          actorId: actor.id,
          workspaceId: request.workspaceId,
          ip: execution.ip,
          tool: request.tool,
          classification: tool.descriptor.classification,
          now: started,
        });
        if (!rate.allowed) {
          throw new McpProtocolError(
            errorValue(request, "MCP_RATE_LIMITED", "MCP rate limit exceeded.", {
              retryable: true,
              details: { retryAfterMs: rate.retryAfterMs },
            }),
          );
        }
        if (request.idempotencyKey) {
          const existing = await options.repository.getIdempotency(
            actor.id,
            request.workspaceId,
            request.idempotencyKey,
          );
          if (existing) {
            if (existing.inputHash !== inputHash || existing.tool !== request.tool) {
              throw new McpProtocolError(
                errorValue(request, "MCP_IDEMPOTENCY_CONFLICT", "Idempotency key was reused with different input."),
              );
            }
            const durationMs = Math.max(0, now() - started);
            const replay = McpResponseEnvelopeSchema.parse({
              ...McpResponseEnvelopeSchema.parse(existing.result),
              requestId: request.requestId,
              correlationId: request.correlationId ?? request.requestId,
              auditId,
              durationMs,
            });
            if (options.config.features.auditLogs) {
              await options.repository.appendAudit(
                auditFor({
                  request,
                  auditId,
                  actorId: actor.id,
                  inputHash,
                  durationMs,
                  status: "SUCCEEDED",
                }),
              );
            }
            logger.info("mcp.request.replayed", "MCP idempotent request replayed without mutation.", {
              requestId: request.requestId,
              actorId: actor.id,
              workspaceId: request.workspaceId,
              projectId: request.projectId,
              tool: request.tool,
              durationMs,
            });
            return replay;
          }
        }
        let timeout: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new ToolTimeoutError()), tool.descriptor.timeoutMs);
        });
        const result = await Promise.race([
          options.registry.executeTool(request.tool, request.input, {
            actor,
            request,
            repository: options.repository,
            config: options.config,
            registry: options.registry,
            timestamp: new Date(started).toISOString(),
          }),
          timeoutPromise,
        ]).finally(() => {
          if (timeout) clearTimeout(timeout);
        });
        const durationMs = Math.max(0, now() - started);
        const response = responseFor(request, durationMs, auditId, result.data, result.mutation);
        if (Buffer.byteLength(stableStringify(response), "utf8") > options.config.limits.responseBytes) {
          throw new McpProtocolError(
            errorValue(request, "MCP_PAYLOAD_TOO_LARGE", "MCP response exceeds its byte limit."),
          );
        }
        const audit = auditFor({
          request,
          auditId,
          actorId: actor.id,
          inputHash,
          durationMs,
          status: "SUCCEEDED",
          ...(result.mutation ? { mutation: result.mutation } : {}),
        });
        const idempotency = request.idempotencyKey
          ? PersistedIdempotencyRecordSchema.parse({
              key: request.idempotencyKey,
              actorId: actor.id,
              workspaceId: request.workspaceId,
              tool: request.tool,
              inputHash,
              status: "COMPLETED",
              result: response,
              expiresAt: new Date(started + options.config.idempotencyTtlSeconds * 1_000).toISOString(),
              createdAt: new Date(started).toISOString(),
            })
          : undefined;
        if (result.mutation && !request.dryRun) {
          if (!request.projectId) {
            throw new McpProtocolError(errorValue(request, "MCP_INPUT_INVALID", "Write tools require projectId."));
          }
          await options.repository.commitDocument({
            workspaceId: request.workspaceId,
            projectId: request.projectId,
            documentId: result.mutation.sourceDocument.metadata.id,
            expectedVersion: result.mutation.sourceDocument.documentVersion,
            document: result.mutation.commit.newDocument,
            actorId: actor.id,
            transactionId: result.mutation.commit.auditRecord.transactionId,
            audit,
            ...(idempotency ? { idempotency } : {}),
          });
        } else {
          if (options.config.features.auditLogs) await options.repository.appendAudit(audit);
          if (idempotency) await options.repository.saveIdempotency(idempotency);
        }
        logger.info("mcp.request.completed", "MCP request completed.", {
          requestId: request.requestId,
          correlationId: request.correlationId ?? request.requestId,
          actorId: actor.id,
          workspaceId: request.workspaceId,
          projectId: request.projectId,
          documentId: request.documentId,
          tool: request.tool,
          status: "SUCCEEDED",
          durationMs,
        });
        return response;
      } catch (caught) {
        const requestShape = request ?? { ...requestBase };
        const error = normalizeError(caught, requestShape);
        const durationMs = Math.max(0, now() - started);
        const response = failureResponse(requestShape, error, durationMs, auditId);
        const status = ["MCP_AUTHORIZATION_DENIED", "MCP_WORKSPACE_ACCESS_DENIED"].includes(error.code)
          ? "DENIED"
          : "FAILED";
        if (options.config.features.auditLogs) {
          const audit = auditFor({
            request: requestShape,
            auditId,
            actorId: actor?.id ?? (identity ? `${identity.provider.toLowerCase()}:${identity.subject}` : "anonymous"),
            inputHash,
            durationMs,
            status,
            errorCode: error.code,
          });
          try {
            await options.repository.appendAudit(audit);
          } catch (auditError) {
            logger.error(
              "mcp.audit.failed",
              "MCP audit persistence failed.",
              redactSecrets({
                requestId: requestShape.requestId,
                error: auditError instanceof Error ? auditError.message : "unknown",
              }) as Record<string, unknown>,
            );
          }
        }
        logger.warn("mcp.request.failed", "MCP request failed.", {
          requestId: requestShape.requestId,
          actorId: actor?.id,
          workspaceId: "workspaceId" in requestShape ? requestShape.workspaceId : undefined,
          projectId: "projectId" in requestShape ? requestShape.projectId : undefined,
          tool: requestShape.tool,
          status,
          errorCode: error.code,
          durationMs,
        });
        return response;
      }
    },
    async readiness() {
      const [auth, repository] = await Promise.all([options.authVerifier.readiness(), options.repository.readiness()]);
      const registry = options.registry.listTools().length === 12;
      const result = {
        ok: auth && repository.ok && registry,
        checks: {
          environment: true,
          auth,
          repository: repository.ok,
          schema: repository.checks.schema ?? false,
          registry,
          audit: repository.ok,
        },
        ...(repository.schemaVersion ? { schemaVersion: repository.schemaVersion } : {}),
      };
      if (!result.ok) logger.warn("mcp.readiness.failed", "MCP readiness check failed.", { checks: result.checks });
      return result;
    },
    async close() {
      await Promise.all([options.rateLimiter.close(), options.repository.close()]);
    },
  });
}

export type McpExecutor = ReturnType<typeof createMcpExecutor>;
