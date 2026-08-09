import {
  assembleAgentContext,
  createWorkingMemory,
  updateWorkingMemory,
  type AgentContextBudget,
  type AgentContextRecord,
  type AgentWorkingMemory,
} from "@aevum/agent-context";
import {
  AgentApprovalRequestSchema,
  AgentRunSchema,
  AgentSessionSchema,
  createAgentAuditRecord,
  createAgentObservation,
  createAgentOutcome,
  createAgentRun,
  deterministicAgentId,
  deterministicIdempotencyKey,
  fingerprint,
  type AgentAuditRecord,
  type AgentDiagnostic,
  type AgentObservation,
  type AgentRun,
  type AgentSession,
} from "@aevum/agent-core";
import {
  createAgentCapabilities,
  validatePlan,
  type AgentPlan,
  type AgentPlanStep,
  type AgentReasoningProvider,
} from "@aevum/agent-planner";
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

function analyzeStep(input: Record<string, unknown>): Record<string, unknown> {
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
  return { analysis: "NO_OP" };
}

function protectedViolation(
  session: AgentSession,
  step: AgentPlanStep,
  input: Record<string, unknown>,
): string | undefined {
  if (step.tool !== "node.update" && step.tool !== "three.update_node_transform") return undefined;
  const nodeId = typeof input.nodeId === "string" ? input.nodeId : undefined;
  const changes =
    step.tool === "three.update_node_transform"
      ? ["transform"]
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
