import { MCP_PROTOCOL_VERSION, MCP_TOOL_VERSION, McpRequestEnvelopeSchema, TOOL_SCHEMAS } from "@aevum/mcp-protocol";
import { createToolRegistry, registerInitialTools } from "@aevum/mcp-server";
import { describe, expect, it } from "vitest";
import { MCP_TEST_WORKSPACE_ID, mcpTestConfig } from "../helpers/mcp-fixture.js";

const validRequest = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  requestId: "mcp_req_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: MCP_TEST_WORKSPACE_ID,
  tool: "system.get_capabilities",
  input: {},
};

describe("MCP protocol", () => {
  it("validates strict versioned envelopes and rejects secret-bearing metadata", () => {
    expect(McpRequestEnvelopeSchema.parse(validRequest)).toMatchObject({ dryRun: false });
    expect(McpRequestEnvelopeSchema.safeParse({ ...validRequest, protocolVersion: "2.0.0" }).success).toBe(false);
    expect(McpRequestEnvelopeSchema.safeParse({ ...validRequest, extra: true }).success).toBe(false);
    expect(
      McpRequestEnvelopeSchema.safeParse({
        ...validRequest,
        metadata: { authorizationToken: "must-not-enter-the-envelope" },
      }).success,
    ).toBe(false);
  });

  it("registers exactly the canonical Phase 12 tool surface with dedicated schemas", () => {
    const registry = createToolRegistry();
    registerInitialTools(registry, mcpTestConfig);
    const tools = registry.listTools();

    expect(tools).toHaveLength(12);
    expect(tools.every((tool) => tool.version === MCP_TOOL_VERSION)).toBe(true);
    expect(tools.map((tool) => tool.name)).toEqual(Object.keys(TOOL_SCHEMAS).sort());
    expect(() => registerInitialTools(registry, mcpTestConfig)).toThrow(/already registered/);
  });

  it("rejects unknown and structurally invalid write payloads before command execution", () => {
    expect(TOOL_SCHEMAS["document.rename"].input.safeParse({ name: "Missing version" }).success).toBe(false);
    expect(
      TOOL_SCHEMAS["node.update"].input.safeParse({
        expectedDocumentVersion: 1,
        nodeId: "text_invalid",
        changes: {},
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});
