import { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import {
  type createInMemoryRateLimitProvider,
  createRedisRateLimitProvider,
} from "../../apps/mcp-server/src/rate-limit.js";

const WINDOW_MS = 60_000;

/**
 * Block H4 — a faithful, in-process re-implementation of the real sliding-window sorted-set Lua
 * script (SLIDING_WINDOW_SCRIPT in rate-limit.ts) using plain JS Maps instead of Redis sorted sets.
 * This is NOT a stand-in for real distributed verification — it exists to prove the TypeScript
 * wrapper (argument marshaling, retryAfterMs interpretation, fail-closed error handling) is correct
 * without requiring a live Redis server. The real cross-connection distributed-enforcement test below
 * is the actual proof of atomicity/distribution; it only runs when a real local Redis is reachable.
 */
function createFakeRedisEval() {
  const sortedSets = new Map<string, Map<string, number>>();
  return {
    async eval(_script: string, numKeys: number, ...rest: unknown[]): Promise<number> {
      const keys = rest.slice(0, numKeys) as string[];
      const [nowRaw, windowRaw, limitRaw, member] = rest.slice(numKeys) as string[];
      const now = Number(nowRaw);
      const window = Number(windowRaw);
      const limit = Number(limitRaw);
      let maxRetry = 0;
      for (const key of keys) {
        const set = sortedSets.get(key) ?? new Map<string, number>();
        for (const [entryMember, score] of [...set.entries()]) {
          if (score < now - window) set.delete(entryMember);
        }
        sortedSets.set(key, set);
        if (set.size >= limit) {
          const oldestScore = Math.min(...set.values());
          const retry = window - (now - oldestScore);
          if (retry > maxRetry) maxRetry = retry;
        }
      }
      if (maxRetry > 0) return maxRetry;
      for (const key of keys) {
        const set = sortedSets.get(key) ?? new Map<string, number>();
        set.set(member ?? "", now);
        sortedSets.set(key, set);
      }
      return 0;
    },
    async quit() {},
  };
}

function input(overrides: Partial<Parameters<ReturnType<typeof createInMemoryRateLimitProvider>["check"]>[0]> = {}) {
  return {
    actorId: "actor-1",
    workspaceId: "workspace-1",
    ip: "127.0.0.1",
    tool: "document.get",
    classification: "READ" as const,
    now: Date.now(),
    ...overrides,
  };
}

describe("Redis-backed rate limiting contract (Block H4)", () => {
  it("allows requests under the limit and enforces the same real sliding-window semantics as the in-memory provider", async () => {
    const redis = createFakeRedisEval();
    const provider = createRedisRateLimitProvider({ enabled: true, readPerMinute: 3, writePerMinute: 3, redis });
    const now = 1_000_000;

    for (let i = 0; i < 3; i += 1) {
      const result = await provider.check(input({ now: now + i }));
      expect(result.allowed, `request ${i} should be allowed`).toBe(true);
    }
    const fourth = await provider.check(input({ now: now + 3 }));
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the sliding window expires", async () => {
    const redis = createFakeRedisEval();
    const provider = createRedisRateLimitProvider({ enabled: true, readPerMinute: 1, writePerMinute: 1, redis });
    const now = 2_000_000;

    expect((await provider.check(input({ now }))).allowed).toBe(true);
    expect((await provider.check(input({ now: now + 1 }))).allowed).toBe(false);
    expect((await provider.check(input({ now: now + WINDOW_MS + 1 }))).allowed).toBe(true);
  });

  it("passes through unconditionally when disabled", async () => {
    const redis = createFakeRedisEval();
    const provider = createRedisRateLimitProvider({ enabled: false, readPerMinute: 0, writePerMinute: 0, redis });
    for (let i = 0; i < 5; i += 1) {
      expect((await provider.check(input({ now: 1 }))).allowed).toBe(true);
    }
  });

  it("fails closed — never an accidental unlimited fallback — when the Redis backing store errors", async () => {
    const errors: unknown[] = [];
    const failingRedis = {
      async eval(): Promise<number> {
        throw new Error("ECONNREFUSED: real backing-store outage simulation.");
      },
      async quit() {},
    };
    const provider = createRedisRateLimitProvider({
      enabled: true,
      readPerMinute: 1_000,
      writePerMinute: 1_000,
      redis: failingRedis,
      onBackingStoreError: (error) => errors.push(error),
    });

    const result = await provider.check(input());
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(errors).toHaveLength(1);
  });

  it("isolates buckets per actor/workspace/ip/tool the same way the in-memory provider does", async () => {
    const redis = createFakeRedisEval();
    const provider = createRedisRateLimitProvider({ enabled: true, readPerMinute: 1, writePerMinute: 1, redis });
    const now = 3_000_000;

    const actorA = { actorId: "actor-a", workspaceId: "workspace-a", ip: "10.0.0.1" };
    const actorB = { actorId: "actor-b", workspaceId: "workspace-b", ip: "10.0.0.2" };

    expect((await provider.check(input({ ...actorA, now }))).allowed).toBe(true);
    // A different actor on a different IP/workspace (and thus every real key differs) is not
    // blocked by actor-a's use.
    expect((await provider.check(input({ ...actorB, now }))).allowed).toBe(true);
    // The same actor is now blocked.
    expect((await provider.check(input({ ...actorA, now: now + 1 }))).allowed).toBe(false);
    // A third actor sharing actor-a's real IP still shares that IP-scoped bucket by design (matches
    // the in-memory provider's own real key set) — real IP-based abuse protection, not a bug.
    expect(
      (await provider.check(input({ actorId: "actor-c", workspaceId: "workspace-c", ip: actorA.ip, now: now + 2 })))
        .allowed,
    ).toBe(false);
  });
});

async function probeLiveRedis(): Promise<boolean> {
  const probe = new Redis({
    host: "127.0.0.1",
    port: 6379,
    lazyConnect: true,
    connectTimeout: 500,
    retryStrategy: () => null,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    await probe.quit().catch(() => probe.disconnect());
  }
}

describe("Real distributed enforcement against a live local Redis (Block H4)", () => {
  it("two independent Redis connections (simulating two MCP server replicas) enforce ONE real combined limit — the exact race an in-memory-only limiter cannot prevent", async (context) => {
    // Dynamic skip (not a failure) when no real local Redis is reachable — this is the one real
    // piece of H4 that genuinely requires live infrastructure to verify; see
    // docs/STABILIZATION_KNOWN_LIMITATIONS.md's Block H section for the honest disclosure of what
    // this proves when it runs versus when it's skipped.
    if (!(await probeLiveRedis())) {
      context.skip();
      return;
    }
    const namespace = `aevum-test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const replicaA = new Redis({ host: "127.0.0.1", port: 6379 });
    const replicaB = new Redis({ host: "127.0.0.1", port: 6379 });
    const providerA = createRedisRateLimitProvider({
      enabled: true,
      readPerMinute: 5,
      writePerMinute: 5,
      redis: replicaA,
    });
    const providerB = createRedisRateLimitProvider({
      enabled: true,
      readPerMinute: 5,
      writePerMinute: 5,
      redis: replicaB,
    });
    const now = Date.now();
    const request = (provider: typeof providerA, index: number) =>
      provider.check({
        actorId: `${namespace}:actor`,
        workspaceId: `${namespace}:workspace`,
        ip: "127.0.0.1",
        tool: "document.get",
        classification: "READ",
        now: now + index,
      });

    // 5 requests split across two "replicas" — real proof they share one Redis-backed limit, not
    // two independent in-memory buckets of 5 each (which would allow 10).
    const results = [];
    for (let i = 0; i < 3; i += 1) results.push(await request(providerA, i));
    for (let i = 3; i < 6; i += 1) results.push(await request(providerB, i));
    const allowedCount = results.filter((result) => result.allowed).length;
    expect(allowedCount).toBe(5);
    expect(results.at(-1)?.allowed).toBe(false);

    await replicaA.quit();
    await replicaB.quit();
  });
});
