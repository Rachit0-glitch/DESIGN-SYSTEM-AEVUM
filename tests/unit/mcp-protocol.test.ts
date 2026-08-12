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

  it("registers the canonical MCP through Phase 21 with dedicated schemas", () => {
    const registry = createToolRegistry();
    registerInitialTools(registry, mcpTestConfig);
    const tools = registry.listTools();

    expect(tools).toHaveLength(67);
    expect(tools.every((tool) => tool.version === MCP_TOOL_VERSION)).toBe(true);
    expect(tools.map((tool) => tool.name)).toEqual(Object.keys(TOOL_SCHEMAS).sort());
    expect(() => registerInitialTools(registry, mcpTestConfig)).toThrow(/already registered/);
  });

  it("rejects arbitrary Python, shell, and script fields from every Blender capability", () => {
    const attemptedPayloads = [
      ["blender.inspect_scene", { assetId: "asset_11111111-1111-4111-8111-111111111111", python: "import bpy" }],
      [
        "blender.update_object_transform",
        {
          assetId: "asset_11111111-1111-4111-8111-111111111111",
          targetId: "group_11111111-1111-4111-8111-111111111111",
          expectedDocumentVersion: 1,
          mode: "DELTA",
          coordinateSpace: "LOCAL",
          unit: "M",
          translation: { x: 0.02, y: 0, z: 0 },
          shell: "whoami",
        },
      ],
      [
        "blender.export_scene",
        {
          assetId: "asset_11111111-1111-4111-8111-111111111111",
          expectedDocumentVersion: 1,
          script: "bpy.ops.wm.quit_blender()",
        },
      ],
      [
        "three.pose_update",
        {
          assetId: "asset_11111111-1111-4111-8111-111111111111",
          targetId: "rig_11111111-1111-4111-8111-111111111111",
          expectedDocumentVersion: 1,
          boneKey: "arm",
          mode: "SET",
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          python: "import bpy",
        },
      ],
    ] as const;
    for (const [tool, payload] of attemptedPayloads) {
      expect(TOOL_SCHEMAS[tool].input.safeParse(payload).success).toBe(false);
    }
  });

  it("keeps professional camera writes bounded, versioned, and free of arbitrary execution fields", () => {
    const camera = {
      id: "camera_11111111-1111-4111-8111-111111111111",
      name: "Hero camera",
      projection: "PERSPECTIVE",
      transform: {
        position: { x: 0, y: 0, z: 5 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        skew: { x: 0, y: 0 },
        anchor: { x: 0, y: 0 },
        pivot: { x: 0, y: 0, z: 0 },
        opacity: 1,
        clipping: false,
        maskIds: [],
        coordinateSpace: "WORLD",
      },
      focalLength: 50,
      sensor: { width: 36, height: 24, fit: "VERTICAL" },
      nearClip: 0.1,
      farClip: 1_000,
      depthOfField: { enabled: false, aperture: 2.8, focusDistance: 5 },
    };
    const input = {
      assetId: "asset_11111111-1111-4111-8111-111111111111",
      expectedDocumentVersion: 3,
      sceneId: "scene_11111111-1111-4111-8111-111111111111",
      camera,
    };
    expect(TOOL_SCHEMAS["camera.update"].input.safeParse(input).success).toBe(true);
    expect(TOOL_SCHEMAS["camera.update"].input.safeParse({ ...input, python: "import bpy" }).success).toBe(false);
    expect(TOOL_SCHEMAS["camera.update"].input.safeParse({ ...input, expectedDocumentVersion: 0 }).success).toBe(false);
    expect(TOOL_SCHEMAS["camera.validate"].input.safeParse({ cameraId: camera.id, time: 1.25 }).success).toBe(true);
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
