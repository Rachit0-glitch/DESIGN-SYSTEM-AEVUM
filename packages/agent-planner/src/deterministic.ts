import type { AgentContextBundle } from "@aevum/agent-context";
import {
  createVerificationResult,
  deepFreeze,
  deterministicAgentId,
  fingerprint,
  type AgentApprovalPolicy,
  type AgentSession,
} from "@aevum/agent-core";
import type { McpToolDescriptor } from "@aevum/mcp-protocol";
import { analyzeIntent } from "./intent.js";
import type { AgentReasoningProvider } from "./provider.js";
import { classifyTool, requiresApproval } from "./safety.js";
import {
  AgentCapabilitiesSchema,
  AgentPlanSchema,
  type AgentCapabilities,
  type AgentCapabilityGap,
  type AgentIntent,
  type AgentPlan,
  type AgentPlanStep,
  type AgentPlanStepType,
} from "./schemas.js";

const retryPolicy = {
  maxAttempts: 3,
  backoffMs: 0,
  retryOn: ["NETWORK", "TIMEOUT", "RATE_LIMIT", "TEMPORARY_DEPENDENCY"] as const,
};

function step(input: {
  readonly goalId: string;
  readonly index: number;
  readonly type: AgentPlanStepType;
  readonly label: string;
  readonly tool?: string;
  readonly descriptor?: McpToolDescriptor | undefined;
  readonly dependencies?: readonly string[];
  readonly data?: unknown;
  readonly bindings?: AgentPlanStep["inputBindings"];
  readonly expected?: AgentPlanStep["expectedObservation"];
  readonly failurePolicy?: AgentPlanStep["failurePolicy"];
  readonly approvalPolicy: AgentApprovalPolicy;
  readonly verification?: AgentPlanStep["verificationRequirement"];
}): AgentPlanStep {
  const id = deterministicAgentId("agent-step", {
    goalId: input.goalId,
    index: input.index,
    type: input.type,
    tool: input.tool,
  });
  const safety = input.descriptor ? classifyTool(input.descriptor) : "READ_ONLY";
  return {
    id,
    type: input.type,
    label: input.label,
    ...(input.tool ? { tool: input.tool } : {}),
    dependencies: [...(input.dependencies ?? [])],
    input: (input.data ?? {}) as never,
    inputBindings: [...(input.bindings ?? [])],
    expectedObservation: input.expected ?? { operator: "SUCCESS" },
    retryPolicy: { ...retryPolicy, retryOn: [...retryPolicy.retryOn] },
    failurePolicy: input.failurePolicy ?? "FAIL",
    verificationRequirement: input.verification ?? { required: false, strategy: "STATE_ASSERTION", assertions: [] },
    safety,
    requiresApproval: requiresApproval(input.approvalPolicy, safety),
  };
}

function findDescriptor(capabilities: AgentCapabilities, name: string): McpToolDescriptor | undefined {
  return capabilities.tools.find((tool) => tool.name === name && tool.enabled);
}

function riggingPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const operation = String(intent.parameters.operation ?? "").toLowerCase();
  const workflow = operation === "rig_mechanical_workflow" || operation === "rig_humanoid_workflow";
  const toolOrder = workflow
    ? operation === "rig_humanoid_workflow"
      ? [
          "three.rig_inspect",
          "document.get",
          "three.rig_create",
          "three.skin_bind",
          "three.weight_inspect",
          "three.ik_update",
          "three.deformation_validate",
        ]
      : [
          "three.rig_inspect",
          "document.get",
          "three.rig_create",
          "three.skin_bind",
          "three.pose_update",
          "three.deformation_validate",
        ]
    : intent.requiredCapabilities;
  const steps: AgentPlanStep[] = [];
  let dependency: string | undefined;
  for (const [index, tool] of toolOrder.entries()) {
    const descriptor = findDescriptor(capabilities, tool);
    const isWrite = descriptor?.classification === "WRITE";
    if (isWrite) {
      const dry = step({
        goalId: intent.goalId,
        index: steps.length,
        type: "DRY_RUN",
        label: `Dry-run ${tool}`,
        tool,
        descriptor,
        dependencies: dependency ? [dependency] : [],
        data: intent.parameters,
        approvalPolicy: policy,
      });
      steps.push(dry);
      dependency = dry.id;
    }
    const action = step({
      goalId: intent.goalId,
      index: steps.length,
      type: isWrite ? "WRITE" : index === toolOrder.length - 1 ? "VALIDATE" : "INSPECT",
      label: `${isWrite ? "Execute" : "Observe"} ${tool}`,
      tool,
      descriptor,
      dependencies: dependency ? [dependency] : [],
      data: intent.parameters,
      failurePolicy: isWrite ? "REPLAN" : "FAIL",
      approvalPolicy: policy,
    });
    steps.push(action);
    dependency = action.id;
  }
  steps.push(
    step({
      goalId: intent.goalId,
      index: steps.length,
      type: "VERIFY",
      label: "Verify rigging workflow once",
      dependencies: dependency ? [dependency] : [],
      approvalPolicy: policy,
      verification: {
        required: true,
        strategy: "STATE_ASSERTION",
        assertions: dependency ? [{ sourceStepId: dependency, operator: "SUCCESS" }] : [],
      },
    }),
  );
  return steps;
}

function capabilityGaps(intent: AgentIntent, capabilities: AgentCapabilities): AgentCapabilityGap[] {
  const available = new Set<string>(capabilities.tools.filter((tool) => tool.enabled).map((tool) => tool.name));
  const actorPermissions = new Set(capabilities.actorPermissions);
  const permissionDenied = intent.requiredPermissions.some((permission) => !actorPermissions.has(permission));
  return intent.requiredCapabilities
    .filter((capability) => !available.has(capability))
    .map((capability) => ({
      capability,
      reason: permissionDenied ? ("PERMISSION_DENIED" as const) : ("UNAVAILABLE" as const),
      requiredPhaseOrTool: capability,
      canPartiallyProceed: intent.category === "INSPECT",
      suggestedAction: permissionDenied
        ? "Request the missing actor permission; the agent cannot elevate itself."
        : `Expose ${capability} through the versioned MCP capability registry before execution.`,
    }));
}

function lightingPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const operation = String(intent.parameters.operation ?? "").toLowerCase();
  const steps: AgentPlanStep[] = [];
  let dependency: string | undefined;
  let documentRead: AgentPlanStep | undefined;
  const appendRead = (tool: string, type: AgentPlanStepType, label: string, data: unknown) => {
    const current = step({
      goalId: intent.goalId,
      index: steps.length,
      type,
      label,
      tool,
      descriptor: findDescriptor(capabilities, tool),
      dependencies: dependency ? [dependency] : [],
      data,
      approvalPolicy: policy,
    });
    steps.push(current);
    dependency = current.id;
    return current;
  };

  if (operation === "lighting_analyze_reference") {
    appendRead(
      "lighting.analyze_reference",
      "ANALYZE",
      "Analyze reference lighting",
      intent.parameters.reference ?? intent.parameters,
    );
  } else if (operation === "lighting_inspect") {
    appendRead("lighting.inspect", "INSPECT", "Inspect Blender lighting state", { assetId: intent.parameters.assetId });
  } else if (operation === "lighting_resolve_profile") {
    appendRead("lighting.resolve_profile", "READ", "Resolve canonical lighting profile", intent.parameters);
  } else if (operation === "lighting_validate") {
    appendRead(
      "lighting.validate",
      "VALIDATE",
      "Validate lighting quality independently from materials",
      intent.parameters,
    );
  } else {
    if (operation === "lighting_match_reference") {
      appendRead(
        "lighting.analyze_reference",
        "ANALYZE",
        "Analyze bounded reference lighting evidence",
        intent.parameters.reference,
      );
    }
    if (operation !== "lighting_bake") {
      appendRead("lighting.inspect", "INSPECT", "Inspect current Blender lighting", {
        assetId: intent.parameters.assetId,
      });
    }
    documentRead = appendRead("document.get", "READ", "Read canonical lighting document version", {
      projection: "summary",
    });
    const writeTool = operation === "lighting_bake" ? "lighting.bake" : "lighting.create_rig";
    const descriptor = findDescriptor(capabilities, writeTool);
    const writeInput = { ...intent.parameters, expectedDocumentVersion: 1 };
    const bindings: AgentPlanStep["inputBindings"] = [
      {
        targetPath: "expectedDocumentVersion",
        sourceStepId: documentRead.id,
        sourcePath: "data.documentVersion",
      },
    ];
    const dryRun = step({
      goalId: intent.goalId,
      index: steps.length,
      type: "DRY_RUN",
      label: `Dry-run ${writeTool}`,
      tool: writeTool,
      descriptor,
      dependencies: dependency ? [dependency] : [],
      data: writeInput,
      bindings,
      approvalPolicy: policy,
    });
    steps.push(dryRun);
    const write = step({
      goalId: intent.goalId,
      index: steps.length,
      type: "WRITE",
      label: `Execute ${writeTool} through MCP and Command Engine`,
      tool: writeTool,
      descriptor,
      dependencies: [dryRun.id],
      data: writeInput,
      bindings,
      failurePolicy: "REPLAN",
      approvalPolicy: policy,
    });
    steps.push(write);
    dependency = write.id;
    if (operation !== "lighting_bake") {
      appendRead("lighting.resolve_profile", "READ", "Resolve the committed delivery profile", {
        sceneId: intent.parameters.sceneId,
        target: intent.parameters.target ?? "REALTIME",
      });
      appendRead("lighting.validate", "VALIDATE", "Validate committed lighting and reference agreement", {
        assetId: intent.parameters.assetId,
        sceneId: intent.parameters.sceneId,
        target: intent.parameters.target ?? "REALTIME",
        ...(intent.parameters.reference ? { reference: intent.parameters.reference } : {}),
      });
    }
  }

  const terminal = dependency;
  steps.push(
    step({
      goalId: intent.goalId,
      index: steps.length,
      type: "VERIFY",
      label: "Verify the lighting workflow once",
      dependencies: terminal ? [terminal] : [],
      approvalPolicy: policy,
      verification: {
        required: true,
        strategy: "STATE_ASSERTION",
        assertions: terminal ? [{ sourceStepId: terminal, operator: "SUCCESS" }] : [],
      },
    }),
  );
  return steps;
}

function cameraPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const operation = String(intent.parameters.operation ?? "").toLowerCase();
  const steps: AgentPlanStep[] = [];
  let dependency: string | undefined;
  const toolInput = Object.fromEntries(Object.entries(intent.parameters).filter(([key]) => key !== "operation"));
  const append = (tool: string, type: AgentPlanStepType, label: string, data: unknown) => {
    const current = step({
      goalId: intent.goalId,
      index: steps.length,
      type,
      label,
      tool,
      descriptor: findDescriptor(capabilities, tool),
      dependencies: dependency ? [dependency] : [],
      data,
      approvalPolicy: policy,
    });
    steps.push(current);
    dependency = current.id;
    return current;
  };
  const readTools: Readonly<Record<string, string>> = {
    camera_inspect: "camera.inspect",
    camera_evaluate: "camera.evaluate",
    camera_validate: "camera.validate",
    cinematic_inspect: "cinematic.inspect",
  };
  const readTool = readTools[operation];
  if (readTool) {
    append(readTool, readTool === "camera.validate" ? "VALIDATE" : "INSPECT", `Run ${readTool}`, toolInput);
  } else {
    const sequenceWrite = ["cinematic_apply_sequence", "camera_orbit", "camera_dolly", "camera_zoom"].includes(
      operation,
    );
    if (!sequenceWrite && operation !== "camera_create") {
      append("camera.inspect", "INSPECT", "Inspect the current canonical camera", {
        cameraId:
          intent.parameters.cameraId ??
          (typeof intent.parameters.camera === "object" && intent.parameters.camera !== null
            ? (intent.parameters.camera as Record<string, unknown>).id
            : undefined),
      });
    }
    const documentRead = append("document.get", "READ", "Read the canonical document version", {
      projection: "summary",
    });
    const writeTool = sequenceWrite
      ? "cinematic.apply_sequence"
      : operation === "camera_create"
        ? "camera.create"
        : "camera.update";
    const writeInput = { ...toolInput, expectedDocumentVersion: 1 };
    const bindings: AgentPlanStep["inputBindings"] = [
      {
        targetPath: "expectedDocumentVersion",
        sourceStepId: documentRead.id,
        sourcePath: "data.documentVersion",
      },
    ];
    const descriptor = findDescriptor(capabilities, writeTool);
    const dryRun = step({
      goalId: intent.goalId,
      index: steps.length,
      type: "DRY_RUN",
      label: `Dry-run ${writeTool}`,
      tool: writeTool,
      descriptor,
      dependencies: dependency ? [dependency] : [],
      data: writeInput,
      bindings,
      approvalPolicy: policy,
    });
    steps.push(dryRun);
    const write = step({
      goalId: intent.goalId,
      index: steps.length,
      type: "WRITE",
      label: `Execute ${writeTool} through MCP, Blender, and Command Engine`,
      tool: writeTool,
      descriptor,
      dependencies: [dryRun.id],
      data: writeInput,
      bindings,
      failurePolicy: "REPLAN",
      approvalPolicy: policy,
    });
    steps.push(write);
    dependency = write.id;
    if (sequenceWrite) {
      append("cinematic.inspect", "INSPECT", "Inspect the committed cinematic sequence", {
        sequenceId:
          typeof intent.parameters.sequence === "object" && intent.parameters.sequence !== null
            ? (intent.parameters.sequence as Record<string, unknown>).id
            : intent.parameters.sequenceId,
      });
    } else {
      append("camera.evaluate", "READ", "Evaluate the committed camera at a fixed time", {
        cameraId:
          typeof intent.parameters.camera === "object" && intent.parameters.camera !== null
            ? (intent.parameters.camera as Record<string, unknown>).id
            : intent.parameters.cameraId,
        time: intent.parameters.time ?? 0,
      });
    }
    append("camera.validate", "VALIDATE", "Validate composition and cinematic continuity", {
      ...(sequenceWrite
        ? {
            sequenceId:
              typeof intent.parameters.sequence === "object" && intent.parameters.sequence !== null
                ? (intent.parameters.sequence as Record<string, unknown>).id
                : intent.parameters.sequenceId,
          }
        : {
            cameraId:
              typeof intent.parameters.camera === "object" && intent.parameters.camera !== null
                ? (intent.parameters.camera as Record<string, unknown>).id
                : intent.parameters.cameraId,
          }),
      time: intent.parameters.time ?? 0,
      ...(intent.parameters.sampleTimes ? { sampleTimes: intent.parameters.sampleTimes } : {}),
    });
  }
  const terminal = dependency;
  steps.push(
    step({
      goalId: intent.goalId,
      index: steps.length,
      type: "VERIFY",
      label: "Verify the camera or cinematic workflow once",
      dependencies: terminal ? [terminal] : [],
      approvalPolicy: policy,
      verification: {
        required: true,
        strategy: "STATE_ASSERTION",
        assertions: terminal ? [{ sourceStepId: terminal, operator: "SUCCESS" }] : [],
      },
    }),
  );
  return steps;
}

function renamePlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const project = findDescriptor(capabilities, "project.get");
  const version = findDescriptor(capabilities, "document.get_version");
  const rename = findDescriptor(capabilities, "document.rename");
  const read = findDescriptor(capabilities, "document.get");
  const name = String(intent.parameters.name ?? intent.requestedOutcome);
  const first = step({
    goalId: intent.goalId,
    index: 0,
    type: "READ",
    label: "Read current project version",
    tool: "project.get",
    descriptor: project,
    approvalPolicy: policy,
  });
  const second = step({
    goalId: intent.goalId,
    index: 1,
    type: "READ",
    label: "Read the current canonical document version",
    tool: "document.get_version",
    descriptor: version,
    dependencies: [first.id],
    data: { projection: "summary", version: 1 },
    bindings: [{ targetPath: "version", sourceStepId: first.id, sourcePath: "data.currentDocumentVersion" }],
    approvalPolicy: policy,
  });
  const dryRun = step({
    goalId: intent.goalId,
    index: 2,
    type: "DRY_RUN",
    label: "Dry-run the document rename",
    tool: "document.rename",
    descriptor: rename,
    dependencies: [second.id],
    data: { name, expectedDocumentVersion: 1 },
    bindings: [
      { targetPath: "expectedDocumentVersion", sourceStepId: first.id, sourcePath: "data.currentDocumentVersion" },
    ],
    approvalPolicy: policy,
  });
  const write = step({
    goalId: intent.goalId,
    index: 3,
    type: "WRITE",
    label: "Commit the document rename",
    tool: "document.rename",
    descriptor: rename,
    dependencies: [dryRun.id],
    data: { name, expectedDocumentVersion: 1 },
    bindings: [
      { targetPath: "expectedDocumentVersion", sourceStepId: first.id, sourcePath: "data.currentDocumentVersion" },
    ],
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  const verifyRead = step({
    goalId: intent.goalId,
    index: 4,
    type: "READ",
    label: "Read the renamed canonical document",
    tool: "document.get",
    descriptor: read,
    dependencies: [write.id],
    data: { projection: "summary" },
    approvalPolicy: policy,
  });
  const verify = step({
    goalId: intent.goalId,
    index: 5,
    type: "VERIFY",
    label: "Verify the document name",
    dependencies: [verifyRead.id],
    approvalPolicy: policy,
    expected: { sourceStepId: verifyRead.id, path: "data.name", operator: "EQUALS", value: name },
    verification: {
      required: true,
      strategy: "STATE_ASSERTION",
      assertions: [{ sourceStepId: verifyRead.id, path: "data.name", operator: "EQUALS", value: name }],
    },
  });
  return [
    first,
    second,
    dryRun,
    write,
    verifyRead,
    verify,
    step({
      goalId: intent.goalId,
      index: 6,
      type: "COMPLETE",
      label: "Complete rename",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function inspectPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const project = step({
    goalId: intent.goalId,
    index: 0,
    type: "READ",
    label: "Inspect project",
    tool: "project.get",
    descriptor: findDescriptor(capabilities, "project.get"),
    approvalPolicy: policy,
  });
  const hierarchy = step({
    goalId: intent.goalId,
    index: 1,
    type: "INSPECT",
    label: "Inspect document hierarchy",
    tool: "document.inspect_hierarchy",
    descriptor: findDescriptor(capabilities, "document.inspect_hierarchy"),
    dependencies: [project.id],
    data: { maxDepth: 100 },
    approvalPolicy: policy,
  });
  const verify = step({
    goalId: intent.goalId,
    index: 2,
    type: "VERIFY",
    label: "Verify hierarchy inspection",
    dependencies: [hierarchy.id],
    approvalPolicy: policy,
    expected: { sourceStepId: hierarchy.id, path: "data.nodes", operator: "EXISTS" },
    verification: {
      required: true,
      strategy: "STRUCTURAL",
      assertions: [{ sourceStepId: hierarchy.id, path: "data.nodes", operator: "EXISTS" }],
    },
  });
  return [
    project,
    hierarchy,
    verify,
    step({
      goalId: intent.goalId,
      index: 3,
      type: "COMPLETE",
      label: "Complete inspection",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function nodeUpdatePlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const nodeId = intent.targetNodeIds[0] ?? "missing-node";
  const read = step({
    goalId: intent.goalId,
    index: 0,
    type: "READ",
    label: "Read target node",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    data: { projection: "node-subtree", nodeId },
    approvalPolicy: policy,
  });
  const analyze = step({
    goalId: intent.goalId,
    index: 1,
    type: "ANALYZE",
    label: "Calculate canonical node changes",
    dependencies: [read.id],
    data: {
      operation: intent.parameters.deltaY === undefined ? "NODE_CHANGES" : "NODE_OFFSET_Y",
      nodeId,
      deltaY: intent.parameters.deltaY ?? 0,
      changes: intent.parameters.changes ?? {},
    },
    bindings: [{ targetPath: "source", sourceStepId: read.id, sourcePath: "data" }],
    approvalPolicy: policy,
  });
  const update = findDescriptor(capabilities, "node.update");
  const baseInput = { expectedDocumentVersion: 1, nodeId, changes: {} };
  const bindings: AgentPlanStep["inputBindings"] = [
    { targetPath: "expectedDocumentVersion", sourceStepId: read.id, sourcePath: "data.document.documentVersion" },
    { targetPath: "changes", sourceStepId: analyze.id, sourcePath: "changes" },
  ];
  const dryRun = step({
    goalId: intent.goalId,
    index: 2,
    type: "DRY_RUN",
    label: "Dry-run node update",
    tool: "node.update",
    descriptor: update,
    dependencies: [analyze.id],
    data: baseInput,
    bindings,
    approvalPolicy: policy,
  });
  const write = step({
    goalId: intent.goalId,
    index: 3,
    type: "WRITE",
    label: "Commit node update",
    tool: "node.update",
    descriptor: update,
    dependencies: [dryRun.id],
    data: baseInput,
    bindings,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  const verifyRead = step({
    goalId: intent.goalId,
    index: 4,
    type: "READ",
    label: "Read updated node",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [write.id],
    data: { projection: "node-subtree", nodeId },
    approvalPolicy: policy,
  });
  const expectedPath = intent.parameters.deltaY === undefined ? "data.nodes.0" : "data.nodes.0.transform.position.y";
  const expectedValue = intent.parameters.expectedY;
  const assertion =
    expectedValue === undefined && intent.parameters.deltaY !== undefined
      ? {
          sourceStepId: verifyRead.id,
          path: expectedPath,
          expectedSourceStepId: analyze.id,
          expectedSourcePath: "expectedY",
          operator: "EQUALS" as const,
        }
      : expectedValue === undefined
        ? { sourceStepId: verifyRead.id, path: expectedPath, operator: "EXISTS" as const }
        : {
            sourceStepId: verifyRead.id,
            path: expectedPath,
            operator: "EQUALS" as const,
            value: expectedValue as never,
          };
  const verify = step({
    goalId: intent.goalId,
    index: 5,
    type: "VERIFY",
    label: "Verify exact node update",
    dependencies: [verifyRead.id],
    expected: assertion,
    approvalPolicy: policy,
    verification: { required: true, strategy: "STATE_ASSERTION", assertions: [assertion] },
  });
  return [
    read,
    analyze,
    dryRun,
    write,
    verifyRead,
    verify,
    step({
      goalId: intent.goalId,
      index: 6,
      type: "COMPLETE",
      label: "Complete node update",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function threeTransformPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const assetId = String(intent.parameters.assetId ?? "missing-asset");
  const sceneId = String(intent.parameters.sceneId ?? "missing-scene");
  const nodeId = intent.targetNodeIds[0] ?? String(intent.parameters.nodeId ?? "missing-node");
  const inspectAsset = step({
    goalId: intent.goalId,
    index: 0,
    type: "INSPECT",
    label: "Inspect registered 3D asset provenance",
    tool: "three.inspect_asset",
    descriptor: findDescriptor(capabilities, "three.inspect_asset"),
    data: { assetId },
    approvalPolicy: policy,
  });
  const inspectScene = step({
    goalId: intent.goalId,
    index: 1,
    type: "INSPECT",
    label: "Inspect canonical 3D scene projection",
    tool: "three.inspect_scene",
    descriptor: findDescriptor(capabilities, "three.inspect_scene"),
    dependencies: [inspectAsset.id],
    data: { sceneId },
    approvalPolicy: policy,
  });
  const read = step({
    goalId: intent.goalId,
    index: 2,
    type: "READ",
    label: "Read canonical 3D node",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [inspectScene.id],
    data: { projection: "node-subtree", nodeId },
    approvalPolicy: policy,
  });
  const analyze = step({
    goalId: intent.goalId,
    index: 3,
    type: "ANALYZE",
    label: "Calculate deterministic 3D transform",
    dependencies: [read.id],
    data: { operation: "THREE_OFFSET_X", nodeId, deltaX: intent.parameters.deltaX ?? 0 },
    bindings: [{ targetPath: "source", sourceStepId: read.id, sourcePath: "data" }],
    approvalPolicy: policy,
  });
  const descriptor = findDescriptor(capabilities, "three.update_node_transform");
  const baseInput = {
    expectedDocumentVersion: 1,
    nodeId,
    transform: {},
    coordinateSpace: "LOCAL",
    unit: "M",
  };
  const bindings: AgentPlanStep["inputBindings"] = [
    { targetPath: "expectedDocumentVersion", sourceStepId: read.id, sourcePath: "data.document.documentVersion" },
    { targetPath: "transform", sourceStepId: analyze.id, sourcePath: "transform" },
  ];
  const dryRun = step({
    goalId: intent.goalId,
    index: 4,
    type: "DRY_RUN",
    label: "Dry-run canonical 3D transform",
    tool: "three.update_node_transform",
    descriptor,
    dependencies: [analyze.id],
    data: baseInput,
    bindings,
    approvalPolicy: policy,
  });
  const write = step({
    goalId: intent.goalId,
    index: 5,
    type: "WRITE",
    label: "Commit canonical 3D transform",
    tool: "three.update_node_transform",
    descriptor,
    dependencies: [dryRun.id],
    data: baseInput,
    bindings,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  const verifyRead = step({
    goalId: intent.goalId,
    index: 6,
    type: "READ",
    label: "Read transformed canonical 3D node",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [write.id],
    data: { projection: "node-subtree", nodeId },
    approvalPolicy: policy,
  });
  const assertion = {
    sourceStepId: verifyRead.id,
    path: "data.nodes.0.transform.position.x",
    expectedSourceStepId: analyze.id,
    expectedSourcePath: "expectedX",
    operator: "EQUALS" as const,
  };
  const verify = step({
    goalId: intent.goalId,
    index: 7,
    type: "VERIFY",
    label: "Verify exact canonical 3D transform",
    dependencies: [verifyRead.id],
    expected: assertion,
    verification: { required: true, strategy: "STATE_ASSERTION", assertions: [assertion] },
    approvalPolicy: policy,
  });
  return [
    inspectAsset,
    inspectScene,
    read,
    analyze,
    dryRun,
    write,
    verifyRead,
    verify,
    step({
      goalId: intent.goalId,
      index: 8,
      type: "COMPLETE",
      label: "Complete canonical 3D transform",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function multiviewReconstructionPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const analyze = step({
    goalId: intent.goalId,
    index: 0,
    type: "INSPECT",
    label: "Analyze multi-view reference set for 3D reconstruction readiness",
    tool: "three.multiview_analyze",
    descriptor: findDescriptor(capabilities, "three.multiview_analyze"),
    data: {
      ...(intent.parameters.subjectLabel !== undefined ? { subjectLabel: intent.parameters.subjectLabel } : {}),
      ...(intent.parameters.subjectCategory !== undefined
        ? { subjectCategory: intent.parameters.subjectCategory }
        : {}),
      views: intent.parameters.views ?? [],
      landmarkHints: intent.parameters.landmarkHints ?? [],
      partHints: intent.parameters.partHints ?? [],
      scaleHints: intent.parameters.scaleHints ?? [],
      ...(intent.parameters.targetQuality !== undefined ? { targetQuality: intent.parameters.targetQuality } : {}),
    },
    approvalPolicy: policy,
  });
  const assertion = {
    sourceStepId: analyze.id,
    path: "data.readiness.classification",
    operator: "EXISTS" as const,
  };
  const verify = step({
    goalId: intent.goalId,
    index: 1,
    type: "VERIFY",
    label: "Verify a reconstruction readiness assessment was produced",
    dependencies: [analyze.id],
    expected: assertion,
    verification: { required: true, strategy: "STATE_ASSERTION", assertions: [assertion] },
    approvalPolicy: policy,
  });
  return [
    analyze,
    verify,
    step({
      goalId: intent.goalId,
      index: 2,
      type: "COMPLETE",
      label: "Report multi-view reconstruction readiness",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function generateReconstructionCandidatePlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const evidenceInput = {
    ...(intent.parameters.subjectLabel !== undefined ? { subjectLabel: intent.parameters.subjectLabel } : {}),
    ...(intent.parameters.subjectCategory !== undefined ? { subjectCategory: intent.parameters.subjectCategory } : {}),
    views: intent.parameters.views ?? [],
    landmarkHints: intent.parameters.landmarkHints ?? [],
    partHints: intent.parameters.partHints ?? [],
    scaleHints: intent.parameters.scaleHints ?? [],
    ...(intent.parameters.targetQuality !== undefined ? { targetQuality: intent.parameters.targetQuality } : {}),
  };

  const inspectReadiness = step({
    goalId: intent.goalId,
    index: 0,
    type: "INSPECT",
    label: "Inspect multi-view reconstruction readiness before generating geometry",
    tool: "three.multiview_analyze",
    descriptor: findDescriptor(capabilities, "three.multiview_analyze"),
    data: evidenceInput,
    approvalPolicy: policy,
  });
  const readDocument = step({
    goalId: intent.goalId,
    index: 1,
    type: "READ",
    label: "Read the current document version",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [inspectReadiness.id],
    data: { projection: "summary" },
    approvalPolicy: policy,
  });
  const descriptor = findDescriptor(capabilities, "three.reconstruction_generate_candidate");
  const generateData = {
    ...evidenceInput,
    expectedDocumentVersion: 1,
    ...(intent.parameters.qualityMode !== undefined ? { qualityMode: intent.parameters.qualityMode } : {}),
  };
  const generateBindings = [
    { targetPath: "expectedDocumentVersion", sourceStepId: readDocument.id, sourcePath: "data.documentVersion" },
  ];
  const dryRun = step({
    goalId: intent.goalId,
    index: 2,
    type: "DRY_RUN",
    label: "Dry-run the reconstruction candidate generation",
    tool: "three.reconstruction_generate_candidate",
    descriptor,
    dependencies: [readDocument.id],
    data: generateData,
    bindings: generateBindings,
    approvalPolicy: policy,
  });
  const generate = step({
    goalId: intent.goalId,
    index: 3,
    type: "WRITE",
    label: "Generate and register a real candidate 3D mesh from the multi-view evidence",
    tool: "three.reconstruction_generate_candidate",
    descriptor,
    dependencies: [dryRun.id],
    data: generateData,
    bindings: generateBindings,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  const assertion = {
    sourceStepId: generate.id,
    path: "data.reconstruction.status",
    operator: "EXISTS" as const,
  };
  const verify = step({
    goalId: intent.goalId,
    index: 4,
    type: "VERIFY",
    label: "Verify a reconstruction outcome was produced",
    dependencies: [generate.id],
    expected: assertion,
    verification: { required: true, strategy: "STATE_ASSERTION", assertions: [assertion] },
    approvalPolicy: policy,
  });
  return [
    inspectReadiness,
    readDocument,
    dryRun,
    generate,
    verify,
    step({
      goalId: intent.goalId,
      index: 5,
      type: "COMPLETE",
      label: "Report the reconstruction candidate outcome",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function reconstructAndImportPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const evidenceInput = {
    ...(intent.parameters.subjectLabel !== undefined ? { subjectLabel: intent.parameters.subjectLabel } : {}),
    ...(intent.parameters.subjectCategory !== undefined ? { subjectCategory: intent.parameters.subjectCategory } : {}),
    views: intent.parameters.views ?? [],
    landmarkHints: intent.parameters.landmarkHints ?? [],
    partHints: intent.parameters.partHints ?? [],
    scaleHints: intent.parameters.scaleHints ?? [],
    ...(intent.parameters.targetQuality !== undefined ? { targetQuality: intent.parameters.targetQuality } : {}),
  };

  const inspectReadiness = step({
    goalId: intent.goalId,
    index: 0,
    type: "INSPECT",
    label: "Inspect multi-view reconstruction readiness before generating geometry",
    tool: "three.multiview_analyze",
    descriptor: findDescriptor(capabilities, "three.multiview_analyze"),
    data: evidenceInput,
    approvalPolicy: policy,
  });
  const readDocument = step({
    goalId: intent.goalId,
    index: 1,
    type: "READ",
    label: "Read the current document version",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [inspectReadiness.id],
    data: { projection: "summary" },
    approvalPolicy: policy,
  });
  const generateDescriptor = findDescriptor(capabilities, "three.reconstruction_generate_candidate");
  const generateData = {
    ...evidenceInput,
    expectedDocumentVersion: 1,
    ...(intent.parameters.qualityMode !== undefined ? { qualityMode: intent.parameters.qualityMode } : {}),
  };
  const generateBindings = [
    { targetPath: "expectedDocumentVersion", sourceStepId: readDocument.id, sourcePath: "data.documentVersion" },
  ];
  const generateDryRun = step({
    goalId: intent.goalId,
    index: 2,
    type: "DRY_RUN",
    label: "Dry-run the reconstruction candidate generation",
    tool: "three.reconstruction_generate_candidate",
    descriptor: generateDescriptor,
    dependencies: [readDocument.id],
    data: generateData,
    bindings: generateBindings,
    approvalPolicy: policy,
  });
  const generate = step({
    goalId: intent.goalId,
    index: 3,
    type: "WRITE",
    label: "Generate and register a real candidate 3D mesh from the multi-view evidence",
    tool: "three.reconstruction_generate_candidate",
    descriptor: generateDescriptor,
    dependencies: [generateDryRun.id],
    data: generateData,
    bindings: generateBindings,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  // No intermediate VERIFY step here: the deterministic reasoning provider's verifyCompletion
  // aggregates every VERIFY step's assertions across the whole plan against whatever observations
  // exist so far, so an early VERIFY would always fail on the later import assertion before the
  // import steps have even run. If candidate generation produced no assetId, the import dry-run's
  // input validation fails naturally and honestly instead.
  const importDescriptor = findDescriptor(capabilities, "three.import_scene");
  const importBindings = [
    { targetPath: "assetId", sourceStepId: generate.id, sourcePath: "data.assetId" },
    { targetPath: "expectedDocumentVersion", sourceStepId: generate.id, sourcePath: "data.resultVersion" },
  ];
  const importDryRun = step({
    goalId: intent.goalId,
    index: 4,
    type: "DRY_RUN",
    label: "Dry-run the canonical import of the generated candidate",
    tool: "three.import_scene",
    descriptor: importDescriptor,
    dependencies: [generate.id],
    data: { assetId: "pending", expectedDocumentVersion: 1 },
    bindings: importBindings,
    approvalPolicy: policy,
  });
  const importScene = step({
    goalId: intent.goalId,
    index: 5,
    type: "WRITE",
    label: "Import the generated candidate into the canonical document",
    tool: "three.import_scene",
    descriptor: importDescriptor,
    dependencies: [importDryRun.id],
    data: { assetId: "pending", expectedDocumentVersion: 1 },
    bindings: importBindings,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  const importAssertion = {
    sourceStepId: importScene.id,
    path: "data.counts.meshes",
    operator: "GREATER_THAN" as const,
    value: 0,
  };
  const verifyImport = step({
    goalId: intent.goalId,
    index: 6,
    type: "VERIFY",
    label: "Verify the canonical document now contains imported mesh geometry",
    dependencies: [importScene.id],
    expected: importAssertion,
    verification: { required: true, strategy: "STATE_ASSERTION", assertions: [importAssertion] },
    approvalPolicy: policy,
  });
  return [
    inspectReadiness,
    readDocument,
    generateDryRun,
    generate,
    importDryRun,
    importScene,
    verifyImport,
    step({
      goalId: intent.goalId,
      index: 7,
      type: "COMPLETE",
      label: "Report the reconstruct-and-import outcome",
      dependencies: [verifyImport.id],
      approvalPolicy: policy,
    }),
  ];
}

function blenderTransformPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const assetId = String(intent.parameters.assetId ?? "missing-asset");
  const nodeId = intent.targetNodeIds[0] ?? String(intent.parameters.nodeId ?? "missing-node");
  const deltaX = Number(intent.parameters.deltaX ?? 0);
  const inspectScene = step({
    goalId: intent.goalId,
    index: 0,
    type: "INSPECT",
    label: "Inspect registered scene through Blender",
    tool: "blender.inspect_scene",
    descriptor: findDescriptor(capabilities, "blender.inspect_scene"),
    data: { assetId },
    approvalPolicy: policy,
  });
  const inspectObject = step({
    goalId: intent.goalId,
    index: 1,
    type: "INSPECT",
    label: "Inspect target object through Blender",
    tool: "blender.inspect_object",
    descriptor: findDescriptor(capabilities, "blender.inspect_object"),
    dependencies: [inspectScene.id],
    data: { assetId, targetId: nodeId },
    approvalPolicy: policy,
  });
  const read = step({
    goalId: intent.goalId,
    index: 2,
    type: "READ",
    label: "Read canonical Blender target",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [inspectObject.id],
    data: { projection: "node-subtree", nodeId },
    approvalPolicy: policy,
  });
  const analyze = step({
    goalId: intent.goalId,
    index: 3,
    type: "ANALYZE",
    label: "Calculate bounded Blender transform",
    dependencies: [read.id],
    data: { operation: "BLENDER_OFFSET_X", nodeId, deltaX },
    bindings: [{ targetPath: "source", sourceStepId: read.id, sourcePath: "data" }],
    approvalPolicy: policy,
  });
  const descriptor = findDescriptor(capabilities, "blender.update_object_transform");
  const data = {
    assetId,
    targetId: nodeId,
    expectedDocumentVersion: 1,
    mode: "DELTA",
    coordinateSpace: "LOCAL",
    unit: "M",
    translation: { x: deltaX, y: 0, z: 0 },
  };
  const bindings: AgentPlanStep["inputBindings"] = [
    { targetPath: "expectedDocumentVersion", sourceStepId: read.id, sourcePath: "data.document.documentVersion" },
  ];
  const dryRun = step({
    goalId: intent.goalId,
    index: 4,
    type: "DRY_RUN",
    label: "Validate Blender transform manifest",
    tool: "blender.update_object_transform",
    descriptor,
    dependencies: [analyze.id],
    data,
    bindings,
    approvalPolicy: policy,
  });
  const write = step({
    goalId: intent.goalId,
    index: 5,
    type: "WRITE",
    label: "Execute and reconcile Blender transform",
    tool: "blender.update_object_transform",
    descriptor,
    dependencies: [dryRun.id],
    data,
    bindings,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  const verifyRead = step({
    goalId: intent.goalId,
    index: 6,
    type: "READ",
    label: "Read reconciled canonical Blender target",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [write.id],
    data: { projection: "node-subtree", nodeId },
    approvalPolicy: policy,
  });
  const assertion = {
    sourceStepId: verifyRead.id,
    path: "data.nodes.0.transform.position.x",
    expectedSourceStepId: analyze.id,
    expectedSourcePath: "expectedX",
    operator: "EQUALS" as const,
  };
  const verify = step({
    goalId: intent.goalId,
    index: 7,
    type: "VERIFY",
    label: "Verify reconciled Blender transform",
    dependencies: [verifyRead.id],
    expected: assertion,
    verification: { required: true, strategy: "STATE_ASSERTION", assertions: [assertion] },
    approvalPolicy: policy,
  });
  return [
    inspectScene,
    inspectObject,
    read,
    analyze,
    dryRun,
    write,
    verifyRead,
    verify,
    step({
      goalId: intent.goalId,
      index: 8,
      type: "COMPLETE",
      label: "Complete Blender transform",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function professionalMeshPlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
  workflow: "BEVEL" | "UV_REPAIR",
): AgentPlanStep[] {
  const assetId = String(intent.parameters.assetId ?? "missing-asset");
  const nodeId = intent.targetNodeIds[0] ?? String(intent.parameters.nodeId ?? "missing-node");
  const inspectScene = step({
    goalId: intent.goalId,
    index: 0,
    type: "INSPECT",
    label: "Inspect registered scene through Blender",
    tool: "blender.inspect_scene",
    descriptor: findDescriptor(capabilities, "blender.inspect_scene"),
    data: { assetId },
    approvalPolicy: policy,
  });
  const inspectTool = workflow === "BEVEL" ? "three.inspect_topology" : "three.inspect_uv";
  const inspectBefore = step({
    goalId: intent.goalId,
    index: 1,
    type: "INSPECT",
    label: workflow === "BEVEL" ? "Inspect target topology" : "Inspect target UV layout",
    tool: inspectTool,
    descriptor: findDescriptor(capabilities, inspectTool),
    dependencies: [inspectScene.id],
    data: workflow === "BEVEL" ? { assetId, targetId: nodeId, profile: "WEB_STATIC" } : { assetId, targetId: nodeId },
    approvalPolicy: policy,
  });
  const read = step({
    goalId: intent.goalId,
    index: 2,
    type: "READ",
    label: "Read canonical mesh document version",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [inspectBefore.id],
    data: { projection: "summary" },
    approvalPolicy: policy,
  });
  const analyze = step({
    goalId: intent.goalId,
    index: 3,
    type: "ANALYZE",
    label: workflow === "BEVEL" ? "Analyze bounded bevel intent" : "Select deterministic UV repair strategy",
    dependencies: [inspectBefore.id, read.id],
    data: { operation: workflow === "BEVEL" ? "BLENDER_BEVEL" : "BLENDER_UV_REPAIR", nodeId },
    bindings: [{ targetPath: "inspection", sourceStepId: inspectBefore.id, sourcePath: "data.data" }],
    approvalPolicy: policy,
  });
  const tool = workflow === "BEVEL" ? "three.bevel_mesh" : "three.unwrap_uv";
  const descriptor = findDescriptor(capabilities, tool);
  const data =
    workflow === "BEVEL"
      ? {
          assetId,
          targetId: nodeId,
          expectedDocumentVersion: 1,
          selection: intent.parameters.selection ?? { kind: "ALL", domain: "EDGE" },
          width: Number(intent.parameters.width ?? 0.002),
          segments: Number(intent.parameters.segments ?? 2),
          profile: Number(intent.parameters.profile ?? 0.5),
          affect: "EDGES",
        }
      : {
          assetId,
          targetId: nodeId,
          expectedDocumentVersion: 1,
          selection: intent.parameters.selection ?? { kind: "ALL", domain: "FACE" },
          method: String(intent.parameters.method ?? "ANGLE_BASED"),
          margin: Number(intent.parameters.margin ?? 0.02),
          packAfter: true,
          rotate: true,
          scaleToFit: true,
        };
  const versionBinding: AgentPlanStep["inputBindings"] = [
    { targetPath: "expectedDocumentVersion", sourceStepId: read.id, sourcePath: "data.documentVersion" },
  ];
  const dryRun = step({
    goalId: intent.goalId,
    index: 4,
    type: "DRY_RUN",
    label: workflow === "BEVEL" ? "Validate bevel operation and growth budget" : "Validate unwrap and pack operation",
    tool,
    descriptor,
    dependencies: [analyze.id],
    data,
    bindings: versionBinding,
    approvalPolicy: policy,
  });
  const write = step({
    goalId: intent.goalId,
    index: 5,
    type: "WRITE",
    label: workflow === "BEVEL" ? "Execute and reconcile bevel derivative" : "Execute and reconcile UV derivative",
    tool,
    descriptor,
    dependencies: [dryRun.id],
    data,
    bindings: versionBinding,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  const afterData =
    workflow === "BEVEL" ? { assetId, targetId: nodeId, profile: "WEB_STATIC" } : { assetId, targetId: nodeId };
  const inspectAfter = step({
    goalId: intent.goalId,
    index: 6,
    type: "INSPECT",
    label: workflow === "BEVEL" ? "Reinspect beveled topology" : "Reinspect repaired UV layout",
    tool: inspectTool,
    descriptor: findDescriptor(capabilities, inspectTool),
    dependencies: [write.id],
    data: afterData,
    bindings: [{ targetPath: "assetId", sourceStepId: write.id, sourcePath: "data.reconciliation.outputAssetId" }],
    approvalPolicy: policy,
  });
  const assertion =
    workflow === "BEVEL"
      ? {
          sourceStepId: inspectAfter.id,
          path: "data.data.faceCount",
          expectedSourceStepId: inspectBefore.id,
          expectedSourcePath: "data.data.faceCount",
          operator: "GREATER_THAN" as const,
        }
      : { sourceStepId: inspectAfter.id, path: "data.data.layerCount", operator: "GREATER_THAN" as const, value: 0 };
  const verify = step({
    goalId: intent.goalId,
    index: 7,
    type: "VERIFY",
    label: workflow === "BEVEL" ? "Verify topology increased safely" : "Verify UV layer survived round trip",
    dependencies: [inspectAfter.id],
    expected: assertion,
    verification: { required: true, strategy: "STATE_ASSERTION", assertions: [assertion] },
    approvalPolicy: policy,
  });
  return [
    inspectScene,
    inspectBefore,
    read,
    analyze,
    dryRun,
    write,
    inspectAfter,
    verify,
    step({
      goalId: intent.goalId,
      index: 8,
      type: "COMPLETE",
      label: workflow === "BEVEL" ? "Complete professional bevel workflow" : "Complete professional UV workflow",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function nodeCreatePlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const node = intent.parameters.node as Record<string, unknown>;
  const nodeId = String(node.id);
  const read = step({
    goalId: intent.goalId,
    index: 0,
    type: "READ",
    label: "Read canonical document version",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    data: { projection: "summary" },
    approvalPolicy: policy,
  });
  const descriptor = findDescriptor(capabilities, "node.create");
  const bindings: AgentPlanStep["inputBindings"] = [
    {
      targetPath: "expectedDocumentVersion",
      sourceStepId: read.id,
      sourcePath: "data.documentVersion",
    },
  ];
  const data = { expectedDocumentVersion: 1, node };
  const dryRun = step({
    goalId: intent.goalId,
    index: 1,
    type: "DRY_RUN",
    label: "Dry-run node creation",
    tool: "node.create",
    descriptor,
    dependencies: [read.id],
    data,
    bindings,
    approvalPolicy: policy,
  });
  const write = step({
    goalId: intent.goalId,
    index: 2,
    type: "WRITE",
    label: "Commit node creation",
    tool: "node.create",
    descriptor,
    dependencies: [dryRun.id],
    data,
    bindings,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  const verifyRead = step({
    goalId: intent.goalId,
    index: 3,
    type: "READ",
    label: "Read created node",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    dependencies: [write.id],
    data: { projection: "node-subtree", nodeId },
    approvalPolicy: policy,
  });
  const assertion = {
    sourceStepId: verifyRead.id,
    path: "data.nodes.0.id",
    operator: "EQUALS" as const,
    value: nodeId,
  };
  const verify = step({
    goalId: intent.goalId,
    index: 4,
    type: "VERIFY",
    label: "Verify created node identity",
    dependencies: [verifyRead.id],
    expected: assertion,
    verification: { required: true, strategy: "STATE_ASSERTION", assertions: [assertion] },
    approvalPolicy: policy,
  });
  return [
    read,
    dryRun,
    write,
    verifyRead,
    verify,
    step({
      goalId: intent.goalId,
      index: 5,
      type: "COMPLETE",
      label: "Complete node creation",
      dependencies: [verify.id],
      approvalPolicy: policy,
    }),
  ];
}

function deletePlan(
  intent: AgentIntent,
  capabilities: AgentCapabilities,
  policy: AgentApprovalPolicy,
): AgentPlanStep[] {
  const nodeId = intent.targetNodeIds[0] ?? "missing-node";
  const read = step({
    goalId: intent.goalId,
    index: 0,
    type: "READ",
    label: "Inspect node before deletion",
    tool: "document.get",
    descriptor: findDescriptor(capabilities, "document.get"),
    data: { projection: "node-subtree", nodeId },
    approvalPolicy: policy,
  });
  const descriptor = findDescriptor(capabilities, "node.delete");
  const bindings: AgentPlanStep["inputBindings"] = [
    { targetPath: "expectedDocumentVersion", sourceStepId: read.id, sourcePath: "data.document.documentVersion" },
  ];
  const dry = step({
    goalId: intent.goalId,
    index: 1,
    type: "DRY_RUN",
    label: "Dry-run destructive deletion",
    tool: "node.delete",
    descriptor,
    dependencies: [read.id],
    data: { expectedDocumentVersion: 1, nodeId },
    bindings,
    approvalPolicy: policy,
  });
  const write = step({
    goalId: intent.goalId,
    index: 2,
    type: "WRITE",
    label: "Delete node after explicit approval",
    tool: "node.delete",
    descriptor,
    dependencies: [dry.id],
    data: { expectedDocumentVersion: 1, nodeId },
    bindings,
    failurePolicy: "REPLAN",
    approvalPolicy: policy,
  });
  return [
    read,
    dry,
    write,
    step({
      goalId: intent.goalId,
      index: 3,
      type: "COMPLETE",
      label: "Complete deletion",
      dependencies: [write.id],
      approvalPolicy: policy,
    }),
  ];
}

export function createAgentCapabilities(
  tools: readonly McpToolDescriptor[],
  actorPermissions: AgentCapabilities["actorPermissions"],
): AgentCapabilities {
  const body = {
    tools: [...tools].sort((a, b) => a.name.localeCompare(b.name)),
    actorPermissions: [...actorPermissions].sort(),
  };
  return deepFreeze(AgentCapabilitiesSchema.parse({ ...body, fingerprint: fingerprint(body) }));
}

export function generateDeterministicPlan(input: {
  readonly session: AgentSession;
  readonly intent: AgentIntent;
  readonly context: AgentContextBundle;
  readonly capabilities: AgentCapabilities;
  readonly approvalPolicy?: AgentApprovalPolicy;
}): AgentPlan {
  const policy = input.approvalPolicy ?? "AUTO_SAFE_WRITE";
  const gaps = capabilityGaps(input.intent, input.capabilities);
  let steps: AgentPlanStep[];
  const operation = String(input.intent.parameters.operation ?? "").toLowerCase();
  if (gaps.some((gap) => !gap.canPartiallyProceed)) {
    steps = [
      step({
        goalId: input.intent.goalId,
        index: 0,
        type: "COMPLETE",
        label: "Report capability gap",
        approvalPolicy: policy,
      }),
    ];
  } else if (operation === "three_transform") {
    steps = threeTransformPlan(input.intent, input.capabilities, policy);
  } else if (operation === "blender_transform") {
    steps = blenderTransformPlan(input.intent, input.capabilities, policy);
  } else if (operation === "blender_bevel") {
    steps = professionalMeshPlan(input.intent, input.capabilities, policy, "BEVEL");
  } else if (operation === "blender_uv_repair") {
    steps = professionalMeshPlan(input.intent, input.capabilities, policy, "UV_REPAIR");
  } else if (operation === "multiview_reconstruct") {
    steps = multiviewReconstructionPlan(input.intent, input.capabilities, policy);
  } else if (operation === "generate_reconstruction_candidate") {
    steps = generateReconstructionCandidatePlan(input.intent, input.capabilities, policy);
  } else if (operation === "reconstruct_and_import") {
    steps = reconstructAndImportPlan(input.intent, input.capabilities, policy);
  } else if (operation.startsWith("lighting_")) {
    steps = lightingPlan(input.intent, input.capabilities, policy);
  } else if (operation.startsWith("camera_") || operation.startsWith("cinematic_")) {
    steps = cameraPlan(input.intent, input.capabilities, policy);
  } else if (
    [
      "rig_inspect",
      "rig_create",
      "skin_bind",
      "pose_update",
      "pose_reset",
      "weight_update",
      "weight_normalize",
      "ik_update",
      "constraint_update",
      "deformation_validate",
      "retarget_pose",
      "rig_mechanical_workflow",
      "rig_humanoid_workflow",
    ].includes(operation)
  ) {
    steps = riggingPlan(input.intent, input.capabilities, policy);
  } else if (input.intent.category === "INSPECT" || input.intent.category === "PROJECT") {
    steps = inspectPlan(input.intent, input.capabilities, policy);
  } else if (operation === "delete" || input.intent.requiredCapabilities.includes("node.delete")) {
    steps = deletePlan(input.intent, input.capabilities, policy);
  } else if (input.intent.category === "EDIT" && input.intent.targetNodeIds.length > 0) {
    steps = nodeUpdatePlan(input.intent, input.capabilities, policy);
  } else if (input.intent.category === "EDIT") {
    steps = renamePlan(input.intent, input.capabilities, policy);
  } else if (input.intent.category === "CREATE") {
    steps = nodeCreatePlan(input.intent, input.capabilities, policy);
  } else {
    steps = [
      step({
        goalId: input.intent.goalId,
        index: 0,
        type: "COMPLETE",
        label: "Report unsupported deterministic fixture",
        approvalPolicy: policy,
      }),
    ];
  }
  const content = {
    version: "1.0.0" as const,
    goalId: input.intent.goalId,
    steps,
    requiredCapabilities: [...input.intent.requiredCapabilities],
    expectedWrites: steps.some((entry) => entry.type === "WRITE"),
    verificationStrategy: input.intent.category === "INSPECT" ? ("STRUCTURAL" as const) : ("STATE_ASSERTION" as const),
    capabilityGaps: gaps,
  };
  void input.context;
  return deepFreeze(
    AgentPlanSchema.parse({
      ...content,
      id: deterministicAgentId("agent-plan", content),
      fingerprint: fingerprint(content),
    }),
  );
}

function valueAtPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, part) => {
      if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
      if (current && typeof current === "object") return (current as Record<string, unknown>)[part];
      return undefined;
    }, value);
}

export function createDeterministicReasoningProvider(
  options: { readonly approvalPolicy?: AgentApprovalPolicy } = {},
): AgentReasoningProvider {
  const provider: AgentReasoningProvider = {
    id: "aevum.deterministic",
    version: "1.0.0",
    analyzeIntent(input) {
      return analyzeIntent(input.session, input.context);
    },
    generatePlan(input) {
      return generateDeterministicPlan({ ...input, approvalPolicy: options.approvalPolicy ?? "AUTO_SAFE_WRITE" });
    },
    selectNextAction({ plan, completedStepIds }) {
      const completed = new Set(completedStepIds);
      return plan.steps.find((entry) => !completed.has(entry.id) && entry.dependencies.every((id) => completed.has(id)))
        ?.id;
    },
    interpretObservation({ observation }) {
      const code = observation.diagnostics[0]?.code;
      if (observation.success) return "CONTINUE";
      if (code === "AGENT_VERSION_CONFLICT" || code === "AGENT_TOOL_UNAVAILABLE") return "REPLAN";
      if (code === "AGENT_TOOL_TIMEOUT") return "RETRY";
      return "BLOCK";
    },
    verifyCompletion({ plan, observations }) {
      const byStep = new Map(observations.map((observation) => [observation.stepId, observation]));
      const assertions = plan.steps.flatMap((entry) => entry.verificationRequirement.assertions);
      const failed = assertions.find((assertion) => {
        const observation = assertion.sourceStepId ? byStep.get(assertion.sourceStepId) : undefined;
        const actual =
          observation && assertion.path ? valueAtPath(observation.data, assertion.path) : observation?.success;
        const expectedObservation = assertion.expectedSourceStepId
          ? byStep.get(assertion.expectedSourceStepId)
          : undefined;
        const expected =
          expectedObservation && assertion.expectedSourcePath
            ? valueAtPath(expectedObservation.data, assertion.expectedSourcePath)
            : assertion.value;
        if (assertion.operator === "SUCCESS") return actual !== true;
        if (assertion.operator === "EXISTS") return actual === undefined || actual === null;
        if (assertion.operator === "ABSENT") return actual !== undefined && actual !== null;
        if (assertion.operator === "EQUALS") return JSON.stringify(actual) !== JSON.stringify(expected);
        if (assertion.operator === "GREATER_THAN")
          return typeof actual !== "number" || typeof expected !== "number" || actual <= expected;
        return false;
      });
      return createVerificationResult({
        strategy: plan.verificationStrategy,
        success: !failed,
        ...(failed
          ? { expected: failed, actual: failed.sourceStepId ? byStep.get(failed.sourceStepId)?.data : undefined }
          : {}),
        diagnostics: failed
          ? [
              {
                code: "AGENT_VERIFICATION_FAILED",
                severity: "ERROR",
                message: "Explicit plan verification failed.",
                recoverable: true,
              },
            ]
          : [],
      });
    },
  };
  return Object.freeze(provider);
}
