import { JsonValueSchema } from "@aevum/document-model";
import { z } from "zod";

export const McpTransactionContractSchema = z.strictObject({
  transactionId: z.string().min(1).max(128),
  state: z.enum(["OPEN", "COMMITTED", "ROLLED_BACK", "FAILED"]),
  expectedDocumentVersion: z.number().int().positive(),
  commandCount: z.number().int().nonnegative(),
  expiresAt: z.iso.datetime({ offset: true }),
});

export const McpJobProgressSchema = z.strictObject({
  jobId: z.string().min(1).max(128),
  state: z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
  progress: z.number().finite().min(0).max(1),
  stage: z.string().min(1).max(128),
  message: z.string().max(500).optional(),
  result: JsonValueSchema.optional(),
});

export const McpCancellationSchema = z.strictObject({
  jobId: z.string().min(1).max(128),
  requested: z.boolean(),
  reason: z.string().min(1).max(500).optional(),
});

export type McpTransactionContract = z.infer<typeof McpTransactionContractSchema>;
export type McpJobProgress = z.infer<typeof McpJobProgressSchema>;
export type McpCancellation = z.infer<typeof McpCancellationSchema>;
