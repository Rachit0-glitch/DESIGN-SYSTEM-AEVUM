import {
  type AgentContextBudget,
  type AgentContextRecord,
  type AgentWorkingMemory,
  assembleAgentContext,
  createWorkingMemory,
  updateWorkingMemory,
} from "@aevum/agent-context";
import {
  AgentApprovalRequestSchema,
  type AgentAuditRecord,
  type AgentDiagnostic,
  type AgentObservation,
  type AgentRun,
  AgentRunSchema,
  type AgentSession,
  AgentSessionSchema,
  createAgentAuditRecord,
  createAgentObservation,
  createAgentOutcome,
  createAgentRun,
  deterministicAgentId,
  deterministicIdempotencyKey,
  fingerprint,
} from "@aevum/agent-core";
import {
  type AgentPlan,
  type AgentPlanStep,
  type AgentReasoningProvider,
  createAgentCapabilities,
  validatePlan,
} from "@aevum/agent-planner";
import { createEntityId } from "@aevum/document-model";
import type { McpPermission, McpResponseEnvelope } from "@aevum/mcp-protocol";
import type { AgentApprovalAdapter } from "./approval.js";
import type { AgentMcpClient } from "./client.js";
import type { AgentPersistenceAdapter } from "./persistence.js";
import { classifyMcpFailure } from "./retry.js";

export interface AgentEngineOptions {
  readonly reasoningProvider: AgentReasoningProvider;
  readonly mcpClient: AgentMcpClient;
  readonly approvalAdapter: AgentApprovalAdapter;
  readonly persistence: AgentPersistenceAdapter;
  readonly contextBudget?: Partial<AgentContextBudget>;
  readonly now?: () => number;
}

export interface ExecuteAgentInput {
  readonly session: AgentSession;
  readonly contextRecords: readonly AgentContextRecord[];
  readonly actorPermissions: readonly McpPermission[];
  readonly cancellationSignal?: AbortSignal;
}

export interface AgentExecutionResult {
  readonly session: AgentSession;
  readonly run: AgentRun;
  readonly plan?: AgentPlan;
  readonly observations: readonly AgentObservation[];
  readonly audits: readonly AgentAuditRecord[];
  readonly workingMemory: AgentWorkingMemory;
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

function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  let cursor = target;
  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) {
      cursor[part] = structuredClone(value);
      return;
    }
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
}

function resolveInput(step: AgentPlanStep, observations: readonly AgentObservation[]): Record<string, unknown> {
  const result = structuredClone(step.input) as Record<string, unknown>;
  const byStep = new Map(observations.map((entry) => [entry.stepId, entry]));
  for (const binding of step.inputBindings) {
    const source = byStep.get(binding.sourceStepId);
    setAtPath(result, binding.targetPath, valueAtPath(source?.data, binding.sourcePath));
  }
  return result;
}

/**
 * Real approval context (post-D5 cleanup): finds the target node's state as read by an earlier
 * READ step in the SAME plan run, by walking the step's real dependency graph — never fabricated,
 * and undefined when no such read genuinely exists (e.g. a write with no preceding read, or a node
 * the read didn't happen to return).
 */
function findPrecedingNodeSnapshot(
  plan: AgentPlan,
  step: AgentPlanStep,
  observations: readonly AgentObservation[],
  nodeId: string,
): Record<string, unknown> | undefined {
  const observationByStep = new Map(observations.map((entry) => [entry.stepId, entry]));
  const stepById = new Map(plan.steps.map((entry) => [entry.id, entry]));
  const visited = new Set<string>();
  const queue: string[] = [...step.dependencies];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const candidate = stepById.get(id);
    const observation = observationByStep.get(id);
    if (candidate?.type === "READ" && observation?.success) {
      // observation.data is the full McpResponseEnvelope (see the TOOL_RESULT branch above, which
      // stores the raw `response`) — the tool's actual payload is nested one level deeper. A
      // node-subtree projection's `nodes` is an array; a full-document projection's `nodes` (Block
      // E's compound edit plan reads the whole document) is a record keyed by node id instead —
      // both are real, valid document.get shapes, so both are checked.
      const envelope = observation.data as
        | { data?: { nodes?: Array<Record<string, unknown>> | Record<string, Record<string, unknown>> } }
        | undefined;
      const nodes = envelope?.data?.nodes;
      const node = Array.isArray(nodes) ? nodes.find((entry) => entry.id === nodeId) : nodes?.[nodeId];
      if (node) return structuredClone(node);
    }
    if (candidate) queue.push(...candidate.dependencies);
  }
  return undefined;
}

/** A real, derived one-line description of an approval-gated write — never a fabricated guess. */
function describeApprovalChange(
  tool: string,
  nodeId: string | undefined,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): string {
  if (!nodeId) return `Run ${tool}.`;
  const beforeName = typeof before?.name === "string" ? before.name : undefined;
  const afterName = typeof after?.name === "string" ? after.name : undefined;
  const label = beforeName ?? nodeId;
  if (tool === "node.delete") return `Delete "${label}".`;
  if (afterName && beforeName && afterName !== beforeName) return `Rename "${beforeName}" -> "${afterName}".`;
  if (after) {
    type Positioned = { readonly transform?: { readonly position?: { readonly x?: number; readonly y?: number } } };
    const beforePos = (before as Positioned | undefined)?.transform?.position;
    const afterPos = (after as Positioned).transform?.position;
    if (afterPos && beforePos && (afterPos.x !== beforePos.x || afterPos.y !== beforePos.y)) {
      return `Move "${label}" to (${Math.round(afterPos.x ?? 0)}, ${Math.round(afterPos.y ?? 0)}).`;
    }
    type Sized = {
      readonly dimensions?: {
        readonly width?: { readonly value?: number };
        readonly height?: { readonly value?: number };
      };
    };
    const beforeDim = (before as Sized | undefined)?.dimensions;
    const afterDim = (after as Sized).dimensions;
    if (
      afterDim &&
      beforeDim &&
      (afterDim.width?.value !== beforeDim.width?.value || afterDim.height?.value !== beforeDim.height?.value)
    ) {
      return `Resize "${label}" to ${Math.round(afterDim.width?.value ?? 0)} x ${Math.round(afterDim.height?.value ?? 0)}.`;
    }
  }
  return `Edit "${label}" via ${tool}.`;
}

function diagnosticForResponse(response: McpResponseEnvelope, step: AgentPlanStep): AgentDiagnostic {
  const error = response.errors[0];
  let code: AgentDiagnostic["code"] = "AGENT_STEP_FAILED";
  if (error?.code === "MCP_DOCUMENT_VERSION_CONFLICT") code = "AGENT_VERSION_CONFLICT";
  else if (error?.code === "MCP_TIMEOUT") code = "AGENT_TOOL_TIMEOUT";
  else if (error?.code === "MCP_AUTHORIZATION_DENIED" || error?.code === "MCP_WORKSPACE_ACCESS_DENIED")
    code = "AGENT_PERMISSION_DENIED";
  else if (error?.code === "MCP_TOOL_NOT_FOUND" || error?.code === "MCP_TOOL_DISABLED") code = "AGENT_TOOL_UNAVAILABLE";
  return {
    code,
    severity: "ERROR",
    message: error?.message ?? `Agent step ${step.id} failed.`,
    recoverable: error?.recoverable ?? false,
    stepId: step.id,
    ...(step.tool ? { tool: step.tool } : {}),
    ...(error?.code ? { details: { mcpCode: error.code } } : {}),
  };
}

interface InterpretableNode {
  readonly name?: string;
  readonly transform?: { readonly position?: { readonly x?: number; readonly y?: number; readonly z?: number } };
  readonly dimensions?: {
    readonly width?: { readonly value?: number };
    readonly height?: { readonly value?: number };
  };
}

/**
 * Deterministic, rule-based natural-language interpretation of a node edit request — no LLM, no
 * network call. Runs here (server-side, plan-execution time) rather than in Studio's UI, because
 * only here does the interpreter see the node's REAL current state (fetched by the READ step that
 * always precedes this in nodeUpdatePlan): a relocation of the same rule set Studio's UI used to
 * run blind before this block, not a rewrite of its capabilities. Real, honest failure — an
 * unrecognized prompt throws rather than guessing, exactly as NODE_OFFSET_Y already does above for
 * a missing transform.
 */
function interpretNodeEditPrompt(input: Record<string, unknown>): Record<string, unknown> {
  const source = input.source as { nodes?: Array<Record<string, unknown>> } | undefined;
  const node = (source?.nodes?.find((entry) => entry.id === input.nodeId) ?? source?.nodes?.[0]) as
    | InterpretableNode
    | undefined;
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const viewportWidth = typeof input.viewportWidth === "number" ? input.viewportWidth : 1440;
  if (!node) throw new Error("Target node is unavailable for prompt interpretation.");

  const renameMatch = prompt.match(/rename(?: it| this)? to ["']?([^"'.]+)["']?/i);
  if (renameMatch?.[1]?.trim()) {
    return { changes: { name: renameMatch[1].trim() } };
  }

  const text = prompt.toLowerCase();
  if (text.includes("center")) {
    const width = node.dimensions?.width?.value ?? 0;
    const position = node.transform?.position;
    if (!position || typeof position.x !== "number") {
      throw new Error("Target node transform is unavailable for centering.");
    }
    const x = Math.round((viewportWidth - width) / 2);
    return { changes: { transform: { ...node.transform, position: { ...position, x } } } };
  }

  const resizeFactor = /\b(bigger|larger|grow)\b/.test(text)
    ? 1.2
    : /\b(smaller|shrink)\b/.test(text)
      ? 0.8
      : undefined;
  if (resizeFactor !== undefined) {
    const width = node.dimensions?.width;
    const height = node.dimensions?.height;
    if (!width || !height || typeof width.value !== "number" || typeof height.value !== "number") {
      throw new Error("Target node has no dimensions to resize.");
    }
    return {
      changes: {
        dimensions: {
          ...node.dimensions,
          width: { ...width, value: Math.round(width.value * resizeFactor) },
          height: { ...height, value: Math.round(height.value * resizeFactor) },
        },
      },
    };
  }

  const directions: Record<string, { readonly axis: "x" | "y"; readonly sign: 1 | -1 }> = {
    right: { axis: "x", sign: 1 },
    left: { axis: "x", sign: -1 },
    down: { axis: "y", sign: 1 },
    up: { axis: "y", sign: -1 },
  };
  for (const [word, { axis, sign }] of Object.entries(directions)) {
    if (!text.includes(word)) continue;
    const position = node.transform?.position;
    if (!position || typeof position[axis] !== "number") {
      throw new Error("Target node transform is unavailable for a directional move.");
    }
    const distanceMatch = text.match(/(\d+)\s*px/);
    const distance = (distanceMatch?.[1] ? Number(distanceMatch[1]) : 20) * sign;
    const nextValue = position[axis] + distance;
    return { changes: { transform: { ...node.transform, position: { ...position, [axis]: nextValue } } } };
  }

  throw new Error(
    `Could not map "${prompt}" to a supported edit. Try things like "center it", "make it bigger", "move right 40px", or "rename to New name".`,
  );
}

interface CompoundEditClauseInput {
  readonly raw: string;
  readonly targetKeyword: string | null;
  readonly operation: "RESIZE" | "MOVE" | "RECOLOR_FILL" | "ADD_BORDER" | "RENAME";
  readonly params: Record<string, unknown>;
  readonly needsToken: boolean;
}

type CompoundNode = Record<string, unknown> & { readonly id: string };

function nodeArea(node: CompoundNode): number {
  const dims = node.dimensions as { width?: { value?: number }; height?: { value?: number } } | undefined;
  return (dims?.width?.value ?? 0) * (dims?.height?.value ?? 0);
}

function nodeMaxFontSize(node: CompoundNode): number {
  const runs = node.runs as Array<{ style?: { size?: { value?: number } } }> | undefined;
  if (!runs?.length) return 0;
  return Math.max(...runs.map((run) => run.style?.size?.value ?? 0));
}

/**
 * Real, document-aware target resolution (Block E, E2) — "the headline" resolves against the
 * ACTUAL current document's real node names/types/content, never a blind guess. Name substring
 * match wins first (most reliable, most literal); a small set of type-synonym fallbacks (real
 * document data: node type + computed area/font-size, not fabricated) covers common design nouns
 * that rarely appear literally in a node's name. Throws — honestly, listing the exact keyword that
 * failed — rather than guessing when nothing plausible exists.
 */
function resolveCompoundEditTarget(
  nodes: readonly CompoundNode[],
  keyword: string | null,
  previousNodeId: string | undefined,
): CompoundNode {
  if (!keyword) {
    const previous = previousNodeId ? nodes.find((node) => node.id === previousNodeId) : undefined;
    if (!previous) {
      throw new Error("A clause has no named target and there is no earlier resolved target to continue from.");
    }
    return previous;
  }
  const lower = keyword.toLowerCase();
  const byName = nodes.find(
    (node) => typeof node.name === "string" && (node.name as string).toLowerCase().includes(lower),
  );
  if (byName) return byName;
  const byArea = (order: 1 | -1) => (a: CompoundNode, b: CompoundNode) =>
    order * (nodeArea(b) - nodeArea(a)) || a.id.localeCompare(b.id);
  if (["product", "image", "photo", "picture", "logo"].includes(lower)) {
    const [match] = nodes.filter((node) => node.type === "IMAGE").sort(byArea(1));
    if (match) return match;
  }
  if (lower === "headline" || lower === "title") {
    const [match] = nodes
      .filter((node) => node.type === "TEXT")
      .sort((a, b) => nodeMaxFontSize(b) - nodeMaxFontSize(a) || a.id.localeCompare(b.id));
    if (match) return match;
  }
  if (["text", "body", "copy"].includes(lower)) {
    const [match] = nodes
      .filter((node) => node.type === "TEXT")
      .sort((a, b) => nodeMaxFontSize(a) - nodeMaxFontSize(b) || a.id.localeCompare(b.id));
    if (match) return match;
  }
  if (["background", "backdrop", "frame", "card"].includes(lower)) {
    const [match] = nodes.filter((node) => node.type === "SHAPE" || node.type === "FRAME").sort(byArea(1));
    if (match) return match;
  }
  if (lower === "button") {
    const [match] = nodes.filter((node) => node.type === "SHAPE").sort(byArea(-1));
    if (match) return match;
  }
  throw new Error(`Could not resolve target "${keyword}" to any node in the current document.`);
}

function compoundEditColorToken(color: { r: number; g: number; b: number }): {
  readonly id: string;
  readonly name: string;
  readonly type: "COLOR";
  readonly value: { r: number; g: number; b: number; a: number; colorSpace: "SRGB" };
} {
  const id = createEntityId("token");
  return {
    id,
    name: `color.compound-edit.${id.slice(-8)}`,
    type: "COLOR",
    value: { r: color.r / 255, g: color.g / 255, b: color.b / 255, a: 1, colorSpace: "SRGB" },
  };
}

/** Real, per-operation-kind changes computed from the resolved node's ACTUAL current state — the
 * same "read the real value, then compute the new one" discipline interpretNodeEditPrompt already
 * established, just covering more operation kinds (recolor, border) that a single-node edit never
 * needed. Never a hardcoded/fabricated change; every branch throws honestly when the resolved
 * node's real state can't support the requested operation (e.g. resizing a node with no
 * dimensions, or adding a stroke to a non-SHAPE node). */
function computeCompoundEditChanges(
  node: CompoundNode,
  clause: CompoundEditClauseInput,
): { changes: Record<string, unknown>; tokenToRegister: unknown } {
  if (clause.operation === "RENAME") {
    return { changes: { name: clause.params.name }, tokenToRegister: null };
  }
  if (clause.operation === "RESIZE") {
    const dims = node.dimensions as { width?: { value?: number }; height?: { value?: number } } | undefined;
    if (!dims?.width || !dims.height || typeof dims.width.value !== "number" || typeof dims.height.value !== "number") {
      throw new Error(`"${clause.raw}" targets a node with no dimensions to resize.`);
    }
    const factor = Number(clause.params.factor) || 1;
    return {
      changes: {
        dimensions: {
          ...dims,
          width: { ...dims.width, value: Math.round(dims.width.value * factor) },
          height: { ...dims.height, value: Math.round(dims.height.value * factor) },
        },
      },
      tokenToRegister: null,
    };
  }
  if (clause.operation === "MOVE") {
    const transform = node.transform as { position?: { x?: number; y?: number } } | undefined;
    if (!transform?.position || typeof transform.position.x !== "number" || typeof transform.position.y !== "number") {
      throw new Error(`"${clause.raw}" targets a node with no transform to move.`);
    }
    const { x, y } = transform.position;
    const direction = String(clause.params.direction);
    const distance = Number(clause.params.distance) || 20;
    const isHorizontal = direction === "left" || direction === "right";
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    const nextPosition = isHorizontal ? { x: x + distance * sign, y } : { x, y: y + distance * sign };
    return {
      changes: { transform: { ...transform, position: { ...transform.position, ...nextPosition } } },
      tokenToRegister: null,
    };
  }
  if (clause.operation === "RECOLOR_FILL") {
    if (node.type !== "SHAPE" && node.type !== "TEXT") {
      throw new Error(`"${clause.raw}" targets a ${String(node.type)} node, which has no fill to recolor.`);
    }
    const token = compoundEditColorToken(clause.params.color as { r: number; g: number; b: number });
    if (node.type === "SHAPE") {
      return { changes: { fillTokenId: token.id }, tokenToRegister: token };
    }
    const runs = (node.runs as Array<{ start: number; end: number; style: Record<string, unknown> }>).map((run) => ({
      ...run,
      style: { ...run.style, fillTokenId: token.id },
    }));
    return { changes: { runs }, tokenToRegister: token };
  }
  if (clause.operation === "ADD_BORDER") {
    if (node.type !== "SHAPE") {
      throw new Error(`"${clause.raw}" targets a ${String(node.type)} node; only SHAPE nodes support a stroke.`);
    }
    const token = compoundEditColorToken(clause.params.color as { r: number; g: number; b: number });
    const width = Number(clause.params.width) || 1;
    const geometry = (node.geometry as Record<string, unknown> | undefined) ?? {};
    const stroke = (geometry.stroke as Record<string, unknown> | undefined) ?? {};
    return {
      changes: { strokeTokenId: token.id, geometry: { ...geometry, stroke: { ...stroke, width } } },
      tokenToRegister: token,
    };
  }
  throw new Error(`"${clause.raw}" uses an unsupported compound edit operation.`);
}

function resolveCompoundEdit(input: Record<string, unknown>): Record<string, unknown> {
  const source = input.source as { nodes?: Record<string, CompoundNode> } | undefined;
  const nodes = Object.values(source?.nodes ?? {});
  if (nodes.length === 0) throw new Error("The current document has no nodes to target.");
  const clauses = (input.clauses ?? []) as readonly CompoundEditClauseInput[];
  if (clauses.length === 0) throw new Error("No compound edit clauses were provided to resolve.");
  let previousNodeId: string | undefined;
  const resolved = clauses.map((clause) => {
    const node = resolveCompoundEditTarget(nodes, clause.targetKeyword, previousNodeId);
    previousNodeId = node.id;
    const { changes, tokenToRegister } = computeCompoundEditChanges(node, clause);
    return { nodeId: node.id, changes, tokenToRegister };
  });
  return { resolved };
}

function analyzeStep(input: Record<string, unknown>): Record<string, unknown> {
  if (input.operation === "RESOLVE_COMPOUND_EDIT") return resolveCompoundEdit(input);
  if (input.operation === "INTERPRET_NODE_EDIT_PROMPT") return interpretNodeEditPrompt(input);
  if (input.operation === "NODE_OFFSET_Y") {
    const source = input.source as { nodes?: Array<Record<string, unknown>> } | undefined;
    const node = source?.nodes?.find((entry) => entry.id === input.nodeId) ?? source?.nodes?.[0];
    const transform = structuredClone(node?.transform) as
      | { position?: { x?: number; y?: number; z?: number } }
      | undefined;
    if (!transform?.position || typeof transform.position.y !== "number" || typeof input.deltaY !== "number") {
      throw new Error("Target node transform is unavailable for offset analysis.");
    }
    transform.position.y += input.deltaY;
    return { changes: { transform }, expectedY: transform.position.y };
  }
  if (input.operation === "NODE_CHANGES") return { changes: structuredClone(input.changes ?? {}) };
  if (input.operation === "THREE_OFFSET_X") {
    const source = input.source as { nodes?: Array<Record<string, unknown>> } | undefined;
    const node = source?.nodes?.find((entry) => entry.id === input.nodeId) ?? source?.nodes?.[0];
    const transform = structuredClone(node?.transform) as
      | { position?: { x?: number; y?: number; z?: number } }
      | undefined;
    if (!transform?.position || typeof transform.position.x !== "number" || typeof input.deltaX !== "number") {
      throw new Error("Target 3D node transform is unavailable for offset analysis.");
    }
    transform.position.x += input.deltaX;
    return { transform, expectedX: transform.position.x };
  }
  if (input.operation === "BLENDER_OFFSET_X") {
    const source = input.source as { nodes?: Array<Record<string, unknown>> } | undefined;
    const node = source?.nodes?.find((entry) => entry.id === input.nodeId) ?? source?.nodes?.[0];
    const position = (node?.transform as { position?: { x?: number } } | undefined)?.position;
    if (!position || typeof position.x !== "number" || typeof input.deltaX !== "number") {
      throw new Error("Target Blender object transform is unavailable for offset analysis.");
    }
    return { expectedX: Math.round((position.x + input.deltaX) * 1_000_000) / 1_000_000 };
  }
  if (input.operation === "BLENDER_BEVEL") {
    const inspection = input.inspection as { faceCount?: number; edgeCount?: number } | undefined;
    if (!inspection || typeof inspection.faceCount !== "number" || typeof inspection.edgeCount !== "number") {
      throw new Error("Target topology is unavailable for bevel analysis.");
    }
    return {
      currentFaces: inspection.faceCount,
      currentEdges: inspection.edgeCount,
      expectedImpact: "TOPOLOGY_CHANGING",
    };
  }
  if (input.operation === "BLENDER_UV_REPAIR") {
    const inspection = input.inspection as { layerCount?: number; diagnostics?: unknown[] } | undefined;
    if (!inspection || typeof inspection.layerCount !== "number") {
      throw new Error("Target UV report is unavailable for repair analysis.");
    }
    return {
      currentLayers: inspection.layerCount,
      issueCount: inspection.diagnostics?.length ?? 0,
      strategy: "UNWRAP_AND_PACK",
    };
  }
  return { analysis: "NO_OP" };
}

function protectedViolation(
  session: AgentSession,
  step: AgentPlanStep,
  input: Record<string, unknown>,
): string | undefined {
  if (
    step.tool !== "node.update" &&
    step.tool !== "three.update_node_transform" &&
    step.tool !== "blender.update_object_transform" &&
    step.tool !== "three.bevel_mesh" &&
    step.tool !== "three.unwrap_uv" &&
    step.tool !== "three.update_pbr_material"
  )
    return undefined;
  const nodeId =
    typeof input.nodeId === "string" ? input.nodeId : typeof input.targetId === "string" ? input.targetId : undefined;
  const changes =
    step.tool === "three.update_node_transform" || step.tool === "blender.update_object_transform"
      ? ["transform"]
      : step.tool === "three.bevel_mesh"
        ? ["geometry", "topology"]
        : step.tool === "three.unwrap_uv"
          ? ["geometry", "uv"]
          : step.tool === "three.update_pbr_material"
            ? ["material"]
            : input.changes && typeof input.changes === "object"
              ? Object.keys(input.changes as object)
              : [];
  return session.constraints.protectedProperties.find((property) => {
    if (property.nodeId && property.nodeId !== nodeId) return false;
    return changes.some((changed) => property.property === changed || property.property.startsWith(`${changed}.`));
  })?.property;
}

function withRunState(run: AgentRun, changes: Partial<AgentRun>): AgentRun {
  const body = { ...run, ...changes };
  return AgentRunSchema.parse({
    ...body,
    fingerprint: fingerprint({ ...body, startedAt: undefined, completedAt: undefined }),
  });
}

function withSessionStatus(session: AgentSession, status: AgentSession["status"]): AgentSession {
  const body = { ...session, status };
  return AgentSessionSchema.parse({ ...body, fingerprint: fingerprint({ ...body, createdAt: undefined }) });
}

export function createAgentEngine(options: AgentEngineOptions) {
  const now = options.now ?? Date.now;
  return Object.freeze({
    async execute(input: ExecuteAgentInput): Promise<AgentExecutionResult> {
      const started = now();
      let session = input.session;
      let run = createAgentRun({ session, startedAt: new Date(started).toISOString() });
      let plan: AgentPlan | undefined;
      const observations: AgentObservation[] = [];
      const audits: AgentAuditRecord[] = [];
      let memory = createWorkingMemory({ runId: run.id });
      let currentDocumentVersion: number | undefined;
      const executionTimeout = new AbortController();
      const timer = setTimeout(
        () => executionTimeout.abort(new Error("Agent execution timeout.")),
        input.session.budget.maxExecutionMs,
      );
      const signal = input.cancellationSignal
        ? AbortSignal.any([input.cancellationSignal, executionTimeout.signal])
        : executionTimeout.signal;

      const persistRun = async (): Promise<void> => {
        await options.persistence.saveRun(run);
      };
      const addObservation = async (observation: AgentObservation): Promise<void> => {
        observations.push(observation);
        await options.persistence.saveObservation(observation);
        memory = updateWorkingMemory(memory, {
          lastObservationIds: observations.slice(-20).map((entry) => entry.id),
          ...(observation.documentVersion ? { currentDocumentVersion: observation.documentVersion } : {}),
        });
      };
      const block = async (
        diagnostic: AgentDiagnostic,
        status: "BLOCKED" | "FAILED" | "CANCELLED" = "BLOCKED",
      ): Promise<void> => {
        const outcome = createAgentOutcome({ status, summary: diagnostic.message, diagnostics: [diagnostic] });
        run = withRunState(run, {
          status,
          completedAt: new Date(now()).toISOString(),
          observations: [...observations],
          outcome,
        });
        session = withSessionStatus(session, status);
        await Promise.all([persistRun(), options.persistence.saveSession(session)]);
      };

      try {
        session = withSessionStatus(session, "PLANNING");
        await options.persistence.saveSession(session);
        run = withRunState(run, { status: "PLANNING" });
        await persistRun();

        const context = assembleAgentContext({
          goal: input.session.goal,
          records: input.contextRecords,
          recentObservations: observations,
          budget: { ...options.contextBudget, maxCharacters: input.session.budget.maxContextSize },
          ...(currentDocumentVersion ? { currentDocumentVersion } : {}),
          preservedConstraintIds: input.session.constraints.protectedProperties.map(
            (entry) => `${entry.nodeId ?? "*"}:${entry.property}`,
          ),
        });
        const intent = options.reasoningProvider.analyzeIntent({ session, context });
        if (intent.ambiguities.length > 0) {
          await block({
            code: "AGENT_TARGET_AMBIGUOUS",
            severity: "ERROR",
            message: intent.ambiguities.join(" "),
            recoverable: true,
          });
          return { session, run, observations, audits, workingMemory: memory };
        }
        const capabilitiesOutput = await options.mcpClient.discoverCapabilities(signal);
        run = withRunState(run, { counters: { ...run.counters, toolCalls: run.counters.toolCalls + 1 } });
        const capabilityStepId = deterministicAgentId("agent-step", {
          runId: run.id,
          operation: "system.get_capabilities",
        });
        const capabilityObservation = createAgentObservation({
          runId: run.id,
          stepId: capabilityStepId,
          type: "TOOL_RESULT",
          success: true,
          data: { data: capabilitiesOutput },
          createdAt: new Date(now()).toISOString(),
        });
        await addObservation(capabilityObservation);
        const capabilityAudit = createAgentAuditRecord({
          sessionId: input.session.id,
          runId: run.id,
          stepId: capabilityStepId,
          actorId: input.session.actorId,
          goalId: input.session.goal.id,
          correlationId: run.correlationId,
          tool: "system.get_capabilities",
          toolResult: "SUCCEEDED",
          writeStatus: "NONE",
          durationMs: 0,
          timestamp: new Date(now()).toISOString(),
        });
        audits.push(capabilityAudit);
        await options.persistence.appendAudit(capabilityAudit);
        const capabilities = createAgentCapabilities(capabilitiesOutput.tools, [...input.actorPermissions]);
        plan = options.reasoningProvider.generatePlan({ session, intent, context, capabilities });
        const validation = validatePlan(plan);
        await options.persistence.savePlan(plan);
        if (!validation.valid) {
          await block(
            validation.diagnostics[0] ?? {
              code: "AGENT_PLAN_INVALID",
              severity: "ERROR",
              message: "Plan validation failed.",
              recoverable: false,
            },
            "FAILED",
          );
          return { session, run, plan, observations, audits, workingMemory: memory };
        }
        if (plan.capabilityGaps.length > 0) {
          const permission = plan.capabilityGaps.some((gap) => gap.reason === "PERMISSION_DENIED");
          await block({
            code: permission ? "AGENT_PERMISSION_DENIED" : "AGENT_CAPABILITY_MISSING",
            severity: "ERROR",
            message: plan.capabilityGaps.map((gap) => `${gap.capability}: ${gap.suggestedAction}`).join(" "),
            recoverable: true,
            details: { capabilities: plan.capabilityGaps.map((gap) => gap.capability) },
          });
          return { session, run, plan, observations, audits, workingMemory: memory };
        }

        run = withRunState(run, { status: "EXECUTING", planId: plan.id });
        session = withSessionStatus(session, "EXECUTING");
        await Promise.all([persistRun(), options.persistence.saveSession(session)]);
        let replanRequested = false;
        do {
          replanRequested = false;
          const ordered = validatePlan(plan).orderedStepIds;
          const byId = new Map(plan.steps.map((entry) => [entry.id, entry]));
          for (const stepId of ordered) {
            const step = byId.get(stepId);
            if (!step) continue;
            if (signal.aborted) {
              const timedOut = executionTimeout.signal.aborted && !input.cancellationSignal?.aborted;
              await block(
                {
                  code: timedOut ? "AGENT_EXECUTION_TIMEOUT" : "AGENT_CANCELLED",
                  severity: "ERROR",
                  message: timedOut
                    ? "Agent execution exceeded its bounded duration."
                    : "Agent execution was cancelled between steps.",
                  recoverable: !timedOut,
                  stepId,
                },
                timedOut ? "FAILED" : "CANCELLED",
              );
              return { session, run, plan, observations, audits, workingMemory: memory };
            }
            if (run.counters.steps >= input.session.budget.maxSteps) {
              await block({
                code: "AGENT_STEP_LIMIT",
                severity: "ERROR",
                message: "Agent step budget exhausted.",
                recoverable: false,
              });
              return { session, run, plan, observations, audits, workingMemory: memory };
            }
            if (step.tool && run.counters.toolCalls >= input.session.budget.maxToolCalls) {
              await block({
                code: "AGENT_TOOL_CALL_LIMIT",
                severity: "ERROR",
                message: "Agent tool-call budget exhausted.",
                recoverable: false,
              });
              return { session, run, plan, observations, audits, workingMemory: memory };
            }
            if (step.type === "WRITE" && run.counters.writes >= input.session.budget.maxWrites) {
              await block({
                code: "AGENT_WRITE_LIMIT",
                severity: "ERROR",
                message: "Agent write budget exhausted.",
                recoverable: false,
              });
              return { session, run, plan, observations, audits, workingMemory: memory };
            }

            const stepStarted = now();
            let observation: AgentObservation;
            let toolResult: AgentAuditRecord["toolResult"] = "NOT_CALLED";
            let writeStatus: AgentAuditRecord["writeStatus"] = "NONE";
            let failureCode: AgentDiagnostic["code"] | undefined;
            run = withRunState(run, { counters: { ...run.counters, steps: run.counters.steps + 1 } });
            try {
              const resolved = resolveInput(step, observations);
              const protectedProperty = protectedViolation(session, step, resolved);
              if (protectedProperty) {
                throw Object.assign(new Error(`Protected property ${protectedProperty} cannot be modified.`), {
                  agentCode: "AGENT_PERMISSION_DENIED",
                });
              }

              if (step.type === "ANALYZE") {
                const data = analyzeStep(resolved);
                observation = createAgentObservation({
                  runId: run.id,
                  stepId,
                  type: "ANALYSIS",
                  success: true,
                  data,
                  createdAt: new Date(now()).toISOString(),
                });
              } else if (step.type === "VERIFY") {
                const verification = options.reasoningProvider.verifyCompletion({ plan, observations });
                observation = createAgentObservation({
                  runId: run.id,
                  stepId,
                  type: "VERIFICATION",
                  success: verification.success,
                  data: verification,
                  diagnostics: verification.diagnostics,
                  createdAt: new Date(now()).toISOString(),
                });
                if (!verification.success) failureCode = "AGENT_VERIFICATION_FAILED";
              } else if (!step.tool) {
                observation = createAgentObservation({
                  runId: run.id,
                  stepId,
                  type: step.type === "COMPLETE" ? "VERIFICATION" : "PLAN",
                  success: true,
                  data: { status: step.type },
                  createdAt: new Date(now()).toISOString(),
                });
              } else {
                if (step.requiresApproval && step.type === "WRITE") {
                  // Real, derived approval context (post-D5 cleanup) — nodeId/before come from an
                  // actual earlier READ step in this same run, never invented; after is that real
                  // state shallow-merged with the real computed changes this write is about to
                  // apply, a genuine preview, not a guess.
                  const nodeId =
                    typeof resolved.nodeId === "string"
                      ? resolved.nodeId
                      : typeof resolved.sourceNodeId === "string"
                        ? resolved.sourceNodeId
                        : undefined;
                  const before =
                    plan && nodeId ? findPrecedingNodeSnapshot(plan, step, observations, nodeId) : undefined;
                  const changes = (resolved as { changes?: Record<string, unknown> }).changes;
                  const after = before && changes ? { ...before, ...changes } : undefined;
                  const request = AgentApprovalRequestSchema.parse({
                    sessionId: session.id,
                    runId: run.id,
                    stepId,
                    tool: step.tool,
                    classification: step.safety,
                    policy:
                      step.safety === "DESTRUCTIVE_WRITE"
                        ? "REQUIRE_DESTRUCTIVE_APPROVAL"
                        : "REQUIRE_ALL_WRITE_APPROVAL",
                    inputFingerprint: fingerprint(resolved),
                    ...(nodeId ? { nodeId } : {}),
                    ...(step.label ? { operation: step.label } : {}),
                    ...(before ? { before } : {}),
                    ...(after ? { after } : {}),
                    summary: describeApprovalChange(step.tool, nodeId, before, after),
                  });
                  const decision =
                    step.safety === "DESTRUCTIVE_WRITE" && !session.constraints.allowDestructiveOperations
                      ? {
                          approved: false as const,
                          source: "POLICY" as const,
                          reason: "Session constraints prohibit destructive operations.",
                          decidedAt: new Date(now()).toISOString(),
                        }
                      : await options.approvalAdapter.decide(request);
                  if (!decision.approved) {
                    observation = createAgentObservation({
                      runId: run.id,
                      stepId,
                      type: "APPROVAL",
                      success: false,
                      data: decision,
                      diagnostics: [
                        {
                          code: "AGENT_APPROVAL_REJECTED",
                          severity: "ERROR",
                          message: decision.reason,
                          recoverable: true,
                          stepId,
                          tool: step.tool,
                        },
                      ],
                      createdAt: new Date(now()).toISOString(),
                    });
                    failureCode = "AGENT_APPROVAL_REJECTED";
                    toolResult = "DENIED";
                    writeStatus = "REJECTED";
                    await addObservation(observation);
                    await block(observation.diagnostics[0] as AgentDiagnostic);
                    return { session, run, plan, observations, audits, workingMemory: memory };
                  }
                }
                const isWrite = step.type === "WRITE";
                const dryRun = step.type === "DRY_RUN";
                const idempotencyKey =
                  isWrite || dryRun
                    ? deterministicIdempotencyKey({
                        sessionId: session.id,
                        runId: run.id,
                        stepId,
                        tool: step.tool,
                        input: resolved,
                      })
                    : undefined;
                let retryCount = 0;
                const response = await options.mcpClient.invoke(step.tool, resolved, {
                  dryRun,
                  ...(idempotencyKey ? { idempotencyKey } : {}),
                  signal,
                  maxRetries: Math.min(
                    session.budget.maxRetries - run.counters.retries,
                    step.retryPolicy.maxAttempts - 1,
                  ),
                  retryBackoffMs: step.retryPolicy.backoffMs,
                  onRetry: () => {
                    retryCount += 1;
                  },
                });
                run = withRunState(run, {
                  counters: {
                    ...run.counters,
                    toolCalls: run.counters.toolCalls + 1 + retryCount,
                    retries: run.counters.retries + retryCount,
                    writes: run.counters.writes + (isWrite && response.success ? 1 : 0),
                  },
                });
                toolResult = response.success ? "SUCCEEDED" : "FAILED";
                writeStatus = dryRun ? "DRY_RUN" : isWrite && response.success ? "COMMITTED" : "NONE";
                const diagnostic = response.success ? [] : [diagnosticForResponse(response, step)];
                failureCode = diagnostic[0]?.code;
                currentDocumentVersion = response.documentVersion ?? currentDocumentVersion;
                observation = createAgentObservation({
                  runId: run.id,
                  stepId,
                  type: "TOOL_RESULT",
                  success: response.success,
                  data: response,
                  diagnostics: diagnostic,
                  ...(response.documentVersion ? { documentVersion: response.documentVersion } : {}),
                  createdAt: new Date(now()).toISOString(),
                });
                if (!response.success && classifyMcpFailure(response) === "REPLAN_REQUIRED") replanRequested = true;
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : "Agent step failed.";
              const code =
                (error as { agentCode?: AgentDiagnostic["code"] }).agentCode ??
                (signal.aborted
                  ? executionTimeout.signal.aborted
                    ? "AGENT_EXECUTION_TIMEOUT"
                    : "AGENT_CANCELLED"
                  : message.toLowerCase().includes("timeout")
                    ? "AGENT_TOOL_TIMEOUT"
                    : "AGENT_STEP_FAILED");
              failureCode = code;
              observation = createAgentObservation({
                runId: run.id,
                stepId,
                type: "TOOL_RESULT",
                success: false,
                diagnostics: [
                  {
                    code,
                    severity: "ERROR",
                    message: message.slice(0, 1_000),
                    recoverable: false,
                    stepId,
                    ...(step.tool ? { tool: step.tool } : {}),
                  },
                ],
                createdAt: new Date(now()).toISOString(),
              });
            }

            await addObservation(observation);
            const audit = createAgentAuditRecord({
              sessionId: session.id,
              runId: run.id,
              stepId,
              actorId: session.actorId,
              goalId: session.goal.id,
              correlationId: run.correlationId,
              ...(step.tool ? { tool: step.tool } : {}),
              toolResult,
              writeStatus,
              ...(observation.documentVersion ? { documentVersion: observation.documentVersion } : {}),
              ...(step.type === "VERIFY" ? { verificationSuccess: observation.success } : {}),
              ...(failureCode ? { failureCode } : {}),
              durationMs: Math.max(0, now() - stepStarted),
              timestamp: new Date(now()).toISOString(),
            });
            audits.push(audit);
            await options.persistence.appendAudit(audit);
            await persistRun();

            if (!observation.success) {
              if (replanRequested) break;
              await block(
                observation.diagnostics[0] ?? {
                  code: "AGENT_STEP_FAILED",
                  severity: "ERROR",
                  message: "Agent step failed.",
                  recoverable: false,
                  stepId,
                },
                failureCode === "AGENT_VERIFICATION_FAILED" ? "FAILED" : "BLOCKED",
              );
              return { session, run, plan, observations, audits, workingMemory: memory };
            }
          }

          if (replanRequested) {
            if (run.counters.replans >= input.session.budget.maxReplans) {
              await block({
                code: "AGENT_REPLAN_LIMIT",
                severity: "ERROR",
                message: "Agent replanning budget exhausted.",
                recoverable: false,
              });
              return { session, run, plan, observations, audits, workingMemory: memory };
            }
            run = withRunState(run, {
              status: "REPLANNING",
              counters: { ...run.counters, replans: run.counters.replans + 1 },
            });
            const refreshed = await options.mcpClient.invoke("project.get", {}, { signal });
            run = withRunState(run, { counters: { ...run.counters, toolCalls: run.counters.toolCalls + 1 } });
            if (refreshed.success) {
              const version = valueAtPath(refreshed, "data.currentDocumentVersion");
              if (typeof version === "number") currentDocumentVersion = version;
            }
            const nextContext = assembleAgentContext({
              goal: input.session.goal,
              records: input.contextRecords,
              recentObservations: observations,
              budget: { ...options.contextBudget, maxCharacters: input.session.budget.maxContextSize },
              ...(currentDocumentVersion ? { currentDocumentVersion } : {}),
            });
            const nextCapabilitiesOutput = await options.mcpClient.discoverCapabilities(signal);
            run = withRunState(run, {
              counters: { ...run.counters, toolCalls: run.counters.toolCalls + 1 },
              status: "EXECUTING",
            });
            const nextCapabilities = createAgentCapabilities(nextCapabilitiesOutput.tools, [...input.actorPermissions]);
            plan = options.reasoningProvider.generatePlan({
              session,
              intent,
              context: nextContext,
              capabilities: nextCapabilities,
            });
            await options.persistence.savePlan(plan);
          }
        } while (replanRequested);

        run = withRunState(run, { status: "VERIFYING" });
        session = withSessionStatus(session, "VERIFYING");
        const verification = options.reasoningProvider.verifyCompletion({ plan, observations });
        if (!verification.success) {
          await block(
            {
              code: "AGENT_VERIFICATION_FAILED",
              severity: "ERROR",
              message: "Final agent verification failed.",
              recoverable: true,
            },
            "FAILED",
          );
        } else {
          const outcome = createAgentOutcome({
            status: "SUCCEEDED",
            summary: "Agent plan completed and explicit verification passed.",
            ...(currentDocumentVersion ? { finalDocumentVersion: currentDocumentVersion } : {}),
            verification,
            diagnostics: [],
          });
          run = withRunState(run, {
            status: "SUCCEEDED",
            completedAt: new Date(now()).toISOString(),
            observations: [...observations],
            outcome,
          });
          session = withSessionStatus(session, "COMPLETED");
          await Promise.all([persistRun(), options.persistence.saveSession(session)]);
        }
        return { session, run, plan, observations, audits, workingMemory: memory };
      } catch (error) {
        const timedOut = executionTimeout.signal.aborted && !input.cancellationSignal?.aborted;
        const cancelled = input.cancellationSignal?.aborted ?? false;
        await block(
          {
            code: timedOut ? "AGENT_EXECUTION_TIMEOUT" : cancelled ? "AGENT_CANCELLED" : "AGENT_STEP_FAILED",
            severity: "ERROR",
            message: (error instanceof Error ? error.message : "Agent execution failed.").slice(0, 1_000),
            recoverable: cancelled,
          },
          timedOut ? "FAILED" : cancelled ? "CANCELLED" : "FAILED",
        );
        return { session, run, ...(plan ? { plan } : {}), observations, audits, workingMemory: memory };
      } finally {
        clearTimeout(timer);
      }
    },
    async readiness() {
      return options.persistence.readiness();
    },
    async close() {
      await options.persistence.close();
    },
  });
}

export type AgentEngine = ReturnType<typeof createAgentEngine>;
