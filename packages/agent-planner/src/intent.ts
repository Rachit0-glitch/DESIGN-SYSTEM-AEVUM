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
  const lightingCapabilities: Readonly<Record<string, readonly string[]>> = {
    lighting_analyze_reference: ["lighting.analyze_reference"],
    lighting_inspect: ["lighting.inspect"],
    lighting_resolve_profile: ["lighting.resolve_profile"],
    lighting_validate: ["lighting.validate"],
    lighting_create_rig: [
      "lighting.inspect",
      "document.get",
      "lighting.create_rig",
      "lighting.resolve_profile",
      "lighting.validate",
    ],
    lighting_match_reference: [
      "lighting.analyze_reference",
      "lighting.inspect",
      "document.get",
      "lighting.create_rig",
      "lighting.resolve_profile",
      "lighting.validate",
    ],
    lighting_bake: ["document.get", "lighting.bake"],
  };
  const lighting = lightingCapabilities[String(goal.parameters.operation ?? "").toLowerCase()];
  if (lighting) return [...lighting];
  const cameraCapabilities: Readonly<Record<string, readonly string[]>> = {
    camera_inspect: ["camera.inspect"],
    camera_evaluate: ["camera.evaluate"],
    camera_validate: ["camera.validate"],
    cinematic_inspect: ["cinematic.inspect"],
    camera_create: ["document.get", "camera.create", "camera.inspect", "camera.validate"],
    camera_update: ["camera.inspect", "document.get", "camera.update", "camera.evaluate", "camera.validate"],
    camera_match_reference: ["camera.inspect", "document.get", "camera.update", "camera.evaluate", "camera.validate"],
    camera_frame_subject: ["camera.inspect", "document.get", "camera.update", "camera.evaluate", "camera.validate"],
    cinematic_apply_sequence: [
      "cinematic.inspect",
      "document.get",
      "cinematic.apply_sequence",
      "cinematic.inspect",
      "camera.validate",
    ],
    camera_orbit: ["document.get", "cinematic.apply_sequence", "cinematic.inspect", "camera.validate"],
    camera_dolly: ["document.get", "cinematic.apply_sequence", "cinematic.inspect", "camera.validate"],
    camera_zoom: ["document.get", "cinematic.apply_sequence", "cinematic.inspect", "camera.validate"],
  };
  const camera = cameraCapabilities[String(goal.parameters.operation ?? "").toLowerCase()];
  if (camera) return [...camera];
  const fidelityCapabilities: Readonly<Record<string, readonly string[]>> = {
    fidelity_inspect: ["fidelity.inspect"],
    fidelity_validate: ["fidelity.validate_report"],
    fidelity_compare: ["fidelity.inspect", "fidelity.validate_report"],
    fidelity_propose_corrections: ["fidelity.validate_report", "fidelity.propose_corrections"],
    fidelity_improve: [
      "fidelity.inspect",
      "fidelity.validate_report",
      "fidelity.propose_corrections",
      "document.get",
      "fidelity.apply_correction",
      "fidelity.inspect",
    ],
    fidelity_fix_typography: [
      "fidelity.inspect",
      "fidelity.validate_report",
      "fidelity.propose_corrections",
      "document.get",
      "fidelity.apply_correction",
      "fidelity.inspect",
    ],
    fidelity_match_layout: [
      "fidelity.inspect",
      "fidelity.validate_report",
      "fidelity.propose_corrections",
      "document.get",
      "fidelity.apply_correction",
      "fidelity.inspect",
    ],
    fidelity_correct_crop: [
      "fidelity.inspect",
      "fidelity.validate_report",
      "fidelity.propose_corrections",
      "document.get",
      "fidelity.apply_correction",
      "fidelity.inspect",
    ],
    fidelity_validate_responsive: ["fidelity.inspect", "fidelity.validate_report"],
    fidelity_maximum_pass: [
      "fidelity.inspect",
      "fidelity.validate_report",
      "fidelity.propose_corrections",
      "document.get",
      "fidelity.apply_correction",
      "fidelity.inspect",
    ],
  };
  const fidelity = fidelityCapabilities[String(goal.parameters.operation ?? "").toLowerCase()];
  if (fidelity) return [...fidelity];
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
      if (goal.targetNodeIds.length === 0) {
        return ["project.get", "document.get_version", "document.rename", "document.get"];
      }
      return goal.parameters.operation === "delete" ? ["document.get", "node.delete"] : ["document.get", "node.update"];
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
    if (capability.startsWith("lighting.")) {
      const write = capability === "lighting.create_rig" || capability === "lighting.bake";
      permissions.add(write ? "lighting.write" : "lighting.read");
      permissions.add("blender.read");
      if (write) {
        permissions.add("document.write");
        permissions.add("blender.write");
      }
      if (capability === "lighting.bake") permissions.add("asset.write");
    }
    if (capability.startsWith("camera.") || capability.startsWith("cinematic.")) {
      const write = ["camera.create", "camera.update", "cinematic.apply_sequence"].includes(capability);
      permissions.add(write ? "camera.write" : "camera.read");
      permissions.add("document.read");
      if (capability === "camera.validate") permissions.add("validation.read");
      if (capability.startsWith("cinematic.")) permissions.add(write ? "timeline.write" : "timeline.read");
      if (write) {
        permissions.add("document.write");
        permissions.add("blender.write");
      }
    }
    if (capability.startsWith("validation.")) permissions.add("validation.read");
    if (capability.startsWith("correction.")) permissions.add("correction.read");
    if (capability.startsWith("fidelity.")) {
      const write = capability === "fidelity.apply_correction";
      permissions.add(write ? "fidelity.write" : "fidelity.read");
      permissions.add(write ? "document.write" : "document.read");
      permissions.add("validation.read");
      if (write || capability === "fidelity.propose_corrections") permissions.add("correction.read");
    }
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
