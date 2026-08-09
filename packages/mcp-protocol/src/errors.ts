import { EntityIdSchema, JsonValueSchema } from "@aevum/document-model";
import { WorkspaceIdSchema } from "@aevum/project-store";
import { z } from "zod";

export const MCP_ERROR_CODES = [
  "MCP_AUTHENTICATION_REQUIRED",
  "MCP_AUTHENTICATION_INVALID",
  "MCP_TOKEN_EXPIRED",
  "MCP_AUTHORIZATION_DENIED",
  "MCP_WORKSPACE_ACCESS_DENIED",
  "MCP_PROJECT_NOT_FOUND",
  "MCP_DOCUMENT_NOT_FOUND",
  "MCP_DOCUMENT_VERSION_CONFLICT",
  "MCP_TOOL_NOT_FOUND",
  "MCP_TOOL_DISABLED",
  "MCP_INPUT_INVALID",
  "MCP_PAYLOAD_TOO_LARGE",
  "MCP_RATE_LIMITED",
  "MCP_TIMEOUT",
  "MCP_COMMAND_FAILED",
  "MCP_TRANSACTION_FAILED",
  "MCP_DRY_RUN_FAILED",
  "MCP_IDEMPOTENCY_CONFLICT",
  "MCP_INTERNAL_ERROR",
] as const;

export const McpErrorCodeSchema = z.enum(MCP_ERROR_CODES);
export const McpErrorSchema = z.strictObject({
  code: McpErrorCodeSchema,
  message: z.string().min(1).max(1_000),
  recoverable: z.boolean(),
  retryable: z.boolean(),
  suggestedAction: z.string().min(1).max(500).optional(),
  requestId: z.string().min(1).max(128),
  workspaceId: WorkspaceIdSchema.optional(),
  projectId: EntityIdSchema.optional(),
  documentId: EntityIdSchema.optional(),
  documentVersion: z.number().int().positive().optional(),
  nodeId: EntityIdSchema.optional(),
  assetId: EntityIdSchema.optional(),
  details: z.record(z.string(), JsonValueSchema).optional(),
});

export const McpWarningSchema = z.strictObject({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  entityId: EntityIdSchema.optional(),
  details: z.record(z.string(), JsonValueSchema).optional(),
});

export type McpErrorCode = z.infer<typeof McpErrorCodeSchema>;
export type McpError = z.infer<typeof McpErrorSchema>;
export type McpWarning = z.infer<typeof McpWarningSchema>;

export class McpProtocolError extends Error {
  public readonly value: McpError;

  public constructor(value: McpError) {
    super(value.message);
    this.name = "McpProtocolError";
    this.value = McpErrorSchema.parse(value);
  }
}
