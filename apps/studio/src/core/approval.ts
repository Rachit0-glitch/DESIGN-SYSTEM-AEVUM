import { createApprovalDecision, type AgentApprovalRequest } from "@aevum/agent-core";
import type { AgentApprovalAdapter } from "@aevum/agent-runtime";

export interface StudioPendingApproval {
  readonly request: AgentApprovalRequest;
}

/**
 * A real, human-in-the-loop approval adapter (Block D5) — replaces the previous production wiring,
 * which called `createDeterministicApprovalAdapter()` with no arguments and therefore
 * auto-rejected every approval-gated step (its empty `approvedStepIds`/`approvedTools` sets never
 * matched anything). `decide()` genuinely suspends: it stores the request and does not resolve
 * until `approve()`/`reject()` is called from outside, driven by a real user clicking a button in
 * the Studio UI (see ApprovalPrompt in main.tsx). Only one request is ever pending at a time,
 * matching the engine's own sequential step execution.
 */
export interface StudioApprovalController {
  readonly adapter: AgentApprovalAdapter;
  getPending(): StudioPendingApproval | undefined;
  subscribe(listener: () => void): () => void;
  approve(): void;
  reject(reason?: string): void;
}

export function createInteractiveApprovalAdapter(): StudioApprovalController {
  let pending: { readonly request: AgentApprovalRequest; readonly resolve: (decision: unknown) => void } | undefined;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const settle = (approved: boolean, reason: string): void => {
    if (!pending) return;
    const { request, resolve } = pending;
    pending = undefined;
    resolve(
      createApprovalDecision(request, {
        approved,
        source: "USER",
        reason,
        decidedAt: new Date().toISOString(),
      }),
    );
    notify();
  };
  const adapter: AgentApprovalAdapter = {
    decide(request) {
      return new Promise((resolve) => {
        pending = { request, resolve: resolve as (decision: unknown) => void };
        notify();
      });
    },
  };
  return Object.freeze({
    adapter,
    getPending: () => (pending ? { request: pending.request } : undefined),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    approve() {
      settle(true, "Approved by user in Studio.");
    },
    reject(reason?: string) {
      settle(false, reason ?? "Rejected by user in Studio.");
    },
  });
}
