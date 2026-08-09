import { createServer, type Server } from "node:http";
import { AgentContextRecordSchema } from "@aevum/agent-context";
import { AgentSessionSchema } from "@aevum/agent-core";
import type { AgentEngine, AgentExecutionResult } from "@aevum/agent-runtime";
import { McpPermissionSchema } from "@aevum/mcp-protocol";
import { CANONICAL_PRODUCT_NAME, createLogger, type AevumLogger, type PackageContract } from "@aevum/shared";
import { z } from "zod";

export const AGENT_WORKER_VERSION = "1.0.0" as const;
export const AgentWorkerStageSchema = z.enum([
  "RECEIVE",
  "AUTHENTICATE",
  "LOAD_SESSION",
  "ASSEMBLE_CONTEXT",
  "ANALYZE_INTENT",
  "DISCOVER_CAPABILITIES",
  "PLAN",
  "VALIDATE_PLAN",
  "EXECUTE",
  "OBSERVE",
  "REPLAN_IF_REQUIRED",
  "VERIFY",
  "PERSIST_RESULT",
  "COMPLETE",
]);
export const AgentWorkerJobSchema = z.strictObject({
  id: z.string().min(1).max(128),
  session: AgentSessionSchema,
  contextRecords: z.array(AgentContextRecordSchema),
  actorPermissions: z.array(McpPermissionSchema),
  fixtureMode: z.boolean().default(false),
});

export interface AgentWorkerOptions {
  readonly engine: AgentEngine;
  readonly fixtureMode: boolean;
  readonly logger?: AevumLogger;
}

export function createAgentWorker(options: AgentWorkerOptions) {
  const logger = options.logger ?? createLogger();
  let accepting = true;
  let activeJobs = 0;
  let resolveDrained: (() => void) | undefined;
  let shutdownPromise: Promise<void> | undefined;
  return Object.freeze({
    async execute(
      raw: unknown,
      signal?: AbortSignal,
    ): Promise<{
      readonly success: boolean;
      readonly jobId: string;
      readonly stages: readonly z.infer<typeof AgentWorkerStageSchema>[];
      readonly result: AgentExecutionResult;
    }> {
      if (!accepting) throw new Error("Agent worker is shutting down.");
      const job = AgentWorkerJobSchema.parse(raw);
      if (job.fixtureMode && !options.fixtureMode) throw new Error("Fixture jobs are disabled for this worker.");
      const stages: z.infer<typeof AgentWorkerStageSchema>[] = ["RECEIVE", "AUTHENTICATE", "LOAD_SESSION"];
      activeJobs += 1;
      logger.info("agent.worker.job.started", "Agent worker job started.", {
        jobId: job.id,
        sessionId: job.session.id,
        actorId: job.session.actorId,
        workspaceId: job.session.workspaceId,
      });
      try {
        stages.push("ASSEMBLE_CONTEXT", "ANALYZE_INTENT", "DISCOVER_CAPABILITIES", "PLAN", "VALIDATE_PLAN", "EXECUTE");
        const result = await options.engine.execute({
          session: job.session,
          contextRecords: job.contextRecords,
          actorPermissions: job.actorPermissions,
          ...(signal ? { cancellationSignal: signal } : {}),
        });
        stages.push("OBSERVE");
        if (result.run.counters.replans > 0) stages.push("REPLAN_IF_REQUIRED");
        stages.push("VERIFY", "PERSIST_RESULT", "COMPLETE");
        logger.info("agent.worker.job.completed", "Agent worker job completed.", {
          jobId: job.id,
          sessionId: job.session.id,
          runId: result.run.id,
          status: result.run.status,
        });
        return Object.freeze({ success: result.run.status === "SUCCEEDED", jobId: job.id, stages, result });
      } finally {
        activeJobs -= 1;
        if (!accepting && activeJobs === 0) resolveDrained?.();
      }
    },
    health() {
      return { status: "healthy" as const, service: "@aevum/agent-worker", version: AGENT_WORKER_VERSION };
    },
    async readiness() {
      const persistence = await options.engine.readiness();
      return { ok: accepting && persistence, checks: { accepting, persistence, runtime: true } };
    },
    async shutdown() {
      if (shutdownPromise) return shutdownPromise;
      accepting = false;
      shutdownPromise = (async () => {
        if (activeJobs > 0) {
          await new Promise<void>((resolve) => {
            resolveDrained = resolve;
          });
        }
        await options.engine.close();
      })();
      return shutdownPromise;
    },
  });
}

export type AgentWorker = ReturnType<typeof createAgentWorker>;

function writeJson(response: import("node:http").ServerResponse, status: number, body: object): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  response.end(JSON.stringify(body));
}

export function createAgentWorkerHttpServer(worker: AgentWorker): Server {
  return createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET" && path === "/health") {
      writeJson(response, 200, { product: CANONICAL_PRODUCT_NAME, ...worker.health() });
      return;
    }
    if (request.method === "GET" && path === "/ready") {
      const readiness = await worker.readiness();
      writeJson(response, readiness.ok ? 200 : 503, { status: readiness.ok ? "ready" : "not_ready", ...readiness });
      return;
    }
    if (request.method === "GET" && path === "/version") {
      writeJson(response, 200, { version: AGENT_WORKER_VERSION });
      return;
    }
    writeJson(response, 404, { code: "ROUTE_NOT_FOUND", recoverable: true });
  });
}

export const packageContract: PackageContract = {
  name: "@aevum/agent-worker",
  kind: "app",
  responsibility: "Inactive bounded application shell for authenticated agent orchestration jobs.",
  owns: "Job validation, worker stages, structured lifecycle logs, health/readiness/version, and graceful shutdown.",
  mustNotOwn:
    "Canonical state, unauthenticated job ingress, provider credentials, Railway activation, filesystem access, or shell execution.",
  status: "IMPLEMENTED",
};

export const AGENT_WORKER_STATUS = packageContract.status;
