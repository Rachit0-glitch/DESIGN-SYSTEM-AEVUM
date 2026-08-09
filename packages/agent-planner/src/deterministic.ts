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
