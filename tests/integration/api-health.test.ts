import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApiRuntimeError,
  createAevumApiServer,
  createStarterDocument,
  type AevumApiRuntime,
  type AevumApiServerOptions,
} from "../../apps/api/src/index.js";

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

async function startServer(options: AevumApiServerOptions = {}): Promise<string> {
  const server = createAevumApiServer(options);
  servers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("AEVUM foundation API runtime", () => {
  it("builds a valid editable starter document without an acceptance fixture", () => {
    const document = createStarterDocument("actor-1", "2026-08-14T00:00:00.000Z");
    expect(document.rootNodeIds).toHaveLength(1);
    expect(Object.values(document.nodes).map((node) => node.type)).toEqual(["PAGE", "FRAME", "TEXT"]);
    expect(Object.values(document.nodes).find((node) => node.type === "TEXT")?.name).toBe("Heading");
  });
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

  it("authenticates and bounds the production Studio bootstrap surface", async () => {
    const runtime: AevumApiRuntime = {
      async bootstrap(authorization, createIfMissing) {
        if (authorization !== "Bearer valid-session") throw new ApiRuntimeError("AUTH_INVALID", "Invalid session.");
        return {
          actor: { subject: "actor-1", email: "owner@example.com" },
          workspaces: createIfMissing
            ? [
                {
                  membership: {
                    workspaceId: "workspace_00000000-0000-4000-8000-000000000001",
                    actorSubject: "actor-1",
                    status: "ACTIVE",
                    role: "OWNER",
                    permissions: [],
                    projectIds: ["project_00000000-0000-4000-8000-000000000002"],
                    updatedAt: "2026-08-14T00:00:00.000Z",
                  },
                  projects: [
                    {
                      id: "project_00000000-0000-4000-8000-000000000002",
                      workspaceId: "workspace_00000000-0000-4000-8000-000000000001",
                      name: "Production project",
                      status: "ACTIVE",
                      currentDocumentId: "document_00000000-0000-4000-8000-000000000003",
                      currentDocumentVersion: 1,
                      updatedAt: "2026-08-14T00:00:00.000Z",
                    },
                  ],
                },
              ]
            : [],
        };
      },
      async readiness() {
        return { ok: true, schemaVersion: "202608140001", checks: { database: true, authentication: true } };
      },
      async close() {},
    };
    const origin = await startServer({
      runtime,
      allowedOrigins: ["https://studio.example.com"],
      deploymentVersion: "phase24-test",
      maxPayloadBytes: 32,
      production: true,
    });

    const unauthorized = await fetch(`${origin}/v1/bootstrap`, {
      headers: { origin: "https://studio.example.com" },
    });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({ code: "AUTH_INVALID", recoverable: false });

    const bootstrap = await fetch(`${origin}/v1/bootstrap`, {
      method: "POST",
      headers: {
        authorization: "Bearer valid-session",
        "content-type": "application/json",
        origin: "https://studio.example.com",
      },
      body: "{}",
    });
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.headers.get("access-control-allow-origin")).toBe("https://studio.example.com");
    expect(bootstrap.headers.get("strict-transport-security")).toContain("max-age");
    expect(await bootstrap.json()).toMatchObject({
      actor: { email: "owner@example.com" },
      workspaces: [{ projects: [{ name: "Production project" }] }],
    });

    const deniedOrigin = await fetch(`${origin}/v1/bootstrap`, {
      headers: { authorization: "Bearer valid-session", origin: "https://invalid.example.com" },
    });
    expect(deniedOrigin.status).toBe(403);

    const oversized = await fetch(`${origin}/v1/bootstrap`, {
      method: "POST",
      headers: {
        authorization: "Bearer valid-session",
        "content-type": "application/json",
        origin: "https://studio.example.com",
      },
      body: JSON.stringify({ padding: "x".repeat(64) }),
    });
    expect(oversized.status).toBe(413);
    const malformed = await fetch(`${origin}/v1/bootstrap`, {
      method: "POST",
      headers: { authorization: "Bearer production-token", "content-type": "application/json" },
      body: "{broken",
    });
    expect(malformed.status).toBe(400);

    const readiness = await fetch(`${origin}/ready`);
    expect(await readiness.json()).toMatchObject({ status: "ready", schemaVersion: "202608140001" });
  });
});
