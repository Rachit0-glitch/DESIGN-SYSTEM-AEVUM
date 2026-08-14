import { createAgentMcpClient, createHttpMcpTransport } from "@aevum/agent-runtime/client";
import { CanonicalDesignDocumentSchema, type CanonicalDesignDocument } from "@aevum/document-model";
import { DocumentReadOutputSchema, WriteToolOutputSchema } from "@aevum/mcp-protocol";
import type { ProjectMetadata } from "@aevum/project-store";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { StudioAgentGateway } from "./agent.js";
import type { StudioCommandGateway } from "./session.js";
import type { Command } from "@aevum/command-engine";

const BrowserConfigurationSchema = z.strictObject({
  supabaseUrl: z.url().startsWith("https://"),
  supabaseAnonKey: z.string().min(20),
  apiUrl: z.url().startsWith("https://"),
  mcpUrl: z.url().startsWith("https://"),
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
  readonly agentGateway: StudioAgentGateway;
}

export function readStudioBrowserConfiguration(): StudioBrowserConfiguration {
  return BrowserConfigurationSchema.parse({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    apiUrl: import.meta.env.VITE_AEVUM_API_URL,
    mcpUrl: import.meta.env.VITE_AEVUM_MCP_URL,
  });
}

export function createStudioAuthClient(configuration: StudioBrowserConfiguration): SupabaseClient {
  return createClient(configuration.supabaseUrl, configuration.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

function scopedClient(input: {
  configuration: StudioBrowserConfiguration;
  session: Session;
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
    authorization: `Bearer ${input.session.access_token}`,
    correlationId: input.correlationId ?? `studio_${crypto.randomUUID()}`,
    timeoutMs: 15_000,
  });
}

export async function loadProductionStudioProject(
  configuration: StudioBrowserConfiguration,
  session: Session,
): Promise<ProductionStudioProject> {
  const bootstrapResponse = await fetch(new URL("/v1/bootstrap", configuration.apiUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
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
    session,
    workspaceId: workspace.membership.workspaceId,
    projectId: record.id,
    documentId: record.currentDocumentId,
  });
  const read = await client.invoke("document.get", { projection: "full" });
  if (!read.success || read.data === undefined)
    throw new Error(read.errors[0]?.message ?? "Canonical project read failed.");
  const documentResult = DocumentReadOutputSchema.safeParse(read.data);
  if (!documentResult.success)
    throw new Error("The canonical project response is incompatible with this Studio release.");
  const canonicalResult = CanonicalDesignDocumentSchema.safeParse(documentResult.data);
  if (!canonicalResult.success) throw new Error("The canonical project is invalid and was not opened.");
  const document = canonicalResult.data;

  const execute = async (command: Command): Promise<void> => {
    if (!navigator.onLine) throw new Error("You are offline. Reconnect before changing the canonical document.");
    if (!["node.update", "node.delete"].includes(command.type)) {
      throw new Error(`Studio cannot remotely execute ${command.type} through the current MCP contract.`);
    }
    const payload = { ...command.payload, expectedDocumentVersion: command.expectedDocumentVersion };
    const writeClient = scopedClient({
      configuration,
      session,
      workspaceId: workspace.membership.workspaceId,
      projectId: record.id,
      documentId: record.currentDocumentId,
      correlationId: command.correlationId,
    });
    const dryRun = await writeClient.invoke(command.type, payload, {
      dryRun: true,
      documentVersion: command.expectedDocumentVersion,
      idempotencyKey: `studio-dry-${command.id}`,
    });
    if (!dryRun.success) throw new Error(dryRun.errors[0]?.message ?? "Canonical dry run failed.");
    const applied = await writeClient.invoke(command.type, payload, {
      documentVersion: command.expectedDocumentVersion,
      idempotencyKey: `studio-${command.id}`,
    });
    if (!applied.success || applied.data === undefined)
      throw new Error(applied.errors[0]?.message ?? "Canonical write failed.");
    WriteToolOutputSchema.parse(applied.data);
  };
  const updateNode: StudioAgentGateway["updateNode"] = async (update) => {
    const writeClient = scopedClient({
      configuration,
      session,
      workspaceId: workspace.membership.workspaceId,
      projectId: record.id,
      documentId: record.currentDocumentId,
      correlationId: update.correlationId,
    });
    const payload = {
      nodeId: update.nodeId,
      changes: update.changes,
      expectedDocumentVersion: update.expectedDocumentVersion,
    };
    const dryRun = await writeClient.invoke("node.update", payload, {
      dryRun: true,
      idempotencyKey: `studio-ai-dry-${update.correlationId}`,
    });
    if (!dryRun.success) throw new Error(dryRun.errors[0]?.message ?? "Agent dry run failed.");
    const applied = await writeClient.invoke("node.update", payload, {
      idempotencyKey: `studio-ai-${update.correlationId}`,
    });
    if (!applied.success) throw new Error(applied.errors[0]?.message ?? "Agent update failed.");
    return {
      dryRunRequestId: dryRun.requestId,
      applyRequestId: applied.requestId,
      resultVersion: applied.documentVersion ?? update.expectedDocumentVersion + 1,
    };
  };
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
    accessToken: session.access_token,
    commandGateway: Object.freeze({ execute }),
    agentGateway: Object.freeze({ updateNode }),
  };
}
