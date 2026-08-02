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
    AEVUM_FEATURE_FLAGS: z.string().default(""),
    PORT: positiveIntegerFromString.optional(),

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
    BLENDER_EXECUTABLE: optionalString,
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
    MCP_SERVER_HOST: z.string().min(1).default("127.0.0.1"),
    MCP_REQUIRE_AUTH: booleanFromString.default(false),

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
    NETWORK_NAME: z.string().min(1).default("aevum-network"),
    MINIO_ROOT_USER: optionalString,
    MINIO_ROOT_PASSWORD: optionalString,
  })
  .superRefine((variables, context) => {
    if (variables.DATABASE_POOL_MIN > variables.DATABASE_POOL_MAX) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_POOL_MIN"],
        message: "DATABASE_POOL_MIN must not exceed DATABASE_POOL_MAX.",
      });
    }

    if (variables.NODE_ENV === "production" && variables.AEVUM_RUNTIME_MODE === "full") {
      for (const key of requiredInProduction) {
        if (variables[key] === undefined) {
          context.addIssue({ code: "custom", path: [key], message: `${key} is required in production.` });
        }
      }
    }
  });

export type AevumEnvironmentVariables = z.infer<typeof aevumEnvironmentVariablesSchema>;

export interface AevumEnvironment {
  readonly nodeEnv: "development" | "test" | "production";
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly runtimeMode: "foundation" | "full";
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
  readonly cache: { readonly url?: string; readonly queueUrl?: string; readonly redisPort: number };
  readonly services: {
    readonly apiPort: number;
    readonly platformPort?: number;
    readonly mcpPort: number;
    readonly renderWorkerPort: number;
    readonly exportWorkerPort: number;
    readonly blenderBridgePort: number;
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

  return {
    nodeEnv: variables.NODE_ENV,
    logLevel: variables.LOG_LEVEL,
    runtimeMode: variables.AEVUM_RUNTIME_MODE,
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
      ...(variables.BLENDER_EXECUTABLE ? { blenderExecutable: variables.BLENDER_EXECUTABLE } : {}),
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
