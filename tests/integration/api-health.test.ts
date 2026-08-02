import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createAevumApiServer } from "../../apps/api/src/index.js";

const servers = new Set<ReturnType<typeof createAevumApiServer>>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  servers.clear();
});

async function startServer(): Promise<string> {
  const server = createAevumApiServer();
  servers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("AEVUM foundation API runtime", () => {
  it("reports deterministic health and readiness without requiring unfinished services", async () => {
    const origin = await startServer();
    const health = await fetch(`${origin}/health`);
    const readiness = await fetch(`${origin}/ready`);

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      product: "AEVUM AI Reconstruction Engine",
      service: "@aevum/api",
      status: "ok",
      scope: "foundation-health-runtime",
    });
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toEqual({
      service: "@aevum/api",
      status: "ready",
      dependencies: "not-required-for-foundation-health-runtime",
    });
  });

  it("rejects unsupported methods and unknown routes with structured errors", async () => {
    const origin = await startServer();
    const unsupported = await fetch(`${origin}/health`, { method: "POST" });
    const missing = await fetch(`${origin}/missing`);

    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get("allow")).toBe("GET, HEAD");
    expect(await unsupported.json()).toEqual({ code: "METHOD_NOT_ALLOWED", recoverable: true });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ code: "ROUTE_NOT_FOUND", recoverable: true });
  });
});
