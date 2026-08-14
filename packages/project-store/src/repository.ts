import { CanonicalDesignDocumentSchema, type CanonicalDesignDocument } from "@aevum/document-model";
import { z } from "zod";
import { deepFreeze } from "@aevum/command-engine";
import { WorkspaceIdSchema } from "./schemas.js";

const IsoDateSchema = z.iso.datetime({ offset: true });
const JsonObjectSchema = z.record(z.string(), z.unknown());

export const WorkspaceMembershipRecordSchema = z.strictObject({
  workspaceId: WorkspaceIdSchema,
  actorSubject: z.string().min(1).max(255),
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
  role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER", "AGENT", "SERVICE"]),
  permissions: z.array(z.string().min(1).max(100)),
  projectIds: z.array(z.string().min(1)),
  updatedAt: IsoDateSchema,
});

export const StoredProjectRecordSchema = z.strictObject({
  id: z.string().min(1),
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1).max(255),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  currentDocumentId: z.string().min(1),
  currentDocumentVersion: z.number().int().positive(),
  updatedAt: IsoDateSchema,
});

export const StoredDocumentVersionMetadataSchema = z.strictObject({
  documentId: z.string().min(1),
  version: z.number().int().positive(),
  createdAt: IsoDateSchema,
  actorId: z.string().min(1).max(255),
  transactionId: z.string().min(1).max(128).optional(),
});

export const PersistedAuditRecordSchema = JsonObjectSchema;
export const PersistedIdempotencyRecordSchema = z.strictObject({
  key: z.string().min(8).max(255),
  actorId: z.string().min(1).max(255),
  workspaceId: WorkspaceIdSchema,
  tool: z.string().min(1).max(128),
  inputHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  status: z.enum(["COMPLETED", "FAILED"]),
  result: z.unknown(),
  expiresAt: IsoDateSchema,
  createdAt: IsoDateSchema,
});

export type WorkspaceMembershipRecord = z.infer<typeof WorkspaceMembershipRecordSchema>;
export type StoredProjectRecord = z.infer<typeof StoredProjectRecordSchema>;
export type StoredDocumentVersionMetadata = z.infer<typeof StoredDocumentVersionMetadataSchema>;
export type PersistedIdempotencyRecord = z.infer<typeof PersistedIdempotencyRecordSchema>;

export interface CommitDocumentInput {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly expectedVersion: number;
  readonly document: CanonicalDesignDocument;
  readonly actorId: string;
  readonly transactionId: string;
  readonly audit: Readonly<Record<string, unknown>>;
  readonly idempotency?: PersistedIdempotencyRecord;
}

export interface BootstrapProjectInput {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly actorSubject: string;
  readonly project: StoredProjectRecord;
  readonly document: CanonicalDesignDocument;
}

export interface ProjectRepositoryReadiness {
  readonly ok: boolean;
  readonly schemaVersion?: string;
  readonly checks: Readonly<Record<string, boolean>>;
}

export interface ProjectRepository {
  listMemberships(actorSubject: string): Promise<readonly WorkspaceMembershipRecord[]>;
  getMembership(actorSubject: string, workspaceId: string): Promise<WorkspaceMembershipRecord | null>;
  listProjects(workspaceId: string): Promise<readonly StoredProjectRecord[]>;
  getProject(workspaceId: string, projectId: string): Promise<StoredProjectRecord | null>;
  getCurrentDocument(workspaceId: string, projectId: string): Promise<CanonicalDesignDocument | null>;
  getDocumentVersion(
    workspaceId: string,
    projectId: string,
    documentId: string,
    version: number,
  ): Promise<CanonicalDesignDocument | null>;
  listDocumentVersions(
    workspaceId: string,
    projectId: string,
    documentId: string,
    options: { readonly limit: number; readonly beforeVersion?: number },
  ): Promise<readonly StoredDocumentVersionMetadata[]>;
  commitDocument(input: CommitDocumentInput): Promise<void>;
  appendAudit(record: Readonly<Record<string, unknown>>): Promise<void>;
  getIdempotency(actorId: string, workspaceId: string, key: string): Promise<PersistedIdempotencyRecord | null>;
  saveIdempotency(record: PersistedIdempotencyRecord): Promise<void>;
  bootstrapProject(input: BootstrapProjectInput): Promise<void>;
  readiness(): Promise<ProjectRepositoryReadiness>;
  close(): Promise<void>;
}

export class ProjectRepositoryError extends Error {
  public readonly code: "VERSION_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "PERSISTENCE_ERROR";
  public readonly currentVersion: number | undefined;

  public constructor(
    code: "VERSION_CONFLICT" | "IDEMPOTENCY_CONFLICT" | "PERSISTENCE_ERROR",
    message: string,
    currentVersion?: number,
  ) {
    super(message);
    this.name = "ProjectRepositoryError";
    this.code = code;
    this.currentVersion = currentVersion;
  }
}

export interface InMemoryProjectRepositorySeed {
  readonly memberships: readonly WorkspaceMembershipRecord[];
  readonly projects: readonly StoredProjectRecord[];
  readonly documents: readonly CanonicalDesignDocument[];
}

export function createInMemoryProjectRepository(seed: InMemoryProjectRepositorySeed): ProjectRepository {
  const memberships = new Map(
    seed.memberships.map((record) => [`${record.actorSubject}:${record.workspaceId}`, record]),
  );
  const projects = new Map(seed.projects.map((record) => [`${record.workspaceId}:${record.id}`, record]));
  const documents = new Map<string, CanonicalDesignDocument>();
  const versions = new Map<string, CanonicalDesignDocument>();
  const versionMetadata = new Map<string, StoredDocumentVersionMetadata[]>();
  const audits: Readonly<Record<string, unknown>>[] = [];
  const idempotency = new Map<string, PersistedIdempotencyRecord>();

  for (const document of seed.documents) {
    const parsed = deepFreeze(CanonicalDesignDocumentSchema.parse(structuredClone(document)));
    const project = seed.projects.find((entry) => entry.id === parsed.metadata.projectId);
    if (!project) throw new ProjectRepositoryError("PERSISTENCE_ERROR", "Seed document has no project record.");
    const currentKey = `${project.workspaceId}:${project.id}`;
    documents.set(currentKey, parsed);
    versions.set(`${currentKey}:${parsed.metadata.id}:${parsed.documentVersion}`, parsed);
    versionMetadata.set(`${currentKey}:${parsed.metadata.id}`, [
      {
        documentId: parsed.metadata.id,
        version: parsed.documentVersion,
        createdAt: parsed.metadata.updatedAt,
        actorId: parsed.metadata.updatedBy.id,
      },
    ]);
  }

  return {
    async listMemberships(actorSubject) {
      return [...memberships.values()].filter(
        (record) => record.actorSubject === actorSubject && record.status === "ACTIVE",
      );
    },
    async getMembership(actorSubject, workspaceId) {
      return memberships.get(`${actorSubject}:${workspaceId}`) ?? null;
    },
    async listProjects(workspaceId) {
      return [...projects.values()].filter((record) => record.workspaceId === workspaceId);
    },
    async getProject(workspaceId, projectId) {
      return projects.get(`${workspaceId}:${projectId}`) ?? null;
    },
    async getCurrentDocument(workspaceId, projectId) {
      return documents.get(`${workspaceId}:${projectId}`) ?? null;
    },
    async getDocumentVersion(workspaceId, projectId, documentId, version) {
      return versions.get(`${workspaceId}:${projectId}:${documentId}:${version}`) ?? null;
    },
    async listDocumentVersions(workspaceId, projectId, documentId, options) {
      return [...(versionMetadata.get(`${workspaceId}:${projectId}:${documentId}`) ?? [])]
        .filter((entry) => options.beforeVersion === undefined || entry.version < options.beforeVersion)
        .sort((left, right) => right.version - left.version)
        .slice(0, options.limit);
    },
    async commitDocument(input) {
      const key = `${input.workspaceId}:${input.projectId}`;
      const project = projects.get(key);
      const current = documents.get(key);
      if (!project || !current) throw new ProjectRepositoryError("PERSISTENCE_ERROR", "Project does not exist.");
      if (current.metadata.id !== input.documentId || current.documentVersion !== input.expectedVersion) {
        throw new ProjectRepositoryError("VERSION_CONFLICT", "Document version conflict.", current.documentVersion);
      }
      if (input.document.documentVersion !== input.expectedVersion + 1) {
        throw new ProjectRepositoryError("PERSISTENCE_ERROR", "Committed document version must increment once.");
      }
      if (input.idempotency) {
        const idempotencyKey = `${input.idempotency.actorId}:${input.workspaceId}:${input.idempotency.key}`;
        if (idempotency.has(idempotencyKey)) {
          throw new ProjectRepositoryError("IDEMPOTENCY_CONFLICT", "Idempotency key already exists.");
        }
        idempotency.set(idempotencyKey, deepFreeze(structuredClone(input.idempotency)));
      }
      const next = deepFreeze(CanonicalDesignDocumentSchema.parse(structuredClone(input.document)));
      documents.set(key, next);
      versions.set(`${key}:${input.documentId}:${next.documentVersion}`, next);
      const metadataKey = `${key}:${input.documentId}`;
      versionMetadata.set(metadataKey, [
        ...(versionMetadata.get(metadataKey) ?? []),
        {
          documentId: input.documentId,
          version: next.documentVersion,
          createdAt: next.metadata.updatedAt,
          actorId: input.actorId,
          transactionId: input.transactionId,
        },
      ]);
      projects.set(
        key,
        deepFreeze({
          ...project,
          currentDocumentVersion: next.documentVersion,
          updatedAt: next.metadata.updatedAt,
        }),
      );
      audits.push(deepFreeze(structuredClone(input.audit)));
    },
    async appendAudit(record) {
      audits.push(deepFreeze(structuredClone(record)));
    },
    async getIdempotency(actorId, workspaceId, key) {
      const record = idempotency.get(`${actorId}:${workspaceId}:${key}`);
      if (!record || Date.parse(record.expiresAt) <= Date.now()) return null;
      return record;
    },
    async saveIdempotency(record) {
      const key = `${record.actorId}:${record.workspaceId}:${record.key}`;
      if (idempotency.has(key)) throw new ProjectRepositoryError("IDEMPOTENCY_CONFLICT", "Idempotency key exists.");
      idempotency.set(key, deepFreeze(structuredClone(record)));
    },
    async bootstrapProject(input) {
      if (
        memberships.has(`${input.actorSubject}:${input.workspaceId}`) ||
        projects.has(`${input.workspaceId}:${input.project.id}`)
      ) {
        throw new ProjectRepositoryError("PERSISTENCE_ERROR", "Bootstrap scope already exists.");
      }
      const document = deepFreeze(CanonicalDesignDocumentSchema.parse(structuredClone(input.document)));
      const project = deepFreeze(StoredProjectRecordSchema.parse(structuredClone(input.project)));
      memberships.set(
        `${input.actorSubject}:${input.workspaceId}`,
        deepFreeze(
          WorkspaceMembershipRecordSchema.parse({
            workspaceId: input.workspaceId,
            actorSubject: input.actorSubject,
            status: "ACTIVE",
            role: "OWNER",
            permissions: [],
            projectIds: [project.id],
            updatedAt: project.updatedAt,
          }),
        ),
      );
      projects.set(`${input.workspaceId}:${project.id}`, project);
      documents.set(`${input.workspaceId}:${project.id}`, document);
      versions.set(`${input.workspaceId}:${project.id}:${document.metadata.id}:${document.documentVersion}`, document);
      versionMetadata.set(`${input.workspaceId}:${project.id}:${document.metadata.id}`, [
        {
          documentId: document.metadata.id,
          version: document.documentVersion,
          createdAt: document.metadata.createdAt,
          actorId: input.actorSubject,
        },
      ]);
    },
    async readiness() {
      return { ok: true, schemaVersion: "202608140001", checks: { repository: true, schema: true } };
    },
    async close() {},
  };
}
