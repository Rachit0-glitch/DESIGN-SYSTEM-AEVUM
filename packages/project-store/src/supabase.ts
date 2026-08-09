import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CanonicalDesignDocumentSchema } from "@aevum/document-model";
import {
  PersistedIdempotencyRecordSchema,
  ProjectRepositoryError,
  StoredDocumentVersionMetadataSchema,
  StoredProjectRecordSchema,
  WorkspaceMembershipRecordSchema,
  type CommitDocumentInput,
  type PersistedIdempotencyRecord,
  type ProjectRepository,
} from "./repository.js";

export const AEVUM_MCP_DATABASE_SCHEMA_VERSION = "202608020001" as const;

export interface SupabaseProjectRepositoryOptions {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly fetch?: typeof fetch;
}

function persistenceError(message: string, error?: { readonly message?: string; readonly details?: string }): never {
  throw new ProjectRepositoryError(
    "PERSISTENCE_ERROR",
    `${message}${error?.message ? `: ${error.message}` : ""}${error?.details ? ` (${error.details})` : ""}`,
  );
}

function mapAudit(record: Readonly<Record<string, unknown>>) {
  return {
    id: record.id,
    request_id: record.requestId,
    correlation_id: record.correlationId,
    actor_id: record.actorId,
    workspace_id: record.workspaceId,
    project_id: record.projectId,
    document_id: record.documentId,
    tool: record.tool,
    tool_version: record.toolVersion,
    input_hash: record.inputHash,
    dry_run: record.dryRun,
    base_version: record.baseVersion,
    result_version: record.resultVersion,
    transaction_id: record.transactionId,
    command_ids: record.commandIds,
    status: record.status,
    error_code: record.errorCode,
    duration_ms: record.durationMs,
    created_at: record.timestamp,
  };
}

function mapIdempotency(record: PersistedIdempotencyRecord) {
  return {
    idempotency_key: record.key,
    actor_id: record.actorId,
    workspace_id: record.workspaceId,
    tool: record.tool,
    input_hash: record.inputHash,
    status: record.status,
    result: record.result,
    expires_at: record.expiresAt,
    created_at: record.createdAt,
  };
}

export function createSupabaseProjectRepository(options: SupabaseProjectRepositoryOptions): ProjectRepository {
  const client: SupabaseClient = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: options.fetch ? { fetch: options.fetch } : {},
  });

  return {
    async getMembership(actorSubject, workspaceId) {
      const { data, error } = await client
        .from("workspace_memberships")
        .select("workspace_id,actor_subject,status,role,permissions,project_ids,updated_at")
        .eq("actor_subject", actorSubject)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) persistenceError("Workspace membership lookup failed", error);
      if (!data) return null;
      return WorkspaceMembershipRecordSchema.parse({
        workspaceId: data.workspace_id,
        actorSubject: data.actor_subject,
        status: data.status,
        role: data.role,
        permissions: data.permissions,
        projectIds: data.project_ids,
        updatedAt: data.updated_at,
      });
    },
    async getProject(workspaceId, projectId) {
      const { data, error } = await client
        .from("projects")
        .select("id,workspace_id,name,status,current_document_id,current_document_version,updated_at")
        .eq("workspace_id", workspaceId)
        .eq("id", projectId)
        .maybeSingle();
      if (error) persistenceError("Project lookup failed", error);
      if (!data) return null;
      return StoredProjectRecordSchema.parse({
        id: data.id,
        workspaceId: data.workspace_id,
        name: data.name,
        status: data.status,
        currentDocumentId: data.current_document_id,
        currentDocumentVersion: data.current_document_version,
        updatedAt: data.updated_at,
      });
    },
    async getCurrentDocument(workspaceId, projectId) {
      const { data, error } = await client
        .from("documents")
        .select("content")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) persistenceError("Current document lookup failed", error);
      return data ? CanonicalDesignDocumentSchema.parse(data.content) : null;
    },
    async getDocumentVersion(workspaceId, projectId, documentId, version) {
      const { data, error } = await client
        .from("document_versions")
        .select("content")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .eq("document_id", documentId)
        .eq("version", version)
        .maybeSingle();
      if (error) persistenceError("Document version lookup failed", error);
      return data ? CanonicalDesignDocumentSchema.parse(data.content) : null;
    },
    async listDocumentVersions(workspaceId, projectId, documentId, options) {
      let query = client
        .from("document_versions")
        .select("document_id,version,created_at,actor_id,transaction_id")
        .eq("workspace_id", workspaceId)
        .eq("project_id", projectId)
        .eq("document_id", documentId)
        .order("version", { ascending: false })
        .limit(options.limit);
      if (options.beforeVersion !== undefined) query = query.lt("version", options.beforeVersion);
      const { data, error } = await query;
      if (error) persistenceError("Document version listing failed", error);
      return (data ?? []).map((entry) =>
        StoredDocumentVersionMetadataSchema.parse({
          documentId: entry.document_id,
          version: entry.version,
          createdAt: entry.created_at,
          actorId: entry.actor_id,
          ...(entry.transaction_id ? { transactionId: entry.transaction_id } : {}),
        }),
      );
    },
    async commitDocument(input: CommitDocumentInput) {
      const { error } = await client.rpc("aevum_mcp_commit_document", {
        p_workspace_id: input.workspaceId,
        p_project_id: input.projectId,
        p_document_id: input.documentId,
        p_expected_version: input.expectedVersion,
        p_document: input.document,
        p_actor_id: input.actorId,
        p_transaction_id: input.transactionId,
        p_audit: mapAudit(input.audit),
        p_idempotency: input.idempotency ? mapIdempotency(input.idempotency) : null,
      });
      if (!error) return;
      const message = `${error.message} ${error.details ?? ""}`;
      const versionMatch = message.match(/AEVUM_VERSION_CONFLICT:(\d+)/);
      if (versionMatch) {
        throw new ProjectRepositoryError("VERSION_CONFLICT", "Document version conflict.", Number(versionMatch[1]));
      }
      if (message.includes("AEVUM_IDEMPOTENCY_CONFLICT")) {
        throw new ProjectRepositoryError("IDEMPOTENCY_CONFLICT", "Idempotency key already exists.");
      }
      persistenceError("Atomic document commit failed", error);
    },
    async appendAudit(record) {
      const { error } = await client.from("mcp_audit_logs").insert(mapAudit(record));
      if (error) persistenceError("MCP audit persistence failed", error);
    },
    async getIdempotency(actorId, workspaceId, key) {
      const { data, error } = await client
        .from("mcp_idempotency_records")
        .select("idempotency_key,actor_id,workspace_id,tool,input_hash,status,result,expires_at,created_at")
        .eq("actor_id", actorId)
        .eq("workspace_id", workspaceId)
        .eq("idempotency_key", key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) persistenceError("Idempotency lookup failed", error);
      if (!data) return null;
      return PersistedIdempotencyRecordSchema.parse({
        key: data.idempotency_key,
        actorId: data.actor_id,
        workspaceId: data.workspace_id,
        tool: data.tool,
        inputHash: data.input_hash,
        status: data.status,
        result: data.result,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      });
    },
    async saveIdempotency(record) {
      const { error } = await client.from("mcp_idempotency_records").insert(mapIdempotency(record));
      if (!error) return;
      if (error.code === "23505") {
        throw new ProjectRepositoryError("IDEMPOTENCY_CONFLICT", "Idempotency key already exists.");
      }
      persistenceError("Idempotency persistence failed", error);
    },
    async readiness() {
      const { data, error } = await client
        .from("aevum_schema_versions")
        .select("version")
        .eq("version", AEVUM_MCP_DATABASE_SCHEMA_VERSION)
        .maybeSingle();
      return {
        ok: !error && data?.version === AEVUM_MCP_DATABASE_SCHEMA_VERSION,
        ...(data?.version ? { schemaVersion: data.version } : {}),
        checks: { supabase: !error, database: !error, schema: data?.version === AEVUM_MCP_DATABASE_SCHEMA_VERSION },
      };
    },
    async close() {},
  };
}
