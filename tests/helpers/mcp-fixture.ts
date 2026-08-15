import { fixtures, type CanonicalDesignDocument } from "@aevum/document-model";
import {
  createInMemoryProjectRepository,
  type CommitDocumentInput,
  type ProjectRepository,
} from "@aevum/project-store";
import {
  createDevelopmentAuthVerifier,
  createInMemoryRateLimitProvider,
  createMcpExecutor,
  createMcpRequestId,
  createToolRegistry,
  registerInitialTools,
  type AssetBytesResolver,
  type AssetStorageAdapter,
  type BlenderToolAdapter,
  type McpServerRuntimeConfig,
} from "@aevum/mcp-server";
import type { StoreAssetRequest, StoredAssetObject } from "@aevum/assets";
import { createLogger } from "@aevum/shared";

export const MCP_TEST_TIME = "2026-08-02T12:00:00.000Z";
export const MCP_TEST_WORKSPACE_ID = "workspace_11111111-1111-4111-8111-111111111111";
export const MCP_OTHER_WORKSPACE_ID = "workspace_22222222-2222-4222-8222-222222222222";

export const mcpTestConfig: McpServerRuntimeConfig = {
  nodeEnv: "test",
  authMode: "development",
  deploymentVersion: "phase-12-test",
  toolTimeoutMs: 2_000,
  idempotencyTtlSeconds: 86_400,
  features: { auditLogs: true, dryRun: true, transactions: true, idempotency: true },
  limits: {
    requestBodyBytes: 1_048_576,
    responseBytes: 5_242_880,
    toolInputBytes: 524_288,
    metadataBytes: 16_384,
    nodePayloadBytes: 262_144,
    auditPayloadBytes: 65_536,
    batchSize: 50,
  },
};

export function createInMemoryAssetBytesResolver(
  bytesByAssetId: Readonly<Record<string, Uint8Array>>,
): AssetBytesResolver {
  return {
    async resolve(assetId: string) {
      return bytesByAssetId[assetId];
    },
  };
}

export function createInMemoryAssetStorage(): AssetStorageAdapter & { readonly objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  async function store(request: StoreAssetRequest, namespace: string): Promise<StoredAssetObject> {
    const path = `${namespace}/${request.expectedHash}`;
    objects.set(path, request.bytes);
    return {
      assetId: request.asset.id,
      uri: `memory:${path}`,
      contentHash: request.expectedHash,
      byteSize: request.bytes.byteLength,
      immutable: true,
    };
  }
  return {
    id: "in-memory-test-storage",
    kind: "LOCAL_FILESYSTEM",
    objects,
    storeOriginal: (request) => store(request, "originals"),
    storeDerivative: (request) => store(request, "derivatives"),
    async read(asset) {
      const bytes = objects.get(asset.source.uri.replace("memory:", ""));
      if (!bytes) throw new Error(`Asset ${asset.id} not found in in-memory test storage.`);
      return bytes;
    },
    async exists(asset) {
      return objects.has(asset.source.uri.replace("memory:", ""));
    },
  };
}

export function createMcpTestFixture(
  options: {
    readonly role?: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" | "AGENT" | "SERVICE";
    readonly document?: CanonicalDesignDocument;
    readonly rateLimit?: { readonly enabled: boolean; readonly readPerMinute: number; readonly writePerMinute: number };
    readonly projectReadDelayMs?: number;
    readonly toolTimeoutMs?: number;
    readonly blenderAdapter?: BlenderToolAdapter;
    readonly assetBytesAdapter?: AssetBytesResolver;
    readonly assetStorageAdapter?: AssetStorageAdapter;
  } = {},
) {
  const document = options.document ?? fixtures.assetDemo();
  const projectId = document.metadata.projectId;
  const actorSubject = "phase-12-actor";
  const audits: Readonly<Record<string, unknown>>[] = [];
  const baseRepository = createInMemoryProjectRepository({
    memberships: [
      {
        workspaceId: MCP_TEST_WORKSPACE_ID,
        actorSubject,
        status: "ACTIVE",
        role: options.role ?? "OWNER",
        permissions: [],
        projectIds: [projectId],
        updatedAt: MCP_TEST_TIME,
      },
    ],
    projects: [
      {
        id: projectId,
        workspaceId: MCP_TEST_WORKSPACE_ID,
        name: "AEVUM MCP Test Project",
        status: "ACTIVE",
        currentDocumentId: document.metadata.id,
        currentDocumentVersion: document.documentVersion,
        updatedAt: document.metadata.updatedAt,
      },
    ],
    documents: [document],
  });
  const repository: ProjectRepository = {
    ...baseRepository,
    async getProject(workspaceId, requestedProjectId) {
      if (options.projectReadDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.projectReadDelayMs));
      }
      return baseRepository.getProject(workspaceId, requestedProjectId);
    },
    async commitDocument(input: CommitDocumentInput) {
      await baseRepository.commitDocument(input);
      audits.push(structuredClone(input.audit));
    },
    async appendAudit(record) {
      await baseRepository.appendAudit(record);
      audits.push(structuredClone(record));
    },
  };
  const config: McpServerRuntimeConfig = {
    ...mcpTestConfig,
    toolTimeoutMs: options.toolTimeoutMs ?? mcpTestConfig.toolTimeoutMs,
  };
  const registry = createToolRegistry();
  registerInitialTools(registry, config, {
    ...(options.blenderAdapter ? { blender: options.blenderAdapter } : {}),
    ...(options.assetBytesAdapter ? { assetBytes: options.assetBytesAdapter } : {}),
    ...(options.assetStorageAdapter ? { assetStorage: options.assetStorageAdapter } : {}),
  });
  const executor = createMcpExecutor({
    config,
    authVerifier: createDevelopmentAuthVerifier({ nodeEnv: "test", subject: actorSubject }),
    repository,
    registry,
    rateLimiter: createInMemoryRateLimitProvider(
      options.rateLimit ?? {
        enabled: true,
        readPerMinute: 1_000,
        writePerMinute: 1_000,
      },
    ),
    logger: createLogger({}, () => {}),
  });

  return {
    actorSubject,
    audits,
    document,
    executor,
    projectId,
    registry,
    repository,
    workspaceId: MCP_TEST_WORKSPACE_ID,
    execute(tool: string, input: unknown, request: Readonly<Record<string, unknown>> = {}) {
      return executor.execute(
        {
          protocolVersion: "1.0.0",
          requestId: createMcpRequestId(),
          workspaceId: MCP_TEST_WORKSPACE_ID,
          projectId,
          documentId: document.metadata.id,
          tool,
          input,
          ...request,
        },
        { ip: "127.0.0.1" },
      );
    },
  };
}
