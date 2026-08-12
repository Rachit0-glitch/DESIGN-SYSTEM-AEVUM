import { deepFreeze, deterministicAgentId, fingerprint, type AgentSession } from "@aevum/agent-core";
import type { AgentContextBundle } from "@aevum/agent-context";
import { AgentIntentSchema, type AgentIntent } from "./schemas.js";

function initialCapabilities(session: AgentSession): string[] {
  const goal = session.goal;
  if (goal.requiredCapabilities.length > 0) return [...goal.requiredCapabilities];
  if (goal.parameters.operation === "three_transform") {
    return ["three.inspect_asset", "three.inspect_scene", "document.get", "three.update_node_transform"];
  }
  if (goal.parameters.operation === "blender_transform") {
    return ["blender.inspect_scene", "blender.inspect_object", "document.get", "blender.update_object_transform"];
  }
  if (goal.parameters.operation === "blender_bevel") {
    return ["blender.inspect_scene", "three.inspect_topology", "document.get", "three.bevel_mesh"];
  }
  if (goal.parameters.operation === "blender_uv_repair") {
    return ["blender.inspect_scene", "three.inspect_uv", "document.get", "three.unwrap_uv"];
  }
  if (goal.parameters.operation === "multiview_reconstruct") {
    return ["three.multiview_analyze"];
  }
  if (goal.parameters.operation === "generate_reconstruction_candidate") {
    return ["three.multiview_analyze", "three.reconstruction_generate_candidate"];
  }
  if (goal.parameters.operation === "reconstruct_and_import") {
    return ["three.multiview_analyze", "three.reconstruction_generate_candidate", "document.get", "three.import_scene"];
  }
  const riggingCapabilities: Readonly<Record<string, readonly string[]>> = {
    rig_inspect: ["three.rig_inspect"],
    rig_create: ["document.get", "three.rig_create", "three.rig_inspect"],
    skin_bind: ["document.get", "three.skin_bind", "three.weight_inspect"],
    pose_update: ["document.get", "three.pose_update", "three.pose_inspect", "three.deformation_validate"],
    pose_reset: ["document.get", "three.pose_reset", "three.pose_inspect"],
    weight_update: ["document.get", "three.weight_inspect", "three.weight_update", "three.deformation_validate"],
    weight_normalize: ["document.get", "three.weight_inspect", "three.weight_normalize", "three.deformation_validate"],
    ik_update: ["document.get", "three.ik_update", "three.pose_inspect", "three.deformation_validate"],
    constraint_update: ["document.get", "three.constraint_update", "three.pose_inspect", "three.deformation_validate"],
    deformation_validate: ["three.deformation_validate"],
    retarget_pose: ["three.retarget"],
    rig_mechanical_workflow: [
      "three.rig_inspect",
      "document.get",
      "three.rig_create",
      "three.skin_bind",
      "three.pose_update",
      "three.deformation_validate",
    ],
    rig_humanoid_workflow: [
      "three.rig_inspect",
      "document.get",
      "three.rig_create",
      "three.skin_bind",
      "three.weight_inspect",
      "three.ik_update",
      "three.deformation_validate",
    ],
  };
  const rigging = riggingCapabilities[String(goal.parameters.operation ?? "").toLowerCase()];
  if (rigging) return [...rigging];
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
      const write = [
        "three.update_node_transform",
        "three.bevel_mesh",
        "three.unwrap_uv",
        "three.update_pbr_material",
        "three.reconstruction_generate_candidate",
        "three.import_scene",
        "three.rig_create",
        "three.skin_bind",
        "three.pose_update",
        "three.pose_reset",
        "three.weight_update",
        "three.weight_normalize",
        "three.ik_update",
        "three.constraint_update",
      ].includes(capability);
      permissions.add(write ? "three.write" : "three.read");
      if (write) permissions.add("document.write");
      if (
        capability === "three.multiview_analyze" ||
        capability === "three.reconstruction_generate_candidate" ||
        capability === "three.import_scene"
      ) {
        permissions.add("asset.read");
      }
      if (capability === "three.reconstruction_generate_candidate") permissions.add("asset.write");
      if (capability.startsWith("three.inspect_") || capability.startsWith("three.validate_")) {
        permissions.add("blender.read");
      }
      if (
        [
          "three.bevel_mesh",
          "three.unwrap_uv",
          "three.update_pbr_material",
          "three.rig_create",
          "three.skin_bind",
          "three.pose_update",
          "three.pose_reset",
          "three.weight_update",
          "three.weight_normalize",
          "three.ik_update",
          "three.constraint_update",
        ].includes(capability)
      ) {
        permissions.add("blender.write");
      }
    }
    if (capability.startsWith("blender.")) {
      const write = capability.startsWith("blender.update_") || capability === "blender.duplicate_object";
      permissions.add(
        write ? "blender.write" : capability === "blender.export_scene" ? "blender.export" : "blender.read",
      );
      if (write || capability === "blender.export_scene") permissions.add("document.write");
      if (capability === "blender.delete_object") permissions.add("blender.destructive");
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
