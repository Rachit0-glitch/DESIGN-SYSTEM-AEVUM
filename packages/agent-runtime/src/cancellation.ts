export interface AgentCancellationController {
  readonly signal: AbortSignal;
  cancel(reason?: string): void;
}

export function createAgentCancellationController(): AgentCancellationController {
  const controller = new AbortController();
  return Object.freeze({
    signal: controller.signal,
    cancel(reason = "Agent execution cancelled.") {
      controller.abort(new Error(reason));
    },
  });
}
