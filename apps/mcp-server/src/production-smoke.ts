import { randomUUID } from "node:crypto";
import { createFrame, fixtures } from "@aevum/document-model";
import { McpResponseEnvelopeSchema } from "@aevum/mcp-protocol";
import { createClient } from "@supabase/supabase-js";
import { createLogger, env } from "@aevum/shared";
import { SignJWT } from "jose";
import { createMcpRequestId } from "./ids.js";
import { createProductionMcpRuntime } from "./runtime.js";
import { createMcpHttpServer } from "./server-factory.js";

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for the production MCP smoke test.`);
  return value;
}

function workspaceId(): string {
  return `workspace_${randomUUID()}`;
}

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function serviceFailure(
  stage: string,
  error: { readonly code?: string | undefined; readonly status?: number | undefined } | null,
): Error {
  return new Error(`${stage} failed (code=${error?.code ?? "unknown"}, status=${error?.status ?? "unknown"}).`);
}

async function runProductionSmoke(): Promise<void> {
  if (env.nodeEnv !== "production" || env.service !== "mcp-server" || env.mcp.authMode !== "supabase") {
    throw new Error("The production MCP smoke test requires the production mcp-server profile.");
  }
  const supabaseUrl = required(env.supabase.url, "SUPABASE_URL");
  const serviceRoleKey = required(env.supabase.serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = required(env.supabase.anonKey, "SUPABASE_ANON_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const suffix = randomUUID();
  const email = `mcp-smoke-${suffix}@example.com`;
  const password = `${randomUUID()}-Aa1!`;
  const primaryWorkspaceId = workspaceId();
  const deniedWorkspaceId = workspaceId();
  const document = fixtures.assetDemo();
  const projectId = document.metadata.projectId;
  const actorId = { subject: "", resolved: "" };
  const remoteBaseUrl = option("endpoint");
  const restartHoldMs = Number(option("restart-hold-ms") ?? 0);
  if (!Number.isInteger(restartHoldMs) || restartHoldMs < 0 || restartHoldMs > 300_000) {
    throw new Error("restart-hold-ms must be an integer from 0 through 300000.");
  }
  let server: ReturnType<typeof createMcpHttpServer> | undefined;
  let executor: ReturnType<typeof createProductionMcpRuntime> | undefined;
  let smokeFailure: unknown;

  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw serviceFailure("Supabase smoke user creation", created.error);
    actorId.subject = created.data.user.id;
    actorId.resolved = `supabase:${actorId.subject}`;

    const workspaceSeed = await admin
      .from("workspaces")
      .insert({ id: primaryWorkspaceId, name: "AEVUM MCP Production Smoke" });
    if (workspaceSeed.error) throw new Error("Supabase smoke workspace seed failed.");
    const projectSeed = await admin.from("projects").insert({
      id: projectId,
      workspace_id: primaryWorkspaceId,
      name: "AEVUM MCP Production Smoke",
      status: "ACTIVE",
      current_document_id: document.metadata.id,
      current_document_version: document.documentVersion,
      created_at: document.metadata.createdAt,
      updated_at: document.metadata.updatedAt,
    });
    if (projectSeed.error) throw new Error("Supabase smoke project seed failed.");
    const documentSeed = await admin.from("documents").insert({
      id: document.metadata.id,
      workspace_id: primaryWorkspaceId,
      project_id: projectId,
      current_version: document.documentVersion,
      content: document,
      created_at: document.metadata.createdAt,
      updated_at: document.metadata.updatedAt,
    });
    if (documentSeed.error) throw new Error("Supabase smoke document seed failed.");
    const versionSeed = await admin.from("document_versions").insert({
      workspace_id: primaryWorkspaceId,
      project_id: projectId,
      document_id: document.metadata.id,
      version: document.documentVersion,
      content: document,
      actor_id: "mcp-production-smoke",
      created_at: document.metadata.createdAt,
    });
    if (versionSeed.error) throw new Error("Supabase smoke version seed failed.");
    const membershipSeed = await admin.from("workspace_memberships").insert({
      workspace_id: primaryWorkspaceId,
      actor_subject: actorId.subject,
      status: "ACTIVE",
      role: "OWNER",
      permissions: [],
      project_ids: [projectId],
    });
    if (membershipSeed.error) throw new Error("Supabase smoke membership seed failed.");

    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session?.access_token) {
      throw new Error("Supabase smoke authentication failed.");
    }
    const accessToken = signedIn.data.session.access_token;
    let endpoint: string;
    if (remoteBaseUrl) {
      const baseUrl = new URL(remoteBaseUrl);
      const healthResponses = await Promise.all(
        ["health", "ready", "version"].map((path) => fetch(new URL(`/${path}`, baseUrl))),
      );
      if (healthResponses.some((response) => response.status !== 200)) {
        throw new Error("Remote MCP health, readiness, or version verification failed.");
      }
      endpoint = new URL("/mcp", baseUrl).toString();
    } else {
      const logger = createLogger({}, () => {});
      executor = createProductionMcpRuntime(env, logger);
      server = createMcpHttpServer({
        executor,
        allowedOrigins: env.mcp.allowedOrigins,
        deploymentVersion: env.mcp.deploymentVersion,
        requestBodyBytes: env.mcp.limits.requestBodyBytes,
        requestTimeoutMs: env.mcp.requestTimeoutMs,
        trustProxy: env.mcp.trustProxy,
        production: true,
        logger,
      });
      await new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        server?.listen({ port: 0, host: env.mcp.host }, resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("MCP smoke server address resolution failed.");
      endpoint = `http://127.0.0.1:${address.port}/mcp`;
    }
    const request = async (
      tool: string,
      input: unknown,
      options: { readonly dryRun?: boolean; readonly idempotencyKey?: string; readonly workspace?: string } = {},
    ) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          protocolVersion: "1.0.0",
          requestId: createMcpRequestId(),
          workspaceId: options.workspace ?? primaryWorkspaceId,
          projectId,
          documentId: document.metadata.id,
          tool,
          input,
          ...(options.dryRun ? { dryRun: true } : {}),
          ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        }),
      });
      return McpResponseEnvelopeSchema.parse(await response.json());
    };

    const project = await request("project.get", {});
    const pageId = document.pages[0];
    if (!pageId) throw new Error("Smoke fixture requires a page.");
    const node = createFrame(pageId, "Production MCP Smoke Node");
    const dryRun = await request(
      "node.create",
      { expectedDocumentVersion: 1, node },
      {
        dryRun: true,
        idempotencyKey: `smoke-dry-${suffix}`,
      },
    );
    const committed = await request(
      "node.create",
      { expectedDocumentVersion: 1, node },
      {
        idempotencyKey: `smoke-commit-${suffix}`,
      },
    );
    const replayed = await request(
      "node.create",
      { expectedDocumentVersion: 1, node },
      {
        idempotencyKey: `smoke-commit-${suffix}`,
      },
    );
    const denied = await request("project.get", {}, { workspace: deniedWorkspaceId });
    let restartRead = project;
    let restartReplay = replayed;
    if (restartHoldMs > 0) {
      console.log(`Production MCP smoke is ready for a service restart; resuming in ${restartHoldMs}ms.`);
      await new Promise((resolve) => setTimeout(resolve, restartHoldMs));
      restartRead = await request("project.get", {});
      restartReplay = await request(
        "node.create",
        { expectedDocumentVersion: 1, node },
        { idempotencyKey: `smoke-commit-${suffix}` },
      );
    }

    const [storedDocument, auditRecords, idempotencyRecords] = await Promise.all([
      admin.from("documents").select("current_version,content").eq("id", document.metadata.id).single(),
      admin.from("mcp_audit_logs").select("status,error_code").eq("actor_id", actorId.resolved),
      admin.from("mcp_idempotency_records").select("idempotency_key").eq("workspace_id", primaryWorkspaceId),
    ]);
    if (storedDocument.error || auditRecords.error || idempotencyRecords.error) {
      throw new Error("Supabase smoke verification query failed.");
    }
    const storedNodes = storedDocument.data.content?.nodes as Record<string, unknown> | undefined;
    const assertions = {
      read: project.success,
      dryRun: dryRun.success,
      write: committed.success,
      replay: replayed.success,
      replayTransaction: replayed.transactionId === committed.transactionId,
      workspaceIsolation: denied.errors[0]?.code === "MCP_WORKSPACE_ACCESS_DENIED",
      restartRead: restartRead.success,
      restartReplay: restartReplay.success && restartReplay.transactionId === committed.transactionId,
      persistedVersion: storedDocument.data.current_version === 2,
      persistedNode: Boolean(storedNodes?.[node.id]),
      audit: (auditRecords.data?.length ?? 0) >= 5,
      idempotency: (idempotencyRecords.data?.length ?? 0) === 2,
    };
    const failedAssertions = Object.entries(assertions)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    if (failedAssertions.length > 0) {
      throw new Error(
        `Production MCP smoke assertions failed: ${failedAssertions.join(", ")} (auditCount=${auditRecords.data?.length ?? 0}, idempotencyCount=${idempotencyRecords.data?.length ?? 0}).`,
      );
    }
    if (remoteBaseUrl) {
      const baseUrl = new URL(remoteBaseUrl);
      const requestBody = {
        protocolVersion: "1.0.0",
        requestId: createMcpRequestId(),
        workspaceId: primaryWorkspaceId,
        projectId,
        documentId: document.metadata.id,
        tool: "project.get",
        input: {},
      };
      const sendWithToken = async (token: string) => {
        const response = await fetch(new URL("/mcp", baseUrl), {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ ...requestBody, requestId: createMcpRequestId() }),
        });
        return { status: response.status, body: McpResponseEnvelopeSchema.parse(await response.json()) };
      };
      const jwtSecret = required(env.supabase.jwtSecret, "SUPABASE_JWT_SECRET");
      const signingKey = new TextEncoder().encode(jwtSecret);
      const issuer = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
      const claims = { role: "authenticated", email };
      const signedToken = async (overrides: { issuer?: string; audience?: string; expiration?: number } = {}) =>
        new SignJWT(claims)
          .setProtectedHeader({ alg: "HS256", typ: "JWT" })
          .setSubject(actorId.subject)
          .setIssuer(overrides.issuer ?? issuer)
          .setAudience(overrides.audience ?? "authenticated")
          .setIssuedAt()
          .setExpirationTime(overrides.expiration ?? Math.floor(Date.now() / 1_000) + 300)
          .sign(signingKey);
      const invalidSignature = await new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(actorId.subject)
        .setIssuer(issuer)
        .setAudience("authenticated")
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1_000) + 300)
        .sign(new TextEncoder().encode(randomUUID()));
      const [malformed, invalid, expired, wrongIssuer, wrongAudience] = await Promise.all([
        sendWithToken("not-a-jwt"),
        sendWithToken(invalidSignature),
        signedToken({ expiration: Math.floor(Date.now() / 1_000) - 60 }).then(sendWithToken),
        signedToken({ issuer: "https://issuer.invalid/auth/v1" }).then(sendWithToken),
        signedToken({ audience: "wrong-audience" }).then(sendWithToken),
      ]);
      const authenticationChecks = [malformed, invalid, wrongIssuer, wrongAudience].every(
        (result) => result.status === 401 && result.body.errors[0]?.code === "MCP_AUTHENTICATION_INVALID",
      );
      if (!authenticationChecks || expired.status !== 401 || expired.body.errors[0]?.code !== "MCP_TOKEN_EXPIRED") {
        throw new Error("Remote MCP JWT rejection verification failed.");
      }
      const health = await fetch(new URL("/health", baseUrl));
      const headersPass =
        health.headers.get("x-content-type-options") === "nosniff" &&
        health.headers.get("x-frame-options") === "DENY" &&
        health.headers.has("content-security-policy") &&
        health.headers.has("strict-transport-security");
      const corsDenied = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://origin.invalid" },
        body: JSON.stringify(requestBody),
      });
      const oversized = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ padding: "x".repeat(env.mcp.limits.requestBodyBytes) }),
      });
      const malformedEnvelope = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const malformedEnvelopeBody = McpResponseEnvelopeSchema.parse(await malformedEnvelope.json());
      if (
        !headersPass ||
        corsDenied.status !== 403 ||
        oversized.status !== 413 ||
        malformedEnvelope.status !== 400 ||
        malformedEnvelopeBody.errors[0]?.code !== "MCP_INPUT_INVALID"
      ) {
        throw new Error("Remote MCP transport security verification failed.");
      }
      const viewerUpdate = await admin
        .from("workspace_memberships")
        .update({ role: "VIEWER" })
        .eq("workspace_id", primaryWorkspaceId)
        .eq("actor_subject", actorId.subject);
      if (viewerUpdate.error) throw new Error("Remote MCP permission fixture update failed.");
      const permissionDenied = await request("node.delete", {
        expectedDocumentVersion: 2,
        nodeId: node.id,
      });
      if (permissionDenied.errors[0]?.code !== "MCP_AUTHORIZATION_DENIED") {
        throw new Error("Remote MCP permission enforcement verification failed.");
      }
      const rateResults = await Promise.all(
        Array.from({ length: env.mcp.rateLimit.readPerMinute + 1 }, () => request("project.get", {})),
      );
      const rateLimited = rateResults.some((result) => result.errors[0]?.code === "MCP_RATE_LIMITED");
      if (!rateLimited) throw new Error("Remote MCP rate-limit verification failed.");
    }
    console.log("Production MCP authenticated read/write smoke test passed.");
  } catch (error) {
    smokeFailure = error;
  } finally {
    if (server?.listening) await new Promise<void>((resolve) => server?.close(() => resolve()));
    await executor?.close();
    const cleanupErrors: string[] = [];
    if (actorId.resolved) {
      const auditCleanup = await admin.from("mcp_audit_logs").delete().eq("actor_id", actorId.resolved);
      if (auditCleanup.error) cleanupErrors.push("audit records");
    }
    const workspaceCleanup = await admin.from("workspaces").delete().eq("id", primaryWorkspaceId);
    if (workspaceCleanup.error) cleanupErrors.push("workspace cascade");
    if (actorId.subject) {
      const userCleanup = await admin.auth.admin.deleteUser(actorId.subject);
      if (userCleanup.error) cleanupErrors.push("Auth user");
    }
    const [workspaceResidual, auditResidual, idempotencyResidual] = await Promise.all([
      admin.from("workspaces").select("id", { count: "exact", head: true }).eq("id", primaryWorkspaceId),
      actorId.resolved
        ? admin.from("mcp_audit_logs").select("id", { count: "exact", head: true }).eq("actor_id", actorId.resolved)
        : Promise.resolve({ count: 0, error: null }),
      admin
        .from("mcp_idempotency_records")
        .select("idempotency_key", { count: "exact", head: true })
        .eq("workspace_id", primaryWorkspaceId),
    ]);
    if (workspaceResidual.error || workspaceResidual.count !== 0) cleanupErrors.push("workspace verification");
    if (auditResidual.error || auditResidual.count !== 0) cleanupErrors.push("audit verification");
    if (idempotencyResidual.error || idempotencyResidual.count !== 0) {
      cleanupErrors.push("idempotency verification");
    }
    if (cleanupErrors.length > 0) {
      const cleanupFailure = new Error(`Production MCP smoke cleanup failed for: ${cleanupErrors.join(", ")}.`);
      smokeFailure = smokeFailure
        ? new AggregateError([smokeFailure, cleanupFailure], "Production MCP smoke and cleanup both failed.")
        : cleanupFailure;
    }
  }
  if (smokeFailure) throw smokeFailure;
}

await runProductionSmoke();
