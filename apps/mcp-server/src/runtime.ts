import { createSupabaseAssetStorage, createSupabaseProjectRepository } from "@aevum/project-store";
import { env, type AevumEnvironment, type AevumLogger, createLogger } from "@aevum/shared";
import {
  createInMemoryVisionQuotaTracker,
  createVisionProvider,
  withVisionQuota,
  type VisionProvider,
} from "@aevum/vision";
import {
  createDevelopmentAuthVerifier,
  createDisabledAuthVerifier,
  createSupabaseAuthVerifier,
  type AuthVerifier,
} from "./auth.js";
import { createMcpExecutor } from "./executor.js";
import { createInMemoryRateLimitProvider } from "./rate-limit.js";
import { createToolRegistry, type McpServerRuntimeConfig } from "./registry.js";
import { registerInitialTools } from "./tools.js";

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required to start the MCP server.`);
  return value;
}

/**
 * Deployments commonly store a service-account private key as a single-line env var with literal
 * "\n" sequences (Railway/Vercel/etc.) rather than real newlines — un-escape it here, once, at the
 * boundary, rather than expecting every caller to remember to.
 */
function unescapePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function visionProviderForEnvironment(environment: AevumEnvironment): (workspaceId: string) => VisionProvider {
  const base = createVisionProvider({
    providerId: environment.vision.provider,
    google:
      environment.vision.googleClientEmail && environment.vision.googlePrivateKey
        ? {
            credentials: {
              clientEmail: environment.vision.googleClientEmail,
              privateKey: unescapePrivateKey(environment.vision.googlePrivateKey),
              ...(environment.vision.googleProjectId ? { projectId: environment.vision.googleProjectId } : {}),
            },
            timeoutMs: environment.vision.analysisTimeoutMs,
            maxLabels: environment.vision.maxLabels,
            maxObjects: environment.vision.maxObjects,
          }
        : {
            timeoutMs: environment.vision.analysisTimeoutMs,
            maxLabels: environment.vision.maxLabels,
            maxObjects: environment.vision.maxObjects,
          },
  });
  return withVisionQuota(base, createInMemoryVisionQuotaTracker(), environment.vision.maxCallsPerWorkspacePerDay);
}

function timeoutFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signals = [timeoutController.signal, ...(init?.signal ? [init.signal] : [])];
    try {
      return await fetch(input, { ...init, signal: AbortSignal.any(signals) });
    } finally {
      clearTimeout(timer);
    }
  };
}

function authVerifier(environment: AevumEnvironment): AuthVerifier {
  if (environment.mcp.authMode === "supabase") {
    return createSupabaseAuthVerifier({
      supabaseUrl: required(environment.supabase.url, "SUPABASE_URL"),
      ...(environment.supabase.jwtSecret ? { jwtSecret: environment.supabase.jwtSecret } : {}),
      fetch: timeoutFetch(environment.mcp.authenticationTimeoutMs),
    });
  }
  if (environment.mcp.authMode === "disabled") return createDisabledAuthVerifier(environment.nodeEnv);
  return createDevelopmentAuthVerifier({ nodeEnv: environment.nodeEnv });
}

export function mcpRuntimeConfig(environment: AevumEnvironment = env): McpServerRuntimeConfig {
  return {
    nodeEnv: environment.nodeEnv,
    authMode: environment.mcp.authMode,
    deploymentVersion: environment.mcp.deploymentVersion,
    toolTimeoutMs: environment.mcp.toolTimeoutMs,
    idempotencyTtlSeconds: environment.mcp.idempotencyTtlSeconds,
    features: environment.mcp.features,
    limits: environment.mcp.limits,
  };
}

export function createProductionMcpRuntime(environment: AevumEnvironment = env, logger: AevumLogger = createLogger()) {
  if (environment.nodeEnv === "production" && environment.mcp.authMode !== "supabase") {
    throw new Error("Production MCP runtime requires Supabase authentication.");
  }
  const config = mcpRuntimeConfig(environment);
  const repository = createSupabaseProjectRepository({
    url: required(environment.supabase.url, "SUPABASE_URL"),
    serviceRoleKey: required(environment.supabase.serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
    fetch: timeoutFetch(environment.mcp.databaseTimeoutMs),
  });
  const registry = createToolRegistry();
  const assetStorage =
    environment.storage.provider === "SUPABASE" && environment.storage.bucket
      ? createSupabaseAssetStorage({
          url: required(environment.supabase.url, "SUPABASE_URL"),
          serviceRoleKey: required(environment.supabase.serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
          bucket: environment.storage.bucket,
          fetch: timeoutFetch(environment.mcp.databaseTimeoutMs),
        })
      : undefined;
  registerInitialTools(registry, config, {
    ...(assetStorage ? { assetStorage } : {}),
    vision: visionProviderForEnvironment(environment),
  });
  return createMcpExecutor({
    config,
    authVerifier: authVerifier(environment),
    repository,
    registry,
    rateLimiter: createInMemoryRateLimitProvider(environment.mcp.rateLimit),
    logger,
  });
}
