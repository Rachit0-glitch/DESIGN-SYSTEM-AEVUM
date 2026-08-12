import type { McpActor, McpRequestEnvelope, McpToolDescriptor, McpToolName } from "@aevum/mcp-protocol";
import { McpToolDescriptorSchema, TOOL_SCHEMAS } from "@aevum/mcp-protocol";
import type { ProjectRepository } from "@aevum/project-store";
import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { TransactionCommitResult } from "@aevum/command-engine";
import type { z } from "zod";

export interface McpServerRuntimeConfig {
  readonly nodeEnv: "development" | "test" | "production";
  readonly authMode: "development" | "supabase" | "disabled";
  readonly deploymentVersion: string;
  readonly toolTimeoutMs: number;
  readonly idempotencyTtlSeconds: number;
  readonly features: {
    readonly auditLogs: boolean;
    readonly dryRun: boolean;
    readonly transactions: boolean;
    readonly idempotency: boolean;
  };
  readonly limits: {
    readonly requestBodyBytes: number;
    readonly responseBytes: number;
    readonly toolInputBytes: number;
    readonly metadataBytes: number;
    readonly nodePayloadBytes: number;
    readonly auditPayloadBytes: number;
    readonly batchSize: number;
  };
}

export interface ToolMutationResult {
  readonly commit: TransactionCommitResult;
  readonly sourceDocument: CanonicalDesignDocument;
}

export interface ToolHandlerResult {
  readonly data: unknown;
  readonly mutation?: ToolMutationResult;
}

export interface BlenderToolAdapter {
  execute(input: {
    readonly tool: Extract<
      McpToolName,
      | `blender.${string}`
      | "three.inspect_topology"
      | "three.inspect_uv"
      | "three.validate_mesh"
      | "three.validate_material"
      | "three.analyze_web_quality"
      | "three.bevel_mesh"
      | "three.unwrap_uv"
      | "three.update_pbr_material"
      | "three.rig_create"
      | "three.rig_inspect"
      | "three.skin_bind"
      | "three.skin_inspect"
      | "three.pose_inspect"
      | "three.pose_update"
      | "three.pose_reset"
      | "three.weight_inspect"
      | "three.weight_update"
      | "three.weight_normalize"
      | "three.ik_update"
      | "three.constraint_update"
      | "three.deformation_validate"
    >;
    readonly payload: unknown;
    readonly document: CanonicalDesignDocument;
    readonly actor: McpActor;
    readonly request: McpRequestEnvelope;
    readonly timestamp: string;
  }): Promise<ToolHandlerResult>;
}

/**
 * Resolves a registered asset's raw bytes for tools (like `three.import_scene`) that must parse
 * actual GLB/GLTF content, not just canonical metadata. No production asset-byte storage adapter
 * exists in this repository yet (Phase 3 left asset storage as a provider-neutral interface only)
 * — this seam makes that dependency explicit and injectable rather than silently assumed. Without
 * one configured, the affected tools are honestly disabled (`MCP_TOOL_DISABLED`), never faked.
 */
export interface AssetBytesResolver {
  resolve(assetId: string): Promise<Uint8Array | undefined>;
}

export interface ToolExecutionContext {
  readonly actor: McpActor;
  readonly request: McpRequestEnvelope;
  readonly repository: ProjectRepository;
  readonly config: McpServerRuntimeConfig;
  readonly registry: McpToolRegistry;
  readonly timestamp: string;
}

export interface McpToolDefinition {
  readonly descriptor: McpToolDescriptor;
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolHandlerResult>;
}

export interface McpToolRegistry {
  registerTool(definition: McpToolDefinition): void;
  getTool(name: string): McpToolDefinition | undefined;
  listTools(): readonly McpToolDescriptor[];
  executeTool(name: string, input: unknown, context: ToolExecutionContext): Promise<ToolHandlerResult>;
}

export function createToolRegistry(): McpToolRegistry {
  const definitions = new Map<McpToolName, McpToolDefinition>();
  return {
    registerTool(definition) {
      const descriptor = McpToolDescriptorSchema.parse(definition.descriptor);
      if (definitions.has(descriptor.name)) throw new Error(`MCP tool ${descriptor.name} is already registered.`);
      const canonical = TOOL_SCHEMAS[descriptor.name];
      definitions.set(descriptor.name, {
        ...definition,
        descriptor,
        inputSchema: canonical.input,
        outputSchema: canonical.output,
      });
    },
    getTool(name) {
      return definitions.get(name as McpToolName);
    },
    listTools() {
      return [...definitions.values()].map((entry) => entry.descriptor).sort((a, b) => a.name.localeCompare(b.name));
    },
    async executeTool(name, input, context) {
      const definition = definitions.get(name as McpToolName);
      if (!definition) throw new Error(`MCP tool ${name} is not registered.`);
      const parsedInput = definition.inputSchema.parse(input);
      const result = await definition.execute(parsedInput, context);
      return { ...result, data: definition.outputSchema.parse(result.data) };
    },
  };
}

export function registerTool(registry: McpToolRegistry, definition: McpToolDefinition): void {
  registry.registerTool(definition);
}

export function getTool(registry: McpToolRegistry, name: string): McpToolDefinition | undefined {
  return registry.getTool(name);
}

export function listTools(registry: McpToolRegistry): readonly McpToolDescriptor[] {
  return registry.listTools();
}

export function executeTool(
  registry: McpToolRegistry,
  name: string,
  input: unknown,
  context: ToolExecutionContext,
): Promise<ToolHandlerResult> {
  return registry.executeTool(name, input, context);
}
