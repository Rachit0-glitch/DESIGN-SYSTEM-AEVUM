import type { AgentAuditRecord, AgentObservation, AgentRun, AgentSession } from "@aevum/agent-core";
import type { AgentPlan } from "@aevum/agent-planner";

export interface AgentPersistenceAdapter {
  saveSession(session: AgentSession): Promise<void>;
  saveRun(run: AgentRun): Promise<void>;
  savePlan(plan: AgentPlan): Promise<void>;
  saveObservation(observation: AgentObservation): Promise<void>;
  appendAudit(record: AgentAuditRecord): Promise<void>;
  getSession(id: string): Promise<AgentSession | undefined>;
  getRun(id: string): Promise<AgentRun | undefined>;
  listAudits(runId: string): Promise<readonly AgentAuditRecord[]>;
  readiness(): Promise<boolean>;
  close(): Promise<void>;
}

export function createInMemoryAgentPersistence(): AgentPersistenceAdapter {
  const sessions = new Map<string, AgentSession>();
  const runs = new Map<string, AgentRun>();
  const plans = new Map<string, AgentPlan>();
  const observations = new Map<string, AgentObservation>();
  const audits: AgentAuditRecord[] = [];
  const adapter: AgentPersistenceAdapter = {
    async saveSession(session) {
      sessions.set(session.id, structuredClone(session));
    },
    async saveRun(run) {
      runs.set(run.id, structuredClone(run));
    },
    async savePlan(plan) {
      plans.set(plan.id, structuredClone(plan));
    },
    async saveObservation(observation) {
      observations.set(observation.id, structuredClone(observation));
    },
    async appendAudit(record) {
      audits.push(structuredClone(record));
    },
    async getSession(id) {
      const value = sessions.get(id);
      return value ? structuredClone(value) : undefined;
    },
    async getRun(id) {
      const value = runs.get(id);
      return value ? structuredClone(value) : undefined;
    },
    async listAudits(runId) {
      return audits.filter((entry) => entry.runId === runId).map((entry) => structuredClone(entry));
    },
    async readiness() {
      return true;
    },
    async close() {
      sessions.clear();
      runs.clear();
      plans.clear();
      observations.clear();
      audits.length = 0;
    },
  };
  return Object.freeze(adapter);
}
