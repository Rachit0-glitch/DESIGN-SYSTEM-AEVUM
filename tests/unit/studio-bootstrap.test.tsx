// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { CURRENT_COMMAND_VERSION } from "@aevum/command-engine";
import { CURRENT_SCHEMA_VERSION } from "@aevum/document-model";
import { MCP_PROTOCOL_VERSION } from "@aevum/mcp-protocol";
import { createStudioProjectFixture } from "@aevum/studio";
import type { StudioBrowserConfiguration } from "../../apps/studio/src/core/production.js";
import { ProductionBootstrap } from "../../apps/studio/src/main.js";

/**
 * Block D13 — real, executed reproduction of the tab-return/freeze mechanism STEP 10 (Block D
 * addendum) fixed: Supabase emits a new Session object on every background token refresh, and
 * ProductionBootstrap's effect used to key its expensive full-project-reload
 * (loadProductionStudioProject, a real /v1/bootstrap fetch + document.get + system.get_capabilities
 * MCP round trip) directly off that Session object's identity — so a routine background refresh
 * re-triggered the whole reload as if the user had signed out and back in.
 *
 * This environment has no live Supabase deployment to trigger a genuine background refresh against
 * (the same real constraint STABILIZATION_KNOWN_LIMITATIONS.md already discloses for STEP 10), and
 * a live-browser attempt in this session to reproduce it via Page Visibility events found that this
 * sandboxed Chromium instance reports document.visibilityState as permanently "hidden" regardless
 * of tab focus, making that angle unusable here too. This test instead reproduces the actual
 * mechanism directly: it mounts the real ProductionBootstrap component with a controllable fake
 * Supabase client and fires the exact event shape a real background token refresh produces (a new
 * Session object, same user id), then measures — by real call-count on the fetch mock, not a read
 * of the guard condition in the source — whether the expensive reload fires again.
 */

const WORKSPACE_ID = "workspace_11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "project_22222222-2222-4222-8222-222222222222";

const configuration: StudioBrowserConfiguration = {
  supabaseUrl: "https://auth.example.test",
  supabaseAnonKey: "anon-key-anon-key-anon-key-anon-key",
  apiUrl: "https://api.example.test",
  mcpUrl: "https://mcp.example.test",
} as StudioBrowserConfiguration;

function fixtureSession(userId: string, accessToken: string) {
  return { access_token: accessToken, user: { id: userId }, expires_at: Date.now() / 1000 + 3600 };
}

function successEnvelope(tool: string, data: unknown) {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    success: true,
    requestId: `mcp_req_${crypto.randomUUID()}`,
    tool,
    data,
    warnings: [],
    errors: [],
    durationMs: 1,
  };
}

function bootstrapBody(userId: string, documentId: string) {
  return {
    actor: { subject: userId },
    workspaces: [
      {
        membership: {
          workspaceId: WORKSPACE_ID,
          actorSubject: userId,
          role: "EDITOR",
          permissions: [],
          projectIds: [PROJECT_ID],
          status: "ACTIVE",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        projects: [
          {
            id: PROJECT_ID,
            workspaceId: WORKSPACE_ID,
            name: "Test project",
            status: "ACTIVE",
            currentDocumentId: documentId,
            currentDocumentVersion: 1,
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      },
    ],
  };
}

/** A minimal, controllable fake standing in for the real Supabase auth client surface --
 * only what ProductionBootstrap actually touches (getSession/onAuthStateChange/signOut). Mocked at
 * apps/studio/src/core/production.js's createStudioAuthClient (our own module) rather than at
 * @supabase/supabase-js directly -- a far more reliable vi.mock target than a third-party ESM
 * package that may already be resolved elsewhere in the module graph. */
function createFakeAuthClient(initialSession: ReturnType<typeof fixtureSession>) {
  let listener: ((event: string, session: unknown) => void) | undefined;
  return {
    client: {
      auth: {
        getSession: async () => ({ data: { session: initialSession } }),
        onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
          listener = callback;
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
        signOut: async () => ({ error: null }),
      },
    },
    fireAuthChange: (event: string, session: unknown) => listener?.(event, session),
  };
}

// globalThis, not a closed-over local, bridges the (hoisted) mock factory and each test's fake
// client -- vi.mock factories run before any test-local `let`/`const` in this file is initialized.
declare global {
  // eslint-disable-next-line no-var
  var __fakeAuthClient: unknown;
}
vi.mock("../../apps/studio/src/core/production.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/studio/src/core/production.js")>();
  return { ...actual, createStudioAuthClient: () => globalThis.__fakeAuthClient };
});

describe("ProductionBootstrap real tab-return reload behavior (Block D13)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let bootstrapCallCount: number;

  beforeEach(() => {
    bootstrapCallCount = 0;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    globalThis.__fakeAuthClient = undefined;
  });

  function stubFetch(userId: string, documentId: string) {
    const fixture = createStudioProjectFixture();
    fetchMock = vi.fn(async (requestInput: RequestInfo | URL, init?: RequestInit) => {
      const url = requestInput.toString();
      if (url.endsWith("/v1/bootstrap")) {
        bootstrapCallCount += 1;
        return new Response(JSON.stringify(bootstrapBody(userId, documentId)), { status: 200 });
      }
      if (url.endsWith("/mcp")) {
        const body = JSON.parse(String(init?.body)) as { tool: string };
        if (body.tool === "document.get") {
          return new Response(JSON.stringify(successEnvelope(body.tool, fixture.document)));
        }
        if (body.tool === "system.get_capabilities") {
          return new Response(
            JSON.stringify(
              successEnvelope(body.tool, {
                protocolVersion: MCP_PROTOCOL_VERSION,
                tools: [],
                enabledTools: [],
                supportedSchemaVersion: CURRENT_SCHEMA_VERSION,
                supportedCommandVersion: CURRENT_COMMAND_VERSION,
                authMode: "supabase",
                dryRunSupport: true,
                transactionSupport: true,
                limits: {
                  requestBodyBytes: 1_000_000,
                  toolInputBytes: 500_000,
                  responseBytes: 1_000_000,
                  metadataBytes: 10_000,
                  batchSize: 256,
                  nodePayloadBytes: 100_000,
                  auditPayloadBytes: 100_000,
                },
                deploymentVersion: "test",
                environment: "test",
              }),
            ),
          );
        }
        throw new Error(`Unexpected MCP tool invoked in this test: ${body.tool}`);
      }
      throw new Error(`Unexpected fetch URL in this test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fixture.document.metadata.id;
  }

  it(
    "does NOT re-run the expensive project reload when Supabase emits a same-user background " +
      "token-refresh Session (the real tab-return mechanism, reproduced directly)",
    async () => {
      stubFetch("user-1", "doc_stable");
      const session1 = fixtureSession("user-1", "token-a");
      const fake = createFakeAuthClient(session1);
      globalThis.__fakeAuthClient = fake.client;

      render(<ProductionBootstrap configuration={configuration} />);
      await waitFor(() => expect(bootstrapCallCount).toBe(1));

      // The exact real shape of a background token refresh: a genuinely new Session object, same
      // signed-in user.
      const refreshedSession = fixtureSession("user-1", "token-b-refreshed");
      fake.fireAuthChange("TOKEN_REFRESHED", refreshedSession);

      // Give any (incorrect) reload a real chance to fire before asserting it didn't.
      await new Promise((resolveTick) => setTimeout(resolveTick, 50));
      expect(bootstrapCallCount, "a same-user token refresh must not re-trigger the full project reload").toBe(1);
    },
  );

  it("DOES reload when the signed-in identity genuinely changes (a real sign-out/sign-in, not a refresh)", async () => {
    stubFetch("user-1", "doc_stable");
    const session1 = fixtureSession("user-1", "token-a");
    const fake = createFakeAuthClient(session1);
    globalThis.__fakeAuthClient = fake.client;

    render(<ProductionBootstrap configuration={configuration} />);
    await waitFor(() => expect(bootstrapCallCount).toBe(1));

    const differentUserSession = fixtureSession("user-2", "token-c");
    fake.fireAuthChange("SIGNED_IN", differentUserSession);

    await waitFor(() => expect(bootstrapCallCount).toBe(2));
  });
});
