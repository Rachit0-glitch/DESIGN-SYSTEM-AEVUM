import type { Redis } from "ioredis";

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

const WINDOW_MS = 60_000;

function rateLimitKeys(input: RateLimitInput): readonly string[] {
  return [
    `actor:${input.actorId}:${input.classification}`,
    `workspace:${input.workspaceId}:${input.classification}`,
    `ip:${input.ip}:${input.classification}`,
    `tool:${input.actorId}:${input.tool}`,
  ];
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
      const keys = rateLimitKeys(input);
      let retryAfterMs = 0;
      for (const key of keys) {
        const active = (buckets.get(key) ?? []).filter((timestamp) => input.now - timestamp < WINDOW_MS);
        buckets.set(key, active);
        if (active.length >= limit) retryAfterMs = Math.max(retryAfterMs, WINDOW_MS - (input.now - (active[0] ?? 0)));
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

// Sliding-window rate limiting, distributed across every MCP server process/replica via Redis: each
// of the 4 real keys (actor/workspace/ip/tool) is a sorted set keyed by timestamp, pruned and checked
// atomically in one EVAL so concurrent requests from different replicas can never both observe "under
// the limit" and both proceed — the exact race an in-memory-only limiter cannot prevent across
// replicas. Real Redis infrastructure is already provisioned (docker-compose.yml's `cache` service,
// `environment.cache.url`); this was previously unused by any real code path (Block G/H forensic
// finding).
const SLIDING_WINDOW_SCRIPT = `
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local minScore = now - window
local maxRetry = 0
for i = 1, #KEYS do
  local key = KEYS[i]
  redis.call('ZREMRANGEBYSCORE', key, '-inf', minScore)
  local count = redis.call('ZCARD', key)
  if count >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local oldestScore = now
    if oldest[2] ~= nil then oldestScore = tonumber(oldest[2]) end
    local retry = window - (now - oldestScore)
    if retry > maxRetry then maxRetry = retry end
  end
end
if maxRetry > 0 then
  return maxRetry
end
for i = 1, #KEYS do
  local key = KEYS[i]
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
end
return 0
`;

export interface RedisRateLimitOptions {
  readonly enabled: boolean;
  readonly readPerMinute: number;
  readonly writePerMinute: number;
  readonly redis: Pick<Redis, "eval" | "quit">;
  /** Called when Redis itself is unreachable/erroring — the request is still denied (fail-closed,
   * never an accidental unlimited fallback), but an operator needs to know the backing store, not
   * just individual callers, is unhealthy. */
  readonly onBackingStoreError?: (error: unknown) => void;
}

export function createRedisRateLimitProvider(options: RedisRateLimitOptions): RateLimitProvider {
  return {
    async check(input) {
      if (!options.enabled) return { allowed: true, retryAfterMs: 0 };
      const limit = input.classification === "READ" ? options.readPerMinute : options.writePerMinute;
      const keys = rateLimitKeys(input);
      const member = `${input.now}:${Math.random().toString(36).slice(2)}`;
      try {
        const retryAfterMs = (await options.redis.eval(
          SLIDING_WINDOW_SCRIPT,
          keys.length,
          ...keys,
          String(input.now),
          String(WINDOW_MS),
          String(limit),
          member,
        )) as number;
        return retryAfterMs > 0 ? { allowed: false, retryAfterMs } : { allowed: true, retryAfterMs: 0 };
      } catch (error) {
        // Fail closed: a backing-store outage must never silently become "no rate limiting" in
        // production. A fixed, short retry window (rather than 0 or an unbounded value) gives a
        // real, bounded backoff signal to the caller while the store recovers.
        options.onBackingStoreError?.(error);
        return { allowed: false, retryAfterMs: 1_000 };
      }
    },
    async close() {
      await options.redis.quit();
    },
  };
}
