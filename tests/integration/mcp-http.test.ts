import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { clientIp, createMcpHttpServer } from "@aevum/mcp-server";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpTestFixture } from "../helpers/mcp-fixture.js";

function fakeRequest(headers: Record<string, string | string[] | undefined>, remoteAddress: string): IncomingMessage {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

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

  it("exposes the same permissioned executor through stateless Streamable HTTP JSON-RPC", async () => {
    const { fixture, url } = await start();
    const endpoint = `${url}/mcp?workspaceId=${encodeURIComponent(fixture.workspaceId)}&projectId=${encodeURIComponent(fixture.projectId)}&documentId=${encodeURIComponent(fixture.document.metadata.id)}`;
    const call = (body: object) =>
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify(body),
      });

    const initialized = await call({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    });
    const initializeBody = await initialized.json();
    expect(initialized.status, JSON.stringify(initializeBody)).toBe(200);
    expect(initializeBody).toMatchObject({ result: { capabilities: { tools: {} } } });

    const listed = await call({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listBody = (await listed.json()) as { result: { tools: Array<{ name: string; inputSchema: unknown }> } };
    expect(listBody.result.tools.some((tool) => tool.name === "document.get")).toBe(true);
    expect(listBody.result.tools.find((tool) => tool.name === "document.rename")?.inputSchema).toBeDefined();

    const read = await call({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "document.get", arguments: { projection: "summary" } },
    });
    expect(await read.json()).toMatchObject({ result: { isError: false, structuredContent: { documentVersion: 1 } } });

    const dryRun = await call({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "document.rename",
        arguments: {
          name: "External MCP",
          expectedDocumentVersion: 1,
          aevumExecution: { dryRun: true, idempotencyKey: "external-dry-run", documentVersion: 1 },
        },
      },
    });
    expect(await dryRun.json()).toMatchObject({ result: { isError: false, structuredContent: { dryRun: true } } });

    const write = await call({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "document.rename",
        arguments: {
          name: "External MCP",
          expectedDocumentVersion: 1,
          aevumExecution: { idempotencyKey: "external-commit-0001", documentVersion: 1 },
        },
      },
    });
    expect(await write.json()).toMatchObject({ result: { isError: false, structuredContent: { resultVersion: 2 } } });
    expect((await fixture.repository.getCurrentDocument(fixture.workspaceId, fixture.projectId))?.metadata.name).toBe(
      "External MCP",
    );
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

  // clientIp() feeds directly into the ip-scoped rate-limit bucket (executor.ts) and into
  // request-level logging -- this is the exact branch the live Railway deployment actually runs
  // (docs/ACCOUNT_MIGRATION.md lists MCP_TRUST_PROXY as an explicitly configured production
  // variable), yet every other test in this file hardcodes `trustProxy: false`, so this branch had
  // zero coverage until now (Block H14 finding).
  describe("clientIp() with MCP_TRUST_PROXY behavior", () => {
    it("trusts the first X-Forwarded-For entry only when trustProxy is enabled", () => {
      const withHeader = fakeRequest({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }, "127.0.0.1");
      expect(clientIp(withHeader, true)).toBe("203.0.113.5");
      expect(clientIp(withHeader, false)).toBe("127.0.0.1");
    });

    it("falls back to the socket address when trustProxy is enabled but no header is present", () => {
      const withoutHeader = fakeRequest({}, "192.168.1.10");
      expect(clientIp(withoutHeader, true)).toBe("192.168.1.10");
    });

    it("handles a duplicated header (Node normalizes repeated headers into an array) by taking the first entry", () => {
      const arrayHeader = fakeRequest({ "x-forwarded-for": ["198.51.100.7", "203.0.113.5"] }, "127.0.0.1");
      expect(clientIp(arrayHeader, true)).toBe("198.51.100.7");
    });

    it("ignores a blank forwarded-for header and falls back to the socket address", () => {
      const blankHeader = fakeRequest({ "x-forwarded-for": "   " }, "127.0.0.1");
      expect(clientIp(blankHeader, true)).toBe("127.0.0.1");
    });

    it('reports "unknown" only when neither a trusted header nor a socket address is available', () => {
      const nothing = fakeRequest({}, undefined as unknown as string);
      expect(clientIp(nothing, false)).toBe("unknown");
    });
  });
});
