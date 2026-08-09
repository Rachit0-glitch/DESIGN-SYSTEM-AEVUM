import { CURRENT_COMMAND_VERSION, type ChangeSet } from "@aevum/command-engine";
import {
  AssetSchema,
  CURRENT_SCHEMA_VERSION,
  CanonicalDesignDocumentSchema,
  DesignNodeSchema,
  EntityIdSchema,
  JsonValueSchema,
  TimelineSchema,
} from "@aevum/document-model";
import { WorkspaceIdSchema } from "@aevum/project-store";
import { z } from "zod";
import { McpPermissionSchema } from "./permissions.js";
import { MCP_PROTOCOL_VERSION } from "./version.js";

export const MCP_TOOL_VERSION = "1.0.0" as const;
export const McpAuthModeSchema = z.enum(["development", "supabase", "disabled"]);
export const McpToolNameSchema = z.enum([
  "system.get_capabilities",
  "project.get",
  "document.get",
  "document.get_version",
  "document.list_versions",
  "document.inspect_hierarchy",
  "asset.get",
  "timeline.get",
  "document.rename",
  "node.create",
  "node.update",
  "node.delete",
]);

export const McpToolDescriptorSchema = z.strictObject({
  name: McpToolNameSchema,
  version: z.literal(MCP_TOOL_VERSION),
  description: z.string().min(1).max(500),
  requiredPermissions: z.array(McpPermissionSchema),
  classification: z.enum(["READ", "WRITE"]),
  supportsDryRun: z.boolean(),
  supportsTransactions: z.boolean(),
  supportsIdempotency: z.boolean(),
  timeoutMs: z.number().int().positive(),
  payloadLimitBytes: z.number().int().positive(),
  auditPolicy: z.enum(["ALWAYS", "WRITE_ONLY", "FAILURES"]),
  enabled: z.boolean(),
});

export const McpLimitsSchema = z.strictObject({
  requestBodyBytes: z.number().int().positive(),
  toolInputBytes: z.number().int().positive(),
  responseBytes: z.number().int().positive(),
  metadataBytes: z.number().int().positive(),
  batchSize: z.number().int().positive(),
  nodePayloadBytes: z.number().int().positive(),
  auditPayloadBytes: z.number().int().positive(),
});

export const SystemCapabilitiesInputSchema = z.strictObject({});
export const SystemCapabilitiesOutputSchema = z.strictObject({
  protocolVersion: z.literal(MCP_PROTOCOL_VERSION),
  tools: z.array(McpToolDescriptorSchema),
  enabledTools: z.array(McpToolNameSchema),
  supportedSchemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  supportedCommandVersion: z.literal(CURRENT_COMMAND_VERSION),
  authMode: McpAuthModeSchema,
  dryRunSupport: z.boolean(),
  transactionSupport: z.boolean(),
  limits: McpLimitsSchema,
  deploymentVersion: z.string().min(1).max(128),
  environment: z.enum(["development", "test", "production"]),
});

export const ProjectGetInputSchema = z.strictObject({});
export const ProjectSummarySchema = z.strictObject({
  projectId: EntityIdSchema,
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(255),
  currentDocumentId: EntityIdSchema,
  currentDocumentVersion: z.number().int().positive(),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  nodeCount: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative(),
  timelineCount: z.number().int().nonnegative(),
  openWarnings: z.number().int().nonnegative(),
  lastModifiedAt: z.iso.datetime({ offset: true }),
  lastModifiedBy: z.string().min(1).max(255),
});

export const DocumentGetInputSchema = z.strictObject({
  projection: z.enum(["summary", "full", "node-subtree"]).default("summary"),
  nodeId: EntityIdSchema.optional(),
});
export const DocumentGetVersionInputSchema = z.strictObject({
  version: z.number().int().positive(),
  projection: z.enum(["summary", "full"]).default("summary"),
});
export const DocumentListVersionsInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(25),
  beforeVersion: z.number().int().positive().optional(),
});
export const DocumentSummarySchema = z.strictObject({
  id: EntityIdSchema,
  projectId: EntityIdSchema,
  name: z.string().min(1).max(255),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  documentVersion: z.number().int().positive(),
  rootNodeIds: z.array(EntityIdSchema),
  nodeCount: z.number().int().nonnegative(),
  assetCount: z.number().int().nonnegative(),
  timelineCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
  updatedBy: z.string().min(1).max(255),
});
export const DocumentSubtreeSchema = z.strictObject({
  document: DocumentSummarySchema,
  rootNodeId: EntityIdSchema,
  nodes: z.array(DesignNodeSchema),
});
export const DocumentReadOutputSchema = z.union([
  DocumentSummarySchema,
  CanonicalDesignDocumentSchema,
  DocumentSubtreeSchema,
]);
export const DocumentVersionEntrySchema = z.strictObject({
  documentId: EntityIdSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  actorId: z.string().min(1).max(255),
  transactionId: z.string().min(1).max(128).optional(),
});
export const DocumentListVersionsOutputSchema = z.strictObject({
  versions: z.array(DocumentVersionEntrySchema),
  nextBeforeVersion: z.number().int().positive().optional(),
});

export const DocumentInspectHierarchyInputSchema = z.strictObject({
  rootNodeId: EntityIdSchema.optional(),
  maxDepth: z.number().int().min(0).max(1_000).default(100),
});
export const HierarchyNodeSchema = z.strictObject({
  id: EntityIdSchema,
  parentId: EntityIdSchema.nullable(),
  childIds: z.array(EntityIdSchema),
  type: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  depth: z.number().int().nonnegative(),
  locked: z.boolean(),
  visible: z.boolean(),
});
export const DocumentInspectHierarchyOutputSchema = z.strictObject({
  rootIds: z.array(EntityIdSchema),
  nodes: z.array(HierarchyNodeSchema),
});

export const AssetGetInputSchema = z.strictObject({ assetId: EntityIdSchema });
export const AssetGetOutputSchema = AssetSchema;
export const TimelineGetInputSchema = z.strictObject({ timelineId: EntityIdSchema });
export const TimelineGetOutputSchema = TimelineSchema;

const WriteBaseSchema = z.strictObject({ expectedDocumentVersion: z.number().int().positive() });
export const DocumentRenameInputSchema = WriteBaseSchema.extend({ name: z.string().trim().min(1).max(255) });
export const NodeCreateInputSchema = WriteBaseSchema.extend({
  node: DesignNodeSchema,
  index: z.number().int().nonnegative().optional(),
});
export const NodeUpdateInputSchema = WriteBaseSchema.extend({
  nodeId: EntityIdSchema,
  changes: z.record(z.string().min(1).max(100), JsonValueSchema),
});
export const NodeDeleteInputSchema = WriteBaseSchema.extend({ nodeId: EntityIdSchema });

const ChangeSetSchema: z.ZodType<ChangeSet> = z.strictObject({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  updated: z.array(z.string()),
  moved: z.array(z.string()),
  metadata: z.strictObject({
    commandIds: z.array(z.string()),
    transactionId: z.string(),
    fromVersion: z.number().int().nonnegative(),
    toVersion: z.number().int().positive(),
  }),
});
export const WriteToolOutputSchema = z.strictObject({
  dryRun: z.boolean(),
  baseVersion: z.number().int().positive(),
  resultVersion: z.number().int().positive(),
  predictedDocumentVersion: z.number().int().positive().optional(),
  transactionId: z.string().min(1).max(128),
  commandIds: z.array(z.string().min(1).max(128)),
  changeSet: ChangeSetSchema,
});

export const TOOL_SCHEMAS = Object.freeze({
  "system.get_capabilities": { input: SystemCapabilitiesInputSchema, output: SystemCapabilitiesOutputSchema },
  "project.get": { input: ProjectGetInputSchema, output: ProjectSummarySchema },
  "document.get": { input: DocumentGetInputSchema, output: DocumentReadOutputSchema },
  "document.get_version": { input: DocumentGetVersionInputSchema, output: DocumentReadOutputSchema },
  "document.list_versions": { input: DocumentListVersionsInputSchema, output: DocumentListVersionsOutputSchema },
  "document.inspect_hierarchy": {
    input: DocumentInspectHierarchyInputSchema,
    output: DocumentInspectHierarchyOutputSchema,
  },
  "asset.get": { input: AssetGetInputSchema, output: AssetGetOutputSchema },
  "timeline.get": { input: TimelineGetInputSchema, output: TimelineGetOutputSchema },
  "document.rename": { input: DocumentRenameInputSchema, output: WriteToolOutputSchema },
  "node.create": { input: NodeCreateInputSchema, output: WriteToolOutputSchema },
  "node.update": { input: NodeUpdateInputSchema, output: WriteToolOutputSchema },
  "node.delete": { input: NodeDeleteInputSchema, output: WriteToolOutputSchema },
});

export type McpAuthMode = z.infer<typeof McpAuthModeSchema>;
export type McpToolName = z.infer<typeof McpToolNameSchema>;
export type McpToolDescriptor = z.infer<typeof McpToolDescriptorSchema>;
export type McpLimits = z.infer<typeof McpLimitsSchema>;
export type SystemCapabilitiesOutput = z.infer<typeof SystemCapabilitiesOutputSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type DocumentReadOutput = z.infer<typeof DocumentReadOutputSchema>;
export type WriteToolOutput = z.infer<typeof WriteToolOutputSchema>;
