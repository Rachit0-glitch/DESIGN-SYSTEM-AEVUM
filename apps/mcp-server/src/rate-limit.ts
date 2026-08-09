export interface RateLimitInput {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly ip: string;
  readonly tool: string;
  readonly classification: "READ" | "WRITE";
  readonly now: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

export interface RateLimitProvider {
  check(input: RateLimitInput): Promise<RateLimitResult>;
  close(): Promise<void>;
}

export function createInMemoryRateLimitProvider(options: {
  readonly enabled: boolean;
  readonly readPerMinute: number;
  readonly writePerMinute: number;
}): RateLimitProvider {
  const buckets = new Map<string, number[]>();
  return {
    async check(input) {
      if (!options.enabled) return { allowed: true, retryAfterMs: 0 };
      const limit = input.classification === "READ" ? options.readPerMinute : options.writePerMinute;
      const keys = [
        `actor:${input.actorId}:${input.classification}`,
        `workspace:${input.workspaceId}:${input.classification}`,
        `ip:${input.ip}:${input.classification}`,
        `tool:${input.actorId}:${input.tool}`,
      ];
      let retryAfterMs = 0;
      for (const key of keys) {
        const active = (buckets.get(key) ?? []).filter((timestamp) => input.now - timestamp < 60_000);
        buckets.set(key, active);
        if (active.length >= limit) retryAfterMs = Math.max(retryAfterMs, 60_000 - (input.now - (active[0] ?? 0)));
      }
      if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
      for (const key of keys) buckets.set(key, [...(buckets.get(key) ?? []), input.now]);
      return { allowed: true, retryAfterMs: 0 };
    },
    async close() {
      buckets.clear();
    },
  };
}
