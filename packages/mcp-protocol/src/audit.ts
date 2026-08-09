import { EntityIdSchema, JsonValueSchema } from "@aevum/document-model";
import { WorkspaceIdSchema } from "@aevum/project-store";
import { z } from "zod";
import { McpAuditIdSchema, McpIdempotencyKeySchema, McpRequestIdSchema } from "./envelopes.js";
import { McpErrorCodeSchema } from "./errors.js";

const IsoDateSchema = z.iso.datetime({ offset: true });
const FingerprintSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const McpAuditRecordSchema = z.strictObject({
  id: McpAuditIdSchema,
  requestId: McpRequestIdSchema,
  correlationId: z.string().min(1).max(128),
  actorId: z.string().min(1).max(255),
  workspaceId: WorkspaceIdSchema.optional(),
  projectId: EntityIdSchema.optional(),
  documentId: EntityIdSchema.optional(),
  tool: z.string().min(1).max(128),
  toolVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  inputHash: FingerprintSchema,
  dryRun: z.boolean(),
  baseVersion: z.number().int().positive().optional(),
  resultVersion: z.number().int().positive().optional(),
  transactionId: z.string().min(1).max(128).optional(),
  commandIds: z.array(z.string().min(1).max(128)),
  status: z.enum(["SUCCEEDED", "FAILED", "DENIED"]),
  errorCode: McpErrorCodeSchema.optional(),
  durationMs: z.number().finite().nonnegative(),
  timestamp: IsoDateSchema,
});

export const McpIdempotencyRecordSchema = z.strictObject({
  key: McpIdempotencyKeySchema,
  actorId: z.string().min(1).max(255),
  workspaceId: WorkspaceIdSchema,
  tool: z.string().min(1).max(128),
  inputHash: FingerprintSchema,
  status: z.enum(["COMPLETED", "FAILED"]),
  result: JsonValueSchema,
  expiresAt: IsoDateSchema,
  createdAt: IsoDateSchema,
});

export type McpAuditRecord = z.infer<typeof McpAuditRecordSchema>;
export type McpIdempotencyRecord = z.infer<typeof McpIdempotencyRecordSchema>;
