import { z } from "zod";

const booleanFromString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  return value;
}, z.boolean());

const positiveIntegerFromString = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().int().positive());

const nonNegativeIntegerFromString = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return value;
}, z.number().int().nonnegative());

const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url().optional(),
);

const requiredInProduction = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_STORAGE_BUCKET",
  "SUPABASE_JWT_SECRET",
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
] as const;

export const aevumEnvironmentVariablesSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    AEVUM_RUNTIME_MODE: z.enum(["foundation", "full"]).default("full"),
    AEVUM_SERVICE: z.enum(["platform", "api", "mcp-server", "agent-worker"]).default("platform"),
    AEVUM_FEATURE_FLAGS: z.string().default(""),
    PORT: positiveIntegerFromString.optional(),

    API_ALLOWED_ORIGINS: z.string().default(""),
    API_MAX_PAYLOAD_BYTES: positiveIntegerFromString.default(65_536),
    API_REQUEST_TIMEOUT_MS: positiveIntegerFromString.default(15_000),
    API_RATE_LIMIT_PER_MINUTE: positiveIntegerFromString.default(120),
    API_DEPLOYMENT_VERSION: z.string().min(1).default("development"),

    SUPABASE_URL: optionalUrl,
    SUPABASE_ANON_KEY: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_PROJECT_ID: optionalString,
    SUPABASE_STORAGE_BUCKET: optionalString,
    SUPABASE_JWT_SECRET: optionalString,

    DATABASE_URL: optionalUrl,
    DATABASE_URL_DIRECT: optionalUrl,
    DATABASE_SSL_MODE: z.enum(["disable", "prefer", "require", "verify-ca", "verify-full"]).default("require"),
    DATABASE_POOL_MIN: nonNegativeIntegerFromString.default(2),
    DATABASE_POOL_MAX: positiveIntegerFromString.default(10),
    DATABASE_CONNECTION_TIMEOUT_MS: positiveIntegerFromString.default(10_000),
    DATABASE_IDLE_TIMEOUT_MS: positiveIntegerFromString.default(30_000),

    CACHE_URL: optionalUrl,
    QUEUE_URL: optionalUrl,

    LOCAL_FILE_WORKSPACE: z.string().min(1).default("./.aevum-workspace"),
    SANDBOX_ROOT: z.string().min(1).default("./.aevum-sandbox"),
    BLENDER_EXECUTABLE_PATH: optionalString,
    BLENDER_EXECUTABLE: optionalString,
    BLENDER_BRIDGE_HOST: z.string().min(1).default("127.0.0.1"),
    BLENDER_HEADLESS: booleanFromString.default(true),
    BLENDER_MAX_JOB_SECONDS: positiveIntegerFromString.default(600),
    BLENDER_MAX_FILE_MB: positiveIntegerFromString.default(500),
    BLENDER_MAX_OUTPUT_MB: positiveIntegerFromString.default(1_000),
    BLENDER_MAX_OBJECTS: positiveIntegerFromString.default(100_000),
    BLENDER_MAX_MESHES: positiveIntegerFromString.default(50_000),
    BLENDER_MAX_MATERIALS: positiveIntegerFromString.default(10_000),
    BLENDER_MAX_CONCURRENT_JOBS: positiveIntegerFromString.default(1),
    MESH_MAX_SELECTED_ELEMENTS: positiveIntegerFromString.default(100_000),
    MESH_MAX_OUTPUT_VERTICES: positiveIntegerFromString.default(2_000_000),
    MESH_MAX_OUTPUT_FACES: positiveIntegerFromString.default(2_000_000),
    MESH_MAX_TOPOLOGY_GROWTH: positiveIntegerFromString.default(8),
    BEVEL_MAX_SEGMENTS: positiveIntegerFromString.default(8),
    SUBDIVISION_MAX_LEVEL: positiveIntegerFromString.default(3),
    LOOP_CUT_MAX_CUTS: positiveIntegerFromString.default(16),
    UV_MAX_ISLANDS: positiveIntegerFromString.default(10_000),
    MESH_MAX_MODIFIERS: positiveIntegerFromString.default(64),
    BLENDER_TEMP_DIR: optionalString,
    SANDBOX_NETWORK_MODE: z.enum(["disabled", "restricted", "enabled"]).default("restricted"),

    RENDER_WORKER_CONCURRENCY: positiveIntegerFromString.default(1),
    RENDER_WORKER_MAX_PIXELS: positiveIntegerFromString.default(16_777_216),
    SCENE_RUNTIME_STRICT_MODE: booleanFromString.default(true),
    SCENE_RUNTIME_MAX_DEPTH: positiveIntegerFromString.default(1_000),
    SCENE_RUNTIME_MAX_NODES: positiveIntegerFromString.default(100_000),
    SCENE_RUNTIME_ENABLE_CACHE: booleanFromString.default(true),
    SCENE_RUNTIME_CACHE_SIZE: positiveIntegerFromString.default(500),
    SCENE_RUNTIME_DIAGNOSTICS: booleanFromString.default(true),
    SCENE_RUNTIME_INSPECTION_MODE: booleanFromString.default(false),
    RECONSTRUCTION_DEFAULT_QUALITY_MODE: z.enum(["DRAFT", "HIGH_QUALITY", "MAXIMUM_FIDELITY"]).default("DRAFT"),
    RECONSTRUCTION_MAX_REGIONS: positiveIntegerFromString.default(5_000),
    RECONSTRUCTION_MAX_PROPOSAL_NODES: positiveIntegerFromString.default(10_000),
    RECONSTRUCTION_STRICT_MODE: booleanFromString.default(true),
    RECONSTRUCTION_DIAGNOSTICS: booleanFromString.default(true),
    RECONSTRUCTION_ENABLE_COMPONENT_INFERENCE: booleanFromString.default(true),
    RECONSTRUCTION_ENABLE_TOKEN_INFERENCE: booleanFromString.default(true),
    RECONSTRUCTION_ALLOW_RASTER_FALLBACK: booleanFromString.default(true),

    // Vision provider selection defaults to LOCAL so nothing requires Google credentials to run.
    // Google credentials are server-side only (apps/mcp-server) — never read by Studio/browser code.
    VISION_PROVIDER: z.enum(["GOOGLE_CLOUD", "LOCAL"]).default("LOCAL"),
    GOOGLE_CLOUD_PROJECT_ID: optionalString,
    GOOGLE_CLOUD_CLIENT_EMAIL: optionalString,
    GOOGLE_CLOUD_PRIVATE_KEY: optionalString,
    VISION_ANALYSIS_TIMEOUT_MS: positiveIntegerFromString.default(15_000),
    VISION_MAX_LABELS: positiveIntegerFromString.default(10),
    VISION_MAX_OBJECTS: positiveIntegerFromString.default(10),
    VISION_MAX_CALLS_PER_WORKSPACE_PER_DAY: positiveIntegerFromString.default(200),

    MCP_SERVER_HOST: z.string().min(1).default("127.0.0.1"),
    MCP_REQUIRE_AUTH: booleanFromString.default(false),
    MCP_SERVER_PORT: positiveIntegerFromString.default(3010),
    MCP_AUTH_MODE: z.enum(["development", "supabase", "disabled"]).default("development"),
    MCP_ALLOWED_ORIGINS: z.string().default(""),
    MCP_REQUEST_TIMEOUT_MS: positiveIntegerFromString.default(30_000),
    MCP_TOOL_TIMEOUT_MS: positiveIntegerFromString.default(20_000),
    MCP_DATABASE_TIMEOUT_MS: positiveIntegerFromString.default(10_000),
    MCP_AUTH_TIMEOUT_MS: positiveIntegerFromString.default(5_000),
    MCP_MAX_PAYLOAD_BYTES: positiveIntegerFromString.default(1_048_576),
    MCP_MAX_RESPONSE_BYTES: positiveIntegerFromString.default(5_242_880),
    MCP_MAX_TOOL_INPUT_BYTES: positiveIntegerFromString.default(524_288),
    MCP_MAX_NODE_PAYLOAD_BYTES: positiveIntegerFromString.default(262_144),
    MCP_MAX_AUDIT_PAYLOAD_BYTES: positiveIntegerFromString.default(65_536),
    MCP_MAX_BATCH_SIZE: positiveIntegerFromString.default(50),
    MCP_ENABLE_AUDIT_LOGS: booleanFromString.default(true),
    MCP_ENABLE_DRY_RUN: booleanFromString.default(true),
    MCP_ENABLE_TRANSACTIONS: booleanFromString.default(true),
    MCP_ENABLE_IDEMPOTENCY: booleanFromString.default(true),
    MCP_SHUTDOWN_GRACE_MS: positiveIntegerFromString.default(15_000),
    MCP_RATE_LIMIT_ENABLED: booleanFromString.default(true),
    MCP_RATE_LIMIT_READ_PER_MINUTE: positiveIntegerFromString.default(120),
    MCP_RATE_LIMIT_WRITE_PER_MINUTE: positiveIntegerFromString.default(30),
    MCP_IDEMPOTENCY_TTL_SECONDS: positiveIntegerFromString.default(86_400),
    MCP_AUDIT_RETENTION_DAYS: positiveIntegerFromString.default(90),
    MCP_DEPLOYMENT_VERSION: z.string().min(1).default("development"),
    MCP_TRUST_PROXY: booleanFromString.default(false),

    AGENT_ENABLED: booleanFromString.default(true),
    AGENT_MCP_URL: optionalUrl,
    AGENT_FIXTURE_MODE: booleanFromString.default(false),
    AGENT_MAX_STEPS: positiveIntegerFromString.default(50),
    AGENT_MAX_TOOL_CALLS: positiveIntegerFromString.default(100),
    AGENT_MAX_WRITES: nonNegativeIntegerFromString.default(20),
    AGENT_MAX_REPLANS: nonNegativeIntegerFromString.default(5),
    AGENT_MAX_RETRIES: nonNegativeIntegerFromString.default(3),
    AGENT_MAX_EXECUTION_MS: positiveIntegerFromString.default(300_000),
    AGENT_MAX_VALIDATION_PASSES: nonNegativeIntegerFromString.default(5),
    AGENT_CONTEXT_MAX_NODES: positiveIntegerFromString.default(500),
    AGENT_CONTEXT_MAX_ASSETS: positiveIntegerFromString.default(100),
    AGENT_CONTEXT_MAX_TIMELINES: positiveIntegerFromString.default(50),
    AGENT_CONTEXT_MAX_VALIDATION_ISSUES: positiveIntegerFromString.default(200),
    AGENT_CONTEXT_MAX_HISTORY: positiveIntegerFromString.default(50),
    AGENT_CONTEXT_MAX_CHARACTERS: positiveIntegerFromString.default(200_000),
    AGENT_CONTEXT_MAX_TOKENS: positiveIntegerFromString.default(50_000),
    AGENT_APPROVAL_POLICY: z
      .enum(["AUTO_READ", "AUTO_SAFE_WRITE", "REQUIRE_DESTRUCTIVE_APPROVAL", "REQUIRE_ALL_WRITE_APPROVAL"])
      .default("AUTO_SAFE_WRITE"),
    AGENT_DRY_RUN_WRITES: booleanFromString.default(true),
    AGENT_PERSIST_SESSIONS: booleanFromString.default(true),
    AGENT_PERSIST_OBSERVATIONS: booleanFromString.default(true),
    AGENT_REASONING_PROVIDER: z.string().min(1).default("deterministic"),

    COMPOSE_PROJECT_NAME: z.string().min(1).default("aevum"),
    POSTGRES_PORT: positiveIntegerFromString.default(5432),
    REDIS_PORT: positiveIntegerFromString.default(6379),
    MINIO_PORT: positiveIntegerFromString.default(9000),
    MINIO_CONSOLE_PORT: positiveIntegerFromString.default(9001),
    API_PORT: positiveIntegerFromString.default(3001),
    MCP_PORT: positiveIntegerFromString.default(3010),
    RENDER_WORKER_PORT: positiveIntegerFromString.default(3020),
    EXPORT_WORKER_PORT: positiveIntegerFromString.default(3030),
    BLENDER_BRIDGE_PORT: positiveIntegerFromString.default(3040),
    AGENT_WORKER_PORT: positiveIntegerFromString.default(3050),
    NETWORK_NAME: z.string().min(1).default("aevum-network"),
    MINIO_ROOT_USER: optionalString,
    MINIO_ROOT_PASSWORD: optionalString,
  })
  .superRefine((variables, context) => {
    if (!variables.BLENDER_HEADLESS) {
      context.addIssue({
        code: "custom",
        path: ["BLENDER_HEADLESS"],
        message: "Phase 15 requires BLENDER_HEADLESS=true.",
      });
    }
    if (
      variables.BLENDER_EXECUTABLE_PATH &&
      variables.BLENDER_EXECUTABLE &&
      variables.BLENDER_EXECUTABLE_PATH !== variables.BLENDER_EXECUTABLE
    ) {
      context.addIssue({
        code: "custom",
        path: ["BLENDER_EXECUTABLE_PATH"],
        message: "BLENDER_EXECUTABLE_PATH and the legacy BLENDER_EXECUTABLE alias must match when both are set.",
      });
    }
    if (variables.DATABASE_POOL_MIN > variables.DATABASE_POOL_MAX) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_POOL_MIN"],
        message: "DATABASE_POOL_MIN must not exceed DATABASE_POOL_MAX.",
      });
    }

    if (variables.NODE_ENV === "production" && variables.AEVUM_RUNTIME_MODE === "full") {
      const requiredKeys =
        variables.AEVUM_SERVICE === "mcp-server" ||
        variables.AEVUM_SERVICE === "agent-worker" ||
        variables.AEVUM_SERVICE === "api"
          ? (["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PROJECT_ID"] as const)
          : requiredInProduction;
      for (const key of requiredKeys) {
        if (variables[key] === undefined) {
          context.addIssue({ code: "custom", path: [key], message: `${key} is required in production.` });
        }
      }
      if (
        variables.AEVUM_SERVICE !== "agent-worker" &&
        variables.AEVUM_SERVICE !== "api" &&
        variables.MCP_AUTH_MODE !== "supabase"
      ) {
        context.addIssue({
          code: "custom",
          path: ["MCP_AUTH_MODE"],
          message: "MCP_AUTH_MODE must be supabase in a full production runtime.",
        });
      }
      if (
        variables.AEVUM_SERVICE !== "agent-worker" &&
        variables.AEVUM_SERVICE !== "api" &&
        variables.MCP_ALLOWED_ORIGINS.trim() === ""
      ) {
        context.addIssue({
          code: "custom",
          path: ["MCP_ALLOWED_ORIGINS"],
          message: "MCP_ALLOWED_ORIGINS is required in a full production runtime.",
        });
      }
      if (
        variables.AEVUM_SERVICE !== "agent-worker" &&
        variables.AEVUM_SERVICE !== "api" &&
        variables.MCP_SERVER_HOST !== "0.0.0.0"
      ) {
        context.addIssue({
          code: "custom",
          path: ["MCP_SERVER_HOST"],
          message: "MCP_SERVER_HOST must be 0.0.0.0 in a full production runtime.",
        });
      }
      if (variables.AEVUM_SERVICE === "api" && variables.API_ALLOWED_ORIGINS.trim() === "") {
        context.addIssue({
          code: "custom",
          path: ["API_ALLOWED_ORIGINS"],
          message: "API_ALLOWED_ORIGINS is required for a production API runtime.",
        });
      }
      if (variables.AEVUM_SERVICE === "agent-worker") {
        if (!variables.AGENT_ENABLED) {
          context.addIssue({
            code: "custom",
            path: ["AGENT_ENABLED"],
            message: "AGENT_ENABLED must be true for a production agent-worker runtime.",
          });
        }
        if (!variables.AGENT_MCP_URL) {
          context.addIssue({
            code: "custom",
            path: ["AGENT_MCP_URL"],
            message: "AGENT_MCP_URL is required for a production agent-worker runtime.",
          });
        }
        if (variables.AGENT_FIXTURE_MODE) {
          context.addIssue({
            code: "custom",
            path: ["AGENT_FIXTURE_MODE"],
            message: "Deterministic fixture mode is forbidden in a production agent-worker runtime.",
          });
        }
      }
    }
    if (variables.MCP_ALLOWED_ORIGINS.split(",").some((origin) => origin.trim() === "*")) {
      context.addIssue({
        code: "custom",
        path: ["MCP_ALLOWED_ORIGINS"],
        message: "Wildcard MCP origins are forbidden.",
      });
    }
    if (variables.API_ALLOWED_ORIGINS.split(",").some((origin) => origin.trim() === "*")) {
      context.addIssue({
        code: "custom",
        path: ["API_ALLOWED_ORIGINS"],
        message: "Wildcard API origins are forbidden.",
      });
    }
  });

export type AevumEnvironmentVariables = z.infer<typeof aevumEnvironmentVariablesSchema>;

export interface AevumEnvironment {
  readonly nodeEnv: "development" | "test" | "production";
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly runtimeMode: "foundation" | "full";
  readonly service: "platform" | "api" | "mcp-server" | "agent-worker";
  readonly api: {
    readonly allowedOrigins: readonly string[];
    readonly maxPayloadBytes: number;
    readonly requestTimeoutMs: number;
    readonly rateLimitPerMinute: number;
    readonly deploymentVersion: string;
  };
  readonly featureFlags: readonly string[];
  readonly supabase: {
    readonly url?: string;
    readonly anonKey?: string;
    readonly serviceRoleKey?: string;
    readonly projectId?: string;
    readonly jwtSecret?: string;
  };
  readonly database: {
    readonly url?: string;
    readonly directUrl?: string;
    readonly sslMode: AevumEnvironmentVariables["DATABASE_SSL_MODE"];
    readonly poolMin: number;
    readonly poolMax: number;
    readonly connectionTimeoutMs: number;
    readonly idleTimeoutMs: number;
  };
  readonly storage: {
    readonly provider: "SUPABASE";
    readonly bucket?: string;
    readonly minio: {
      readonly port: number;
      readonly consolePort: number;
      readonly rootUser?: string;
      readonly rootPassword?: string;
    };
  };
  readonly paths: {
    readonly workspace: string;
    readonly sandbox: string;
    readonly blenderExecutable?: string;
  };
  readonly blender: {
    readonly executablePath?: string;
    readonly host: string;
    readonly port: number;
    readonly headless: boolean;
    readonly maxJobSeconds: number;
    readonly maxFileBytes: number;
    readonly maxOutputBytes: number;
    readonly maxObjects: number;
    readonly maxMeshes: number;
    readonly maxMaterials: number;
    readonly maxConcurrentJobs: number;
    readonly professional: {
      readonly maxSelectedElements: number;
      readonly maxOutputVertices: number;
      readonly maxOutputFaces: number;
      readonly maxTopologyGrowthRatio: number;
      readonly maxSubdivisionLevel: number;
      readonly maxBevelSegments: number;
      readonly maxLoopCuts: number;
      readonly maxUvIslands: number;
      readonly maxModifiers: number;
    };
    readonly tempDir?: string;
  };
  readonly cache: { readonly url?: string; readonly queueUrl?: string; readonly redisPort: number };
  readonly services: {
    readonly apiPort: number;
    readonly platformPort?: number;
    readonly mcpPort: number;
    readonly renderWorkerPort: number;
    readonly exportWorkerPort: number;
    readonly blenderBridgePort: number;
    readonly agentWorkerPort: number;
    readonly mcpHost: string;
    readonly mcpRequireAuth: boolean;
    readonly renderWorkerConcurrency: number;
    readonly renderWorkerMaxPixels: number;
  };
  readonly sceneRuntime: {
    readonly strictMode: boolean;
    readonly maxDepth: number;
    readonly maxNodes: number;
    readonly enableCache: boolean;
    readonly cacheSize: number;
    readonly diagnostics: boolean;
    readonly inspectionMode: boolean;
  };
  readonly reconstruction: {
    readonly defaultQualityMode: "DRAFT" | "HIGH_QUALITY" | "MAXIMUM_FIDELITY";
    readonly maxRegions: number;
    readonly maxProposalNodes: number;
    readonly strictMode: boolean;
    readonly diagnostics: boolean;
    readonly enableComponentInference: boolean;
    readonly enableTokenInference: boolean;
    readonly allowRasterFallback: boolean;
  };
  readonly vision: {
    readonly provider: "GOOGLE_CLOUD" | "LOCAL";
    readonly googleProjectId?: string;
    readonly googleClientEmail?: string;
    readonly googlePrivateKey?: string;
    readonly analysisTimeoutMs: number;
    readonly maxLabels: number;
    readonly maxObjects: number;
    readonly maxCallsPerWorkspacePerDay: number;
  };
  readonly mcp: {
    readonly host: string;
    readonly port: number;
    readonly authMode: "development" | "supabase" | "disabled";
    readonly allowedOrigins: readonly string[];
    readonly requestTimeoutMs: number;
    readonly toolTimeoutMs: number;
    readonly databaseTimeoutMs: number;
    readonly authenticationTimeoutMs: number;
    readonly shutdownGraceMs: number;
    readonly limits: {
      readonly requestBodyBytes: number;
      readonly responseBytes: number;
      readonly toolInputBytes: number;
      readonly metadataBytes: number;
      readonly nodePayloadBytes: number;
      readonly auditPayloadBytes: number;
      readonly batchSize: number;
    };
    readonly features: {
      readonly auditLogs: boolean;
      readonly dryRun: boolean;
      readonly transactions: boolean;
      readonly idempotency: boolean;
    };
    readonly rateLimit: { readonly enabled: boolean; readonly readPerMinute: number; readonly writePerMinute: number };
    readonly idempotencyTtlSeconds: number;
    readonly auditRetentionDays: number;
    readonly deploymentVersion: string;
    readonly trustProxy: boolean;
  };
  readonly agent: {
    readonly enabled: boolean;
    readonly mcpUrl?: string;
    readonly fixtureMode: boolean;
    readonly approvalPolicy: AevumEnvironmentVariables["AGENT_APPROVAL_POLICY"];
    readonly dryRunWrites: boolean;
    readonly reasoningProvider: string;
    readonly persistSessions: boolean;
    readonly persistObservations: boolean;
    readonly budget: {
      readonly maxSteps: number;
      readonly maxToolCalls: number;
      readonly maxWrites: number;
      readonly maxReplans: number;
      readonly maxRetries: number;
      readonly maxExecutionMs: number;
      readonly maxValidationPasses: number;
    };
    readonly context: {
      readonly maxNodes: number;
      readonly maxAssets: number;
      readonly maxTimelines: number;
      readonly maxValidationIssues: number;
      readonly maxHistoryEntries: number;
      readonly maxCharacters: number;
      readonly maxTokens: number;
    };
  };
  readonly docker: {
    readonly composeProjectName: string;
    readonly postgresPort: number;
    readonly networkName: string;
  };
  readonly sandbox: { readonly networkMode: AevumEnvironmentVariables["SANDBOX_NETWORK_MODE"] };
}

function toEnvironment(variables: AevumEnvironmentVariables): AevumEnvironment {
  const featureFlags = variables.AEVUM_FEATURE_FLAGS.split(",")
    .map((flag) => flag.trim())
    .filter(Boolean);
  const blenderExecutable = variables.BLENDER_EXECUTABLE_PATH ?? variables.BLENDER_EXECUTABLE;

  return {
    nodeEnv: variables.NODE_ENV,
    logLevel: variables.LOG_LEVEL,
    runtimeMode: variables.AEVUM_RUNTIME_MODE,
    service: variables.AEVUM_SERVICE,
    api: {
      allowedOrigins: variables.API_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      maxPayloadBytes: variables.API_MAX_PAYLOAD_BYTES,
      requestTimeoutMs: variables.API_REQUEST_TIMEOUT_MS,
      rateLimitPerMinute: variables.API_RATE_LIMIT_PER_MINUTE,
      deploymentVersion: variables.API_DEPLOYMENT_VERSION,
    },
    featureFlags,
    supabase: {
      ...(variables.SUPABASE_URL ? { url: variables.SUPABASE_URL } : {}),
      ...(variables.SUPABASE_ANON_KEY ? { anonKey: variables.SUPABASE_ANON_KEY } : {}),
      ...(variables.SUPABASE_SERVICE_ROLE_KEY ? { serviceRoleKey: variables.SUPABASE_SERVICE_ROLE_KEY } : {}),
      ...(variables.SUPABASE_PROJECT_ID ? { projectId: variables.SUPABASE_PROJECT_ID } : {}),
      ...(variables.SUPABASE_JWT_SECRET ? { jwtSecret: variables.SUPABASE_JWT_SECRET } : {}),
    },
    database: {
      ...(variables.DATABASE_URL ? { url: variables.DATABASE_URL } : {}),
      ...(variables.DATABASE_URL_DIRECT ? { directUrl: variables.DATABASE_URL_DIRECT } : {}),
      sslMode: variables.DATABASE_SSL_MODE,
      poolMin: variables.DATABASE_POOL_MIN,
      poolMax: variables.DATABASE_POOL_MAX,
      connectionTimeoutMs: variables.DATABASE_CONNECTION_TIMEOUT_MS,
      idleTimeoutMs: variables.DATABASE_IDLE_TIMEOUT_MS,
    },
    storage: {
      provider: "SUPABASE",
      ...(variables.SUPABASE_STORAGE_BUCKET ? { bucket: variables.SUPABASE_STORAGE_BUCKET } : {}),
      minio: {
        port: variables.MINIO_PORT,
        consolePort: variables.MINIO_CONSOLE_PORT,
        ...(variables.MINIO_ROOT_USER ? { rootUser: variables.MINIO_ROOT_USER } : {}),
        ...(variables.MINIO_ROOT_PASSWORD ? { rootPassword: variables.MINIO_ROOT_PASSWORD } : {}),
      },
    },
    paths: {
      workspace: variables.LOCAL_FILE_WORKSPACE,
      sandbox: variables.SANDBOX_ROOT,
      ...(blenderExecutable ? { blenderExecutable } : {}),
    },
    blender: {
      ...(blenderExecutable ? { executablePath: blenderExecutable } : {}),
      host: variables.BLENDER_BRIDGE_HOST,
      port: variables.BLENDER_BRIDGE_PORT,
      headless: variables.BLENDER_HEADLESS,
      maxJobSeconds: variables.BLENDER_MAX_JOB_SECONDS,
      maxFileBytes: variables.BLENDER_MAX_FILE_MB * 1024 * 1024,
      maxOutputBytes: variables.BLENDER_MAX_OUTPUT_MB * 1024 * 1024,
      maxObjects: variables.BLENDER_MAX_OBJECTS,
      maxMeshes: variables.BLENDER_MAX_MESHES,
      maxMaterials: variables.BLENDER_MAX_MATERIALS,
      maxConcurrentJobs: variables.BLENDER_MAX_CONCURRENT_JOBS,
      professional: {
        maxSelectedElements: variables.MESH_MAX_SELECTED_ELEMENTS,
        maxOutputVertices: variables.MESH_MAX_OUTPUT_VERTICES,
        maxOutputFaces: variables.MESH_MAX_OUTPUT_FACES,
        maxTopologyGrowthRatio: variables.MESH_MAX_TOPOLOGY_GROWTH,
        maxSubdivisionLevel: variables.SUBDIVISION_MAX_LEVEL,
        maxBevelSegments: variables.BEVEL_MAX_SEGMENTS,
        maxLoopCuts: variables.LOOP_CUT_MAX_CUTS,
        maxUvIslands: variables.UV_MAX_ISLANDS,
        maxModifiers: variables.MESH_MAX_MODIFIERS,
      },
      ...(variables.BLENDER_TEMP_DIR ? { tempDir: variables.BLENDER_TEMP_DIR } : {}),
    },
    cache: {
      ...(variables.CACHE_URL ? { url: variables.CACHE_URL } : {}),
      ...(variables.QUEUE_URL ? { queueUrl: variables.QUEUE_URL } : {}),
      redisPort: variables.REDIS_PORT,
    },
    services: {
      apiPort: variables.API_PORT,
      ...(variables.PORT ? { platformPort: variables.PORT } : {}),
      mcpPort: variables.MCP_PORT,
      renderWorkerPort: variables.RENDER_WORKER_PORT,
      exportWorkerPort: variables.EXPORT_WORKER_PORT,
      blenderBridgePort: variables.BLENDER_BRIDGE_PORT,
      agentWorkerPort: variables.AGENT_WORKER_PORT,
      mcpHost: variables.MCP_SERVER_HOST,
      mcpRequireAuth: variables.MCP_REQUIRE_AUTH,
      renderWorkerConcurrency: variables.RENDER_WORKER_CONCURRENCY,
      renderWorkerMaxPixels: variables.RENDER_WORKER_MAX_PIXELS,
    },
    sceneRuntime: {
      strictMode: variables.SCENE_RUNTIME_STRICT_MODE,
      maxDepth: variables.SCENE_RUNTIME_MAX_DEPTH,
      maxNodes: variables.SCENE_RUNTIME_MAX_NODES,
      enableCache: variables.SCENE_RUNTIME_ENABLE_CACHE,
      cacheSize: variables.SCENE_RUNTIME_CACHE_SIZE,
      diagnostics: variables.SCENE_RUNTIME_DIAGNOSTICS,
      inspectionMode: variables.SCENE_RUNTIME_INSPECTION_MODE,
    },
    reconstruction: {
      defaultQualityMode: variables.RECONSTRUCTION_DEFAULT_QUALITY_MODE,
      maxRegions: variables.RECONSTRUCTION_MAX_REGIONS,
      maxProposalNodes: variables.RECONSTRUCTION_MAX_PROPOSAL_NODES,
      strictMode: variables.RECONSTRUCTION_STRICT_MODE,
      diagnostics: variables.RECONSTRUCTION_DIAGNOSTICS,
      enableComponentInference: variables.RECONSTRUCTION_ENABLE_COMPONENT_INFERENCE,
      enableTokenInference: variables.RECONSTRUCTION_ENABLE_TOKEN_INFERENCE,
      allowRasterFallback: variables.RECONSTRUCTION_ALLOW_RASTER_FALLBACK,
    },
    vision: {
      provider: variables.VISION_PROVIDER,
      ...(variables.GOOGLE_CLOUD_PROJECT_ID ? { googleProjectId: variables.GOOGLE_CLOUD_PROJECT_ID } : {}),
      ...(variables.GOOGLE_CLOUD_CLIENT_EMAIL ? { googleClientEmail: variables.GOOGLE_CLOUD_CLIENT_EMAIL } : {}),
      ...(variables.GOOGLE_CLOUD_PRIVATE_KEY ? { googlePrivateKey: variables.GOOGLE_CLOUD_PRIVATE_KEY } : {}),
      analysisTimeoutMs: variables.VISION_ANALYSIS_TIMEOUT_MS,
      maxLabels: variables.VISION_MAX_LABELS,
      maxObjects: variables.VISION_MAX_OBJECTS,
      maxCallsPerWorkspacePerDay: variables.VISION_MAX_CALLS_PER_WORKSPACE_PER_DAY,
    },
    mcp: {
      host: variables.MCP_SERVER_HOST,
      port: variables.PORT ?? variables.MCP_SERVER_PORT,
      authMode: variables.MCP_AUTH_MODE,
      allowedOrigins: variables.MCP_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
      requestTimeoutMs: variables.MCP_REQUEST_TIMEOUT_MS,
      toolTimeoutMs: variables.MCP_TOOL_TIMEOUT_MS,
      databaseTimeoutMs: variables.MCP_DATABASE_TIMEOUT_MS,
      authenticationTimeoutMs: variables.MCP_AUTH_TIMEOUT_MS,
      shutdownGraceMs: variables.MCP_SHUTDOWN_GRACE_MS,
      limits: {
        requestBodyBytes: variables.MCP_MAX_PAYLOAD_BYTES,
        responseBytes: variables.MCP_MAX_RESPONSE_BYTES,
        toolInputBytes: variables.MCP_MAX_TOOL_INPUT_BYTES,
        metadataBytes: 16_384,
        nodePayloadBytes: variables.MCP_MAX_NODE_PAYLOAD_BYTES,
        auditPayloadBytes: variables.MCP_MAX_AUDIT_PAYLOAD_BYTES,
        batchSize: variables.MCP_MAX_BATCH_SIZE,
      },
      features: {
        auditLogs: variables.MCP_ENABLE_AUDIT_LOGS,
        dryRun: variables.MCP_ENABLE_DRY_RUN,
        transactions: variables.MCP_ENABLE_TRANSACTIONS,
        idempotency: variables.MCP_ENABLE_IDEMPOTENCY,
      },
      rateLimit: {
        enabled: variables.MCP_RATE_LIMIT_ENABLED,
        readPerMinute: variables.MCP_RATE_LIMIT_READ_PER_MINUTE,
        writePerMinute: variables.MCP_RATE_LIMIT_WRITE_PER_MINUTE,
      },
      idempotencyTtlSeconds: variables.MCP_IDEMPOTENCY_TTL_SECONDS,
      auditRetentionDays: variables.MCP_AUDIT_RETENTION_DAYS,
      deploymentVersion: variables.MCP_DEPLOYMENT_VERSION,
      trustProxy: variables.MCP_TRUST_PROXY,
    },
    agent: {
      enabled: variables.AGENT_ENABLED,
      ...(variables.AGENT_MCP_URL ? { mcpUrl: variables.AGENT_MCP_URL } : {}),
      fixtureMode: variables.AGENT_FIXTURE_MODE,
      approvalPolicy: variables.AGENT_APPROVAL_POLICY,
      dryRunWrites: variables.AGENT_DRY_RUN_WRITES,
      reasoningProvider: variables.AGENT_REASONING_PROVIDER,
      persistSessions: variables.AGENT_PERSIST_SESSIONS,
      persistObservations: variables.AGENT_PERSIST_OBSERVATIONS,
      budget: {
        maxSteps: variables.AGENT_MAX_STEPS,
        maxToolCalls: variables.AGENT_MAX_TOOL_CALLS,
        maxWrites: variables.AGENT_MAX_WRITES,
        maxReplans: variables.AGENT_MAX_REPLANS,
        maxRetries: variables.AGENT_MAX_RETRIES,
        maxExecutionMs: variables.AGENT_MAX_EXECUTION_MS,
        maxValidationPasses: variables.AGENT_MAX_VALIDATION_PASSES,
      },
      context: {
        maxNodes: variables.AGENT_CONTEXT_MAX_NODES,
        maxAssets: variables.AGENT_CONTEXT_MAX_ASSETS,
        maxTimelines: variables.AGENT_CONTEXT_MAX_TIMELINES,
        maxValidationIssues: variables.AGENT_CONTEXT_MAX_VALIDATION_ISSUES,
        maxHistoryEntries: variables.AGENT_CONTEXT_MAX_HISTORY,
        maxCharacters: variables.AGENT_CONTEXT_MAX_CHARACTERS,
        maxTokens: variables.AGENT_CONTEXT_MAX_TOKENS,
      },
    },
    docker: {
      composeProjectName: variables.COMPOSE_PROJECT_NAME,
      postgresPort: variables.POSTGRES_PORT,
      networkName: variables.NETWORK_NAME,
    },
    sandbox: { networkMode: variables.SANDBOX_NETWORK_MODE },
  };
}

export const aevumEnvironmentSchema = aevumEnvironmentVariablesSchema.transform(toEnvironment);

export function parseAevumEnvironment(input: NodeJS.ProcessEnv): AevumEnvironment {
  return aevumEnvironmentSchema.parse(input);
}

export function safeParseAevumEnvironment(
  input: NodeJS.ProcessEnv,
): ReturnType<typeof aevumEnvironmentSchema.safeParse> {
  return aevumEnvironmentSchema.safeParse(input);
}

// This module is the sole process-environment boundary for application code.
export const env = parseAevumEnvironment(process.env);
