import { deepFreeze, deterministicAgentId, fingerprint, type AgentSession } from "@aevum/agent-core";
import type { AgentContextBundle } from "@aevum/agent-context";
import { AgentIntentSchema, type AgentIntent } from "./schemas.js";

function initialCapabilities(session: AgentSession): string[] {
  const goal = session.goal;
  if (goal.requiredCapabilities.length > 0) return [...goal.requiredCapabilities];
  if (goal.parameters.operation === "three_transform") {
    return ["three.inspect_asset", "three.inspect_scene", "document.get", "three.update_node_transform"];
  }
  switch (goal.category) {
    case "INSPECT":
      return ["project.get", "document.inspect_hierarchy"];
    case "EDIT":
      return goal.targetNodeIds.length > 0
        ? ["document.get", "node.update"]
        : ["project.get", "document.get_version", "document.rename", "document.get"];
    case "CREATE":
      return ["document.get", "node.create"];
    case "RECONSTRUCT":
      return ["reconstruction.execute"];
    case "VALIDATE":
      return ["validation.execute"];
    case "CORRECT":
      return ["correction.execute"];
    case "RESPONSIVE":
      return ["responsive.reconstruct"];
    case "ANIMATION":
      return ["timeline.create"];
    case "MOTION":
      return ["motion.reconstruct"];
    case "ASSET":
      return ["asset.get"];
    case "PROJECT":
      return ["project.get"];
    default:
      return [];
  }
}

function requiredPermissions(capabilities: readonly string[]): AgentIntent["requiredPermissions"] {
  const permissions = new Set<AgentIntent["requiredPermissions"][number]>(["mcp.tool.execute"]);
  for (const capability of capabilities) {
    if (capability.startsWith("project."))
      permissions.add(capability === "project.get" ? "project.read" : "project.write");
    if (capability.startsWith("document.") || capability.startsWith("node.")) {
      permissions.add(
        ["document.rename", "node.create", "node.update", "node.delete"].includes(capability)
          ? "document.write"
          : "document.read",
      );
    }
    if (capability.startsWith("asset.")) permissions.add(capability === "asset.get" ? "asset.read" : "asset.write");
    if (capability.startsWith("timeline."))
      permissions.add(capability === "timeline.get" ? "timeline.read" : "timeline.write");
    if (capability.startsWith("three.")) {
      permissions.add(capability === "three.update_node_transform" ? "three.write" : "three.read");
      if (capability === "three.update_node_transform") permissions.add("document.write");
    }
    if (capability.startsWith("validation.")) permissions.add("validation.read");
    if (capability.startsWith("correction.")) permissions.add("correction.read");
  }
  return [...permissions].sort();
}

export function analyzeIntent(session: AgentSession, context: AgentContextBundle): AgentIntent {
  const capabilities = initialCapabilities(session);
  const ambiguities: string[] = [];
  if (["EDIT", "CREATE"].includes(session.goal.category) && !session.projectId)
    ambiguities.push("Target project is missing.");
  if (session.goal.category === "EDIT" && session.goal.targetNodeIds.length === 0 && !session.goal.parameters.name) {
    ambiguities.push("Edit target is not explicit.");
  }
  if (session.goal.category === "CREATE" && !session.goal.parameters.node) {
    ambiguities.push("Canonical node payload is required for deterministic node creation.");
  }
  const content = {
    version: "1.0.0" as const,
    goalId: session.goal.id,
    category: session.goal.category,
    ...(session.projectId ? { targetProjectId: session.projectId } : {}),
    ...(session.documentId ? { targetDocumentId: session.documentId } : {}),
    targetNodeIds: [...session.goal.targetNodeIds],
    requestedOutcome: session.goal.requestedOutcome,
    constraints: [
      ...(session.constraints.preserveHierarchy ? ["PRESERVE_HIERARCHY"] : []),
      ...(session.constraints.allowDestructiveOperations ? [] : ["NO_UNAPPROVED_DESTRUCTIVE_OPERATIONS"]),
      ...context.context.preservedConstraintIds,
    ],
    protectedProperties: [...session.constraints.protectedProperties],
    requiredCapabilities: capabilities,
    requiredPermissions: requiredPermissions(capabilities),
    ambiguities,
    confidence: ambiguities.length === 0 ? session.goal.confidence : Math.min(session.goal.confidence, 0.5),
    parameters: session.goal.parameters,
  };
  return deepFreeze(
    AgentIntentSchema.parse({
      ...content,
      id: deterministicAgentId("agent-intent", content),
      fingerprint: fingerprint(content),
    }),
  );
}
