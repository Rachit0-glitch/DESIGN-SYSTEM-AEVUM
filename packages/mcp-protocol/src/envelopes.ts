import { EntityIdSchema, JsonValueSchema } from "@aevum/document-model";
import { WorkspaceIdSchema } from "@aevum/project-store";
import { z } from "zod";
import { McpErrorSchema, McpWarningSchema } from "./errors.js";
import { MCP_PROTOCOL_VERSION } from "./version.js";

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export const McpRequestIdSchema = z.string().regex(new RegExp(`^mcp_req_${uuidPattern}$`, "i"));
export const McpAuditIdSchema = z.string().regex(new RegExp(`^mcp_audit_${uuidPattern}$`, "i"));
export const McpIdempotencyKeySchema = z.string().trim().min(8).max(255);

const forbiddenMetadataKey = /authorization|cookie|token|secret|password|api.?key|database.?url/i;
const SafeMetadataSchema = z.record(z.string().min(1).max(100), JsonValueSchema).superRefine((metadata, context) => {
  if (Object.keys(metadata).length > 32) {
    context.addIssue({ code: "custom", message: "MCP metadata may contain at most 32 keys." });
  }
  for (const key of Object.keys(metadata)) {
    if (forbiddenMetadataKey.test(key)) {
      context.addIssue({ code: "custom", path: [key], message: "Sensitive metadata keys are prohibited." });
    }
  }
  if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > 16_384) {
    context.addIssue({ code: "custom", message: "MCP metadata exceeds 16384 bytes." });
  }
});

export const McpRequestEnvelopeSchema = z.strictObject({
  protocolVersion: z.literal(MCP_PROTOCOL_VERSION),
  requestId: McpRequestIdSchema,
  correlationId: z.string().trim().min(1).max(128).optional(),
  workspaceId: WorkspaceIdSchema.optional(),
  projectId: EntityIdSchema.optional(),
  documentId: EntityIdSchema.optional(),
  documentVersion: z.number().int().positive().optional(),
  tool: z.string().trim().min(1).max(128),
  input: JsonValueSchema,
  dryRun: z.boolean().default(false),
  idempotencyKey: McpIdempotencyKeySchema.optional(),
  metadata: SafeMetadataSchema.optional(),
});

export const McpResponseEnvelopeSchema = z.strictObject({
  protocolVersion: z.literal(MCP_PROTOCOL_VERSION),
  success: z.boolean(),
  requestId: McpRequestIdSchema,
  correlationId: z.string().min(1).max(128).optional(),
  tool: z.string().min(1).max(128),
  data: JsonValueSchema.optional(),
  warnings: z.array(McpWarningSchema),
  errors: z.array(McpErrorSchema),
  workspaceId: WorkspaceIdSchema.optional(),
  projectId: EntityIdSchema.optional(),
  documentId: EntityIdSchema.optional(),
  documentVersion: z.number().int().positive().optional(),
  transactionId: z.string().min(1).max(128).optional(),
  auditId: McpAuditIdSchema.optional(),
  durationMs: z.number().finite().nonnegative(),
});

export type McpRequestEnvelope = z.infer<typeof McpRequestEnvelopeSchema>;
export type McpResponseEnvelope = z.infer<typeof McpResponseEnvelopeSchema>;
