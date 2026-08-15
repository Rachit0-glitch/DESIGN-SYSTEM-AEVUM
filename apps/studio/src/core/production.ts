import { createAgentMcpClient, createHttpMcpTransport } from "@aevum/agent-runtime/client";
import { AgentApprovalPolicySchema } from "@aevum/agent-core";
import { CanonicalDesignDocumentSchema, type CanonicalDesignDocument } from "@aevum/document-model";
import { DocumentReadOutputSchema, WriteToolOutputSchema } from "@aevum/mcp-protocol";
import type { ProjectMetadata } from "@aevum/project-store";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { StudioAgentContext } from "./agent.js";
import type { StudioCommandGateway } from "./session.js";
import type { Command } from "@aevum/command-engine";
import { findStudioCapability, isGatewayRoutable } from "./capabilities.js";

const BrowserConfigurationSchema = z.strictObject({
  supabaseUrl: z.url().startsWith("https://"),
  supabaseAnonKey: z.string().min(20),
  apiUrl: z.url().startsWith("https://"),
  mcpUrl: z.url().startsWith("https://"),
  // Wires AGENT_APPROVAL_POLICY into the live engine (Block D5) — previously parsed server-side
  // (packages/shared/src/env.ts) but never read by the production entrypoint, so the engine always
  // silently defaulted regardless of what this said. Same 4 policy values, same default
  // (AUTO_SAFE_WRITE) as the server-side schema.
  agentApprovalPolicy: AgentApprovalPolicySchema.default("AUTO_SAFE_WRITE"),
});

const BootstrapSchema = z.strictObject({
  actor: z.strictObject({ subject: z.string().min(1), email: z.string().email().optional() }),
  workspaces: z.array(
    z.strictObject({
      membership: z.strictObject({
        workspaceId: z.string().min(1),
        actorSubject: z.string().min(1),
        role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER", "AGENT", "SERVICE"]),
        permissions: z.array(z.string()),
        projectIds: z.array(z.string()),
        status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
        updatedAt: z.string().datetime({ offset: true }),
      }),
      projects: z.array(
        z.strictObject({
          id: z.string().min(1),
          workspaceId: z.string().min(1),
          name: z.string().min(1),
          status: z.enum(["ACTIVE", "ARCHIVED"]),
          currentDocumentId: z.string().min(1),
          currentDocumentVersion: z.number().int().positive(),
          updatedAt: z.string().datetime({ offset: true }),
        }),
      ),
    }),
  ),
});

export interface StudioBrowserConfiguration extends z.infer<typeof BrowserConfigurationSchema> {}

export interface ProductionStudioProject {
  readonly project: ProjectMetadata;
  readonly document: CanonicalDesignDocument;
  readonly workspaceId: string;
  readonly accessToken: string;
  readonly commandGateway: StudioCommandGateway;
  readonly agentContext: StudioAgentContext;
}

export function readStudioBrowserConfiguration(): StudioBrowserConfiguration {
  return BrowserConfigurationSchema.parse({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    apiUrl: import.meta.env.VITE_AEVUM_API_URL,
    mcpUrl: import.meta.env.VITE_AEVUM_MCP_URL,
    agentApprovalPolicy: import.meta.env.VITE_AGENT_APPROVAL_POLICY,
  });
}

export function createStudioAuthClient(configuration: StudioBrowserConfiguration): SupabaseClient {
  return createClient(configuration.supabaseUrl, configuration.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

function scopedClient(input: {
  configuration: StudioBrowserConfiguration;
  getAccessToken: () => string;
  workspaceId: string;
  projectId: string;
  documentId: string;
  correlationId?: string;
}) {
  return createAgentMcpClient({
    transport: createHttpMcpTransport({ endpoint: input.configuration.mcpUrl }),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    documentId: input.documentId,
    authorization: `Bearer ${input.getAccessToken()}`,
    correlationId: input.correlationId ?? `studio_${crypto.randomUUID()}`,
    timeoutMs: 15_000,
  });
}

/**
 * `getAccessToken` is read at call time (not captured once) so a background Supabase token
 * refresh updates future MCP calls without requiring the caller to reload the whole project.
 */
export async function loadProductionStudioProject(
  configuration: StudioBrowserConfiguration,
  session: Session,
  getAccessToken: () => string = () => session.access_token,
): Promise<ProductionStudioProject> {
  const bootstrapResponse = await fetch(new URL("/v1/bootstrap", configuration.apiUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${getAccessToken()}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!bootstrapResponse.ok) throw new Error("Your AEVUM workspace could not be opened.");
  const bootstrapResult = BootstrapSchema.safeParse(await bootstrapResponse.json());
  if (!bootstrapResult.success) throw new Error("The workspace service returned an incompatible response.");
  const bootstrap = bootstrapResult.data;
  const workspace = bootstrap.workspaces.find((entry) => entry.projects.some((project) => project.status === "ACTIVE"));
  const record = workspace?.projects.find((project) => project.status === "ACTIVE");
  if (!workspace || !record) throw new Error("No active AEVUM project is available for this account.");
  const client = scopedClient({
    configuration,
    getAccessToken,
    workspaceId: workspace.membership.workspaceId,
    projectId: record.id,
    documentId: record.currentDocumentId,
  });
  const read = await client.invoke("document.get", { projection: "full" });
  if (!read.success || read.data === undefined)
    throw new Error(read.errors[0]?.message ?? "Canonical project read failed.");
  // The MCP server computes this actor's permitted tool set from their workspace role
  // (packages/mcp-protocol/src/permissions.ts, enforced again server-side on every call in
  // apps/mcp-server/src/executor.ts). Studio never invents its own permission model here — it only
  // reads what the server already decided, so an unauthorized command fails fast with a clear
  // reason instead of round-tripping to be rejected. The server remains the actual security boundary:
  // every write below still goes through the same dry-run-then-commit path and is re-checked there.
  const capabilities = await client.discoverCapabilities();
  const enabledTools = new Set<string>(capabilities.enabledTools);
  const documentResult = DocumentReadOutputSchema.safeParse(read.data);
  if (!documentResult.success)
    throw new Error("The canonical project response is incompatible with this Studio release.");
  const canonicalResult = CanonicalDesignDocumentSchema.safeParse(documentResult.data);
  if (!canonicalResult.success) throw new Error("The canonical project is invalid and was not opened.");
  const document = canonicalResult.data;

  const execute = async (command: Command): Promise<void> => {
    if (!navigator.onLine) throw new Error("You are offline. Reconnect before changing the canonical document.");
    if (!isGatewayRoutable(command.type)) {
      const capability = findStudioCapability(command.type);
      if (capability?.status === "NOT_YET_AVAILABLE") {
        throw new Error(`Studio cannot remotely execute "${command.type}" yet: ${capability.unavailableReason}`);
      }
      throw new Error(`Studio cannot remotely execute "${command.type}": no MCP tool mapping exists for it yet.`);
    }
    // isGatewayRoutable already confirmed a documented, available capability exists for this
    // command type, so this lookup cannot miss its mcpTool field.
    const capability = findStudioCapability(command.type);
    if (capability?.status !== "AVAILABLE") throw new Error(`Studio cannot remotely execute "${command.type}".`);
    const mcpTool = capability.mcpTool;
    if (!enabledTools.has(mcpTool)) {
      throw new Error(`Your role does not have permission to execute "${command.type}" through MCP.`);
    }
    const payload = { ...command.payload, expectedDocumentVersion: command.expectedDocumentVersion };
    const writeClient = scopedClient({
      configuration,
      getAccessToken,
      workspaceId: workspace.membership.workspaceId,
      projectId: record.id,
      documentId: record.currentDocumentId,
      correlationId: command.correlationId,
    });
    const dryRun = await writeClient.invoke(mcpTool, payload, {
      dryRun: true,
      documentVersion: command.expectedDocumentVersion,
      idempotencyKey: `studio-dry-${command.id}`,
    });
    if (!dryRun.success) throw new Error(dryRun.errors[0]?.message ?? "Canonical dry run failed.");
    const applied = await writeClient.invoke(mcpTool, payload, {
      documentVersion: command.expectedDocumentVersion,
      idempotencyKey: `studio-${command.id}`,
    });
    if (!applied.success || applied.data === undefined)
      throw new Error(applied.errors[0]?.message ?? "Canonical write failed.");
    WriteToolOutputSchema.parse(applied.data);
  };
  // The actor's real permission set, derived the same way the command gateway above derives its
  // allowed-tool set: from what the server already decided in system.get_capabilities, not
  // invented client-side. Used by the real Agent Planner engine's own capability gate.
  const actorPermissions = [
    ...new Set(
      capabilities.tools.filter((tool) => enabledTools.has(tool.name)).flatMap((tool) => tool.requiredPermissions),
    ),
  ];
  const agentContext: StudioAgentContext = Object.freeze({
    createMcpClient: (correlationId: string) =>
      scopedClient({
        configuration,
        getAccessToken,
        workspaceId: workspace.membership.workspaceId,
        projectId: record.id,
        documentId: record.currentDocumentId,
        correlationId,
      }),
    actorPermissions,
    workspaceId: workspace.membership.workspaceId,
    projectId: record.id,
    documentId: record.currentDocumentId,
    actorId: bootstrap.actor.subject,
    approvalPolicy: configuration.agentApprovalPolicy,
  });
  return {
    project: {
      id: record.id,
      workspaceId: workspace.membership.workspaceId,
      name: record.name,
      description: "Canonical production project",
      tags: ["production"],
      createdAt: document.metadata.createdAt,
      updatedAt: record.updatedAt,
    },
    document,
    workspaceId: workspace.membership.workspaceId,
    accessToken: getAccessToken(),
    commandGateway: Object.freeze({ execute }),
    agentContext,
  };
}
