import { parseAevumEnvironment, safeParseAevumEnvironment } from "@aevum/shared";
import { describe, expect, it } from "vitest";

const validEnvironment = {
  NODE_ENV: "test",
  LOG_LEVEL: "debug",
  AEVUM_RUNTIME_MODE: "full",
  AEVUM_FEATURE_FLAGS: "phase3,local-dev",
  PORT: "8080",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  SUPABASE_PROJECT_ID: "example",
  SUPABASE_STORAGE_BUCKET: "aevum-assets",
  SUPABASE_JWT_SECRET: "jwt-test-secret",
  DATABASE_URL: "postgresql://postgres:password@pooler.example.com:6543/postgres",
  DATABASE_URL_DIRECT: "postgresql://postgres:password@db.example.com:5432/postgres",
  DATABASE_SSL_MODE: "require",
  DATABASE_POOL_MIN: "2",
  DATABASE_POOL_MAX: "10",
  DATABASE_CONNECTION_TIMEOUT_MS: "10000",
  DATABASE_IDLE_TIMEOUT_MS: "30000",
  CACHE_URL: "redis://localhost:6379/0",
  QUEUE_URL: "redis://localhost:6379/1",
  LOCAL_FILE_WORKSPACE: "./.aevum-workspace",
  SANDBOX_ROOT: "./.aevum-sandbox",
  BLENDER_EXECUTABLE: "",
  SANDBOX_NETWORK_MODE: "restricted",
  RENDER_WORKER_CONCURRENCY: "2",
  RENDER_WORKER_MAX_PIXELS: "4096",
  SCENE_RUNTIME_STRICT_MODE: "false",
  SCENE_RUNTIME_MAX_DEPTH: "250",
  SCENE_RUNTIME_MAX_NODES: "5000",
  SCENE_RUNTIME_ENABLE_CACHE: "true",
  SCENE_RUNTIME_CACHE_SIZE: "25",
  SCENE_RUNTIME_DIAGNOSTICS: "true",
  SCENE_RUNTIME_INSPECTION_MODE: "true",
  MCP_SERVER_HOST: "127.0.0.1",
  MCP_REQUIRE_AUTH: "false",
  COMPOSE_PROJECT_NAME: "aevum",
  POSTGRES_PORT: "5432",
  REDIS_PORT: "6379",
  MINIO_PORT: "9000",
  MINIO_CONSOLE_PORT: "9001",
  API_PORT: "3001",
  MCP_PORT: "3010",
  RENDER_WORKER_PORT: "3020",
  EXPORT_WORKER_PORT: "3030",
  BLENDER_BRIDGE_PORT: "3040",
  NETWORK_NAME: "aevum-network",
};

describe("environment validation", () => {
  it("exposes Supabase-first typed configuration groups", () => {
    const environment = parseAevumEnvironment(validEnvironment);

    expect(environment.featureFlags).toEqual(["phase3", "local-dev"]);
    expect(environment.runtimeMode).toBe("full");
    expect(environment.supabase).toMatchObject({
      url: "https://example.supabase.co",
      projectId: "example",
    });
    expect(environment.storage).toMatchObject({ provider: "SUPABASE", bucket: "aevum-assets" });
    expect(environment.database.poolMax).toBe(10);
    expect(environment.paths.blenderExecutable).toBeUndefined();
    expect(environment.services.mcpPort).toBe(3010);
    expect(environment.services.platformPort).toBe(8080);
    expect(environment.sceneRuntime).toEqual({
      strictMode: false,
      maxDepth: 250,
      maxNodes: 5000,
      enableCache: true,
      cacheSize: 25,
      diagnostics: true,
      inspectionMode: true,
    });
    expect(environment.docker.networkName).toBe("aevum-network");
  });

  it("allows blank Supabase placeholders outside production", () => {
    const environment = parseAevumEnvironment({
      NODE_ENV: "development",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      DATABASE_URL: "",
    });

    expect(environment.supabase.url).toBeUndefined();
    expect(environment.database.url).toBeUndefined();
  });

  it("requires Supabase credentials and database URLs in production", () => {
    const result = safeParseAevumEnvironment({ NODE_ENV: "production" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(result.error.issues.map((issue) => issue.path[0])).toContain("DATABASE_URL_DIRECT");
    }
  });

  it("permits a production foundation runtime without unfinished data-service dependencies", () => {
    const environment = parseAevumEnvironment({
      NODE_ENV: "production",
      AEVUM_RUNTIME_MODE: "foundation",
      PORT: "8080",
    });

    expect(environment.runtimeMode).toBe("foundation");
    expect(environment.services.platformPort).toBe(8080);
    expect(environment.database.url).toBeUndefined();
  });

  it("rejects malformed service URLs and inverted pool ranges", () => {
    expect(safeParseAevumEnvironment({ ...validEnvironment, SUPABASE_URL: "not-a-url" }).success).toBe(false);
    expect(
      safeParseAevumEnvironment({ ...validEnvironment, DATABASE_POOL_MIN: "20", DATABASE_POOL_MAX: "10" }).success,
    ).toBe(false);
  });
});
