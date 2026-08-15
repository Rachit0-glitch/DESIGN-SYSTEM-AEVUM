import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_COMMAND_VERSION, type Command } from "@aevum/command-engine";
import { CURRENT_SCHEMA_VERSION } from "@aevum/document-model";
import { MCP_PROTOCOL_VERSION } from "@aevum/mcp-protocol";
import { createStudioProjectFixture } from "@aevum/studio";
import { loadProductionStudioProject, type StudioBrowserConfiguration } from "../../apps/studio/src/core/production.js";

/**
 * apps/studio/src/core/production.ts is intentionally not re-exported from the @aevum/studio
 * package surface (index.ts documents "mustNotOwn: ... MCP authorization" for the reusable
 * package), so this test imports it directly by relative path.
 */

const configuration: StudioBrowserConfiguration = {
  supabaseUrl: "https://auth.example.test",
  supabaseAnonKey: "anon-key-anon-key-anon-key-anon-key",
  apiUrl: "https://api.example.test",
  mcpUrl: "https://mcp.example.test",
};

function makeSession(accessToken: string) {
  return { access_token: accessToken, user: { id: "user-1" } } as unknown as Parameters<
    typeof loadProductionStudioProject
  >[1];
}

const WORKSPACE_ID = "workspace_11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "project_22222222-2222-4222-8222-222222222222";
const DOCUMENT_ID = "doc_33333333-3333-4333-8333-333333333333";

function bootstrapBody() {
  return {
    actor: { subject: "user-1" },
    workspaces: [
      {
        membership: {
          workspaceId: WORKSPACE_ID,
          actorSubject: "user-1",
          role: "EDITOR",
          permissions: [],
          projectIds: [PROJECT_ID],
          status: "ACTIVE",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        projects: [
          {
            id: PROJECT_ID,
            workspaceId: WORKSPACE_ID,
            name: "Test project",
            status: "ACTIVE",
            currentDocumentId: DOCUMENT_ID,
            currentDocumentVersion: 1,
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
    ],
  };
}

function successEnvelope(tool: string, data: unknown) {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    success: true,
    requestId: `mcp_req_${crypto.randomUUID()}`,
    tool,
    data,
    warnings: [],
    errors: [],
    durationMs: 1,
  };
}

function capabilitiesData(enabledTools: string[]) {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    tools: [],
    enabledTools,
    supportedSchemaVersion: CURRENT_SCHEMA_VERSION,
    supportedCommandVersion: CURRENT_COMMAND_VERSION,
    authMode: "supabase" as const,
    dryRunSupport: true,
    transactionSupport: true,
    limits: {
      requestBodyBytes: 1_000_000,
      toolInputBytes: 500_000,
      responseBytes: 1_000_000,
      metadataBytes: 10_000,
      batchSize: 256,
      nodePayloadBytes: 100_000,
      auditPayloadBytes: 100_000,
    },
    deploymentVersion: "test",
    environment: "test" as const,
  };
}

function writeOutput(baseVersion: number) {
  return {
    dryRun: false,
    baseVersion,
    resultVersion: baseVersion + 1,
    transactionId: "tx_test",
    commandIds: ["cmd_test"],
    changeSet: {
      added: [],
      removed: [],
      updated: [],
      moved: [],
      metadata: {
        commandIds: ["cmd_test"],
        transactionId: "tx_test",
        fromVersion: baseVersion,
        toVersion: baseVersion + 1,
      },
    },
  };
}

function testCommand(overrides: Partial<Command> & { type: Command["type"]; payload: Command["payload"] }): Command {
  return {
    id: "cmd_1",
    commandVersion: CURRENT_COMMAND_VERSION,
    documentId: DOCUMENT_ID,
    expectedDocumentVersion: 1,
    timestamp: new Date().toISOString(),
    actor: { id: "studio-user", type: "USER", displayName: "You" },
    correlationId: "corr_1",
    transactionId: "tx_1",
    ...overrides,
  } as Command;
}

function stubTransport(input: {
  fixtureDocument: unknown;
  enabledTools: string[];
  handleWrite?: (tool: string, dryRun: boolean) => unknown;
}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (requestInput: RequestInfo | URL, init?: RequestInit) => {
    const url = requestInput.toString();
    if (url.endsWith("/v1/bootstrap")) return new Response(JSON.stringify(bootstrapBody()), { status: 200 });
    if (url.endsWith("/mcp")) {
      const body = JSON.parse(String(init?.body)) as { tool: string; dryRun?: boolean };
      calls.push(body.tool);
      if (body.tool === "document.get")
        return new Response(JSON.stringify(successEnvelope(body.tool, input.fixtureDocument)));
      if (body.tool === "system.get_capabilities")
        return new Response(JSON.stringify(successEnvelope(body.tool, capabilitiesData(input.enabledTools))));
      if (input.handleWrite) {
        const data = input.handleWrite(body.tool, Boolean(body.dryRun));
        return new Response(JSON.stringify(successEnvelope(body.tool, data)));
      }
      throw new Error(`Unexpected MCP tool invoked in this test: ${body.tool}`);
    }
    throw new Error(`Unexpected fetch URL in this test: ${url}`);
  });
  return { fetchMock, calls };
}

describe("Studio production MCP command gateway", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    // production.ts checks navigator.onLine before every remote command; Node's test
    // environment has no meaningful network state, so this test stands in for "online".
    vi.stubGlobal("navigator", { onLine: true });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects a command type with no verified MCP tool mapping before any write attempt", async () => {
    const fixture = createStudioProjectFixture();
    const { fetchMock, calls } = stubTransport({
      fixtureDocument: fixture.document,
      enabledTools: ["node.update", "node.create"],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const project = await loadProductionStudioProject(configuration, makeSession("token-1"));
    const command = testCommand({ type: "node.move", payload: { nodeId: "irrelevant", index: 0 } });

    await expect(project.commandGateway.execute(command)).rejects.toThrow(/no MCP tool mapping/i);
    expect(calls).toEqual(["document.get", "system.get_capabilities"]);
  });

  it("rejects a mapped command the actor's role is not permitted to run, without bypassing MCP", async () => {
    const fixture = createStudioProjectFixture();
    const { fetchMock, calls } = stubTransport({ fixtureDocument: fixture.document, enabledTools: ["node.update"] });
    global.fetch = fetchMock as unknown as typeof fetch;

    const project = await loadProductionStudioProject(configuration, makeSession("token-1"));
    const command = testCommand({
      type: "node.create",
      payload: { node: fixture.document.nodes[fixture.document.rootNodeIds[0] ?? ""] ?? {} },
    });

    await expect(project.commandGateway.execute(command)).rejects.toThrow(/does not have permission/i);
    expect(calls).toEqual(["document.get", "system.get_capabilities"]);
  });

  it("dry-runs then commits a mapped, permitted command through MCP", async () => {
    const fixture = createStudioProjectFixture();
    const { fetchMock, calls } = stubTransport({
      fixtureDocument: fixture.document,
      enabledTools: ["node.update"],
      handleWrite: (_tool, dryRun) => writeOutput(dryRun ? 1 : 1),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const project = await loadProductionStudioProject(configuration, makeSession("token-1"));
    const command = testCommand({ type: "node.update", payload: { nodeId: "heading", changes: { name: "Renamed" } } });

    await expect(project.commandGateway.execute(command)).resolves.toBeUndefined();
    expect(calls).toEqual(["document.get", "system.get_capabilities", "node.update", "node.update"]);
  });

  it("uses the latest access token for MCP calls after a background token refresh, without re-bootstrapping", async () => {
    const fixture = createStudioProjectFixture();
    const seenTokens: string[] = [];
    const fetchMock = vi.fn(async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      const url = requestInput.toString();
      const authorization = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (authorization) seenTokens.push(authorization);
      if (url.endsWith("/v1/bootstrap")) return new Response(JSON.stringify(bootstrapBody()), { status: 200 });
      const body = JSON.parse(String(init?.body)) as { tool: string; dryRun?: boolean };
      if (body.tool === "document.get")
        return new Response(JSON.stringify(successEnvelope(body.tool, fixture.document)));
      if (body.tool === "system.get_capabilities")
        return new Response(JSON.stringify(successEnvelope(body.tool, capabilitiesData(["node.update"]))));
      return new Response(JSON.stringify(successEnvelope(body.tool, writeOutput(1))));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    let currentToken = "token-initial";
    const project = await loadProductionStudioProject(configuration, makeSession(currentToken), () => currentToken);
    currentToken = "token-refreshed";
    const command = testCommand({ type: "node.update", payload: { nodeId: "heading", changes: { name: "Renamed" } } });
    await project.commandGateway.execute(command);

    expect(seenTokens.some((header) => header.includes("token-refreshed"))).toBe(true);
  });
});
