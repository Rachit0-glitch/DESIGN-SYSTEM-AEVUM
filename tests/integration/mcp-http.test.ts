import type { AddressInfo } from "node:net";
import { createMcpHttpServer } from "@aevum/mcp-server";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpTestFixture } from "../helpers/mcp-fixture.js";

const servers: ReturnType<typeof createMcpHttpServer>[] = [];

async function start(
  options: {
    readonly allowedOrigins?: readonly string[];
    readonly requestBodyBytes?: number;
    readonly production?: boolean;
  } = {},
) {
  const fixture = createMcpTestFixture();
  const server = createMcpHttpServer({
    executor: fixture.executor,
    allowedOrigins: options.allowedOrigins ?? [],
    deploymentVersion: "phase-12-test",
    requestBodyBytes: options.requestBodyBytes ?? 1_048_576,
    requestTimeoutMs: 5_000,
    trustProxy: false,
    production: options.production ?? false,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address() as AddressInfo;
  return { fixture, server, url: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("MCP HTTP transport", () => {
  it("exposes hardened health, readiness, and protocol-version endpoints", async () => {
    const { url } = await start();
    const health = await fetch(`${url}/health`);
    const ready = await fetch(`${url}/ready`);
    const version = await fetch(`${url}/version`);

    expect(health.status).toBe(200);
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await ready.json()).toMatchObject({ ok: true, status: "ready" });
    expect(await version.json()).toMatchObject({ protocolVersion: "1.0.0", deploymentVersion: "phase-12-test" });
  });

  it("executes JSON MCP requests and returns structured envelopes", async () => {
    const { fixture, url } = await start();
    const response = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        protocolVersion: "1.0.0",
        requestId: "mcp_req_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        workspaceId: fixture.workspaceId,
        projectId: fixture.projectId,
        documentId: fixture.document.metadata.id,
        tool: "project.get",
        input: {},
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, tool: "project.get" });
  });

  it("adds HSTS only for production transport responses", async () => {
    const production = await start({ production: true });
    const response = await fetch(`${production.url}/health`);
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });

  it("enforces exact-origin CORS, media type, malformed JSON, and payload limits", async () => {
    const { url } = await start({ allowedOrigins: ["https://studio.aevum.test"], requestBodyBytes: 256 });
    const blocked = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.invalid" },
      body: "{}",
    });
    const media = await fetch(`${url}/mcp`, { method: "POST", body: "{}" });
    const malformed = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const oversized = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(300) }),
    });

    expect(blocked.status).toBe(403);
    expect(media.status).toBe(415);
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).errors[0].code).toBe("MCP_INPUT_INVALID");
    expect(oversized.status).toBe(413);
  });
});
