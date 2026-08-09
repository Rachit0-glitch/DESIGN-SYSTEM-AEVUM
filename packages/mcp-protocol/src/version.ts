import { z } from "zod";

export const MCP_PROTOCOL_NAME = "aevum-mcp" as const;
export const MCP_PROTOCOL_VERSION = "1.0.0" as const;
export const MCP_MINIMUM_CLIENT_VERSION = "1.0.0" as const;

export const McpProtocolVersionSchema = z.strictObject({
  protocol: z.literal(MCP_PROTOCOL_NAME),
  version: z.literal(MCP_PROTOCOL_VERSION),
  minimumCompatibleClientVersion: z.literal(MCP_MINIMUM_CLIENT_VERSION),
});

export const MCP_PROTOCOL = Object.freeze({
  protocol: MCP_PROTOCOL_NAME,
  version: MCP_PROTOCOL_VERSION,
  minimumCompatibleClientVersion: MCP_MINIMUM_CLIENT_VERSION,
});

export type McpProtocolVersion = z.infer<typeof McpProtocolVersionSchema>;
