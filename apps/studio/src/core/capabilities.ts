import type { Command } from "@aevum/command-engine";
import type { McpToolName } from "@aevum/mcp-protocol";

/**
 * How much a capability could disturb existing state if misused — informational only. Studio's
 * command gateway does not gate on this today (that's an approval-UX concern, deliberately left
 * for a later block); it exists so the registry is a complete, honest capability map rather than a
 * bare allow/deny list, matching what MCP tool descriptors already distinguish server-side
 * (destructive Blender operations require a separate `blender.destructive` permission).
 */
export type StudioCapabilityClassification = "READ_ONLY" | "SAFE_WRITE" | "DESTRUCTIVE_WRITE";

interface StudioCapabilityBase {
  /** The Command Engine command type this capability corresponds to, when it has one. Several real
   * MCP tools (reconstruction.import_reference, document.get) orchestrate multi-command
   * transactions or are pure reads, so they have no single Command Engine equivalent. */
  readonly commandType?: Command["type"];
  readonly studioUseCase: string;
}

export interface AvailableStudioCapability extends StudioCapabilityBase {
  readonly status: "AVAILABLE";
  readonly mcpTool: McpToolName;
  readonly supportsDryRun: boolean;
  readonly classification: StudioCapabilityClassification;
}

export interface UnavailableStudioCapability extends StudioCapabilityBase {
  readonly status: "NOT_YET_AVAILABLE";
  /** Why this capability can't be offered yet — e.g. no MCP tool exists for it. Never fabricate a
   * `mcpTool` value for one of these; an unavailable capability has none by definition. */
  readonly unavailableReason: string;
}

export type StudioCapability = AvailableStudioCapability | UnavailableStudioCapability;

/**
 * The complete, honest map of what Studio can — and cannot yet — do through MCP. Replaces the
 * previous bare `Set` of 4 command types: that set only ever recorded *that* something was allowed,
 * not *why*, *how* (which MCP tool, whether the payload shapes actually match), or what else was
 * considered and rejected. This is the single source of truth for that decision.
 *
 * Two real constraints govern which commands can be routed through the generic, Command-shaped
 * gateway (`StudioCommandGateway.execute`, see production.ts): (1) a matching MCP tool with that
 * exact name must exist, and (2) that tool's input schema must exactly match the Command Engine
 * payload shape, since the gateway forwards `command.payload` unchanged. Capabilities that fail
 * either test are still documented here (so the map stays complete) but are invoked directly by
 * their own call sites with tool-specific payloads instead — `status: "AVAILABLE"` with no
 * `commandType` means exactly that.
 *
 * Do not add speculative entries. Only capabilities Studio's actual UI exercises today are listed;
 * a real MCP tool existing is necessary but not sufficient (e.g. camera.update/camera.create exist
 * server-side but Studio has no camera-editing UI, so they are deliberately absent).
 */
export const STUDIO_CAPABILITIES: readonly StudioCapability[] = [
  {
    status: "AVAILABLE",
    mcpTool: "node.create",
    commandType: "node.create",
    supportsDryRun: true,
    classification: "SAFE_WRITE",
    studioUseCase: "Create a new canvas node (shape, text, frame) from the Studio editor.",
  },
  {
    status: "AVAILABLE",
    mcpTool: "node.update",
    commandType: "node.update",
    supportsDryRun: true,
    classification: "SAFE_WRITE",
    studioUseCase: "Edit node properties (position, size, style, content) from the Studio editor.",
  },
  {
    status: "AVAILABLE",
    mcpTool: "node.delete",
    commandType: "node.delete",
    supportsDryRun: true,
    classification: "DESTRUCTIVE_WRITE",
    studioUseCase: "Delete a node from the canvas or layers panel.",
  },
  {
    status: "AVAILABLE",
    mcpTool: "document.rename",
    commandType: "document.rename",
    supportsDryRun: true,
    classification: "SAFE_WRITE",
    studioUseCase: "Rename the open project/document.",
  },
  {
    status: "AVAILABLE",
    mcpTool: "asset.register",
    supportsDryRun: true,
    classification: "SAFE_WRITE",
    studioUseCase:
      "Upload and register a reference image asset from the References panel's import flow. Its Command Engine payload ({ asset: Asset }) does not match this tool's upload-shaped input ({ bytesBase64, mimeType, ... }), so it is invoked directly with tool-specific input rather than through the generic command-shaped gateway.",
  },
  {
    status: "AVAILABLE",
    mcpTool: "reconstruction.import_reference",
    supportsDryRun: true,
    classification: "SAFE_WRITE",
    studioUseCase:
      "Turn a registered reference image into real, editable canonical nodes (References panel import flow, step 2). Orchestrates a multi-command server-side transaction, so it has no single Command Engine equivalent to route through the generic gateway.",
  },
  {
    status: "AVAILABLE",
    mcpTool: "document.get",
    supportsDryRun: false,
    classification: "READ_ONLY",
    studioUseCase:
      "Read the canonical document: initial project load, and resyncing after a multi-command server-side transaction (e.g. reconstruction import) whose exact command list isn't returned to the caller for a local replay.",
  },
  {
    status: "NOT_YET_AVAILABLE",
    commandType: "token.register",
    studioUseCase: "Register a design token (color, gradient, typography) created or edited in Studio.",
    unavailableReason:
      "No MCP tool exists for token.register yet — only the Command Engine schema does (packages/command-engine/src/schemas.ts). Adding one is a backend change, out of scope for this gateway refactor.",
  },
];

/** Looks up the capability, if any, documented for a given Command Engine command type. */
export function findStudioCapability(commandType: Command["type"]): StudioCapability | undefined {
  return STUDIO_CAPABILITIES.find((capability) => capability.commandType === commandType);
}

/**
 * Whether a Command-shaped value can be routed through the generic
 * `StudioCommandGateway.execute(command)` path — true only for a documented, available capability
 * whose payload shape is verified to match its MCP tool's input exactly (see the module doc above).
 * A capability that's `AVAILABLE` but invoked directly elsewhere (asset.register,
 * reconstruction.import_reference, document.get) correctly returns false here, same as an
 * undocumented or `NOT_YET_AVAILABLE` command type.
 */
export function isGatewayRoutable(commandType: Command["type"]): boolean {
  const capability = findStudioCapability(commandType);
  return capability?.status === "AVAILABLE" && capability.mcpTool === commandType;
}
