import type { AuditRecord, ChangeSet, Command, CommandEvent } from "@aevum/command-engine";
import { CommandSchema } from "@aevum/command-engine";
import { EntityIdSchema } from "@aevum/document-model";
import { z } from "zod";

const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const IsoDateSchema = z.iso.datetime({ offset: true });
export const WorkspaceIdSchema = z.string().regex(new RegExp(`^workspace_${uuidPattern}$`, "i"));
export const SnapshotIdSchema = z.string().regex(new RegExp(`^snapshot_${uuidPattern}$`, "i"));
export const LockTokenSchema = z.string().regex(new RegExp(`^lock_${uuidPattern}$`, "i"));

export const ProjectMetadataSchema = z.strictObject({
  id: EntityIdSchema,
  workspaceId: WorkspaceIdSchema,
  name: z.string().trim().min(1).max(255),
  description: z.string(),
  tags: z.array(z.string().min(1)),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});

export const WorkspaceSchema = z.strictObject({
  id: WorkspaceIdSchema,
  name: z.string().trim().min(1).max(255),
  projectIds: z.array(EntityIdSchema),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});

export const OpenDocumentSchema = z.strictObject({
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  documentVersion: z.number().int().positive(),
  openedAt: IsoDateSchema,
  dirty: z.boolean(),
});

export const SnapshotSchema = z.strictObject({
  id: SnapshotIdSchema,
  projectId: EntityIdSchema,
  documentId: EntityIdSchema,
  documentVersion: z.number().int().positive(),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  historyCursor: z.number().int().nonnegative(),
  createdAt: IsoDateSchema,
  createdBy: z.string().min(1),
  serializedDocument: z.string().min(2),
});

export const ProjectLockSchema = z
  .strictObject({
    token: LockTokenSchema,
    ownerId: z.string().min(1),
    acquiredAt: IsoDateSchema,
    expiresAt: IsoDateSchema,
  })
  .refine((lock) => Date.parse(lock.expiresAt) > Date.parse(lock.acquiredAt), {
    path: ["expiresAt"],
    message: "Project lock expiration must be after acquisition.",
  });

export const HistoryEntrySchema = z.strictObject({
  commands: z.array(CommandSchema).min(1),
  documentVersion: z.number().int().positive(),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type OpenDocument = z.infer<typeof OpenDocumentSchema>;
export type ProjectSnapshot = z.infer<typeof SnapshotSchema>;
export type ProjectLock = z.infer<typeof ProjectLockSchema>;

export interface Project {
  readonly metadata: ProjectMetadata;
  readonly currentDocumentId: string;
  readonly currentDocumentVersion: number;
}

export interface ProjectHistoryEntry {
  readonly commands: readonly Command[];
  readonly documentVersion: number;
  readonly changeSet: ChangeSet;
  readonly auditRecord: AuditRecord;
  readonly events: readonly CommandEvent[];
}

export interface ProjectHistory {
  readonly entries: readonly ProjectHistoryEntry[];
  readonly cursor: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
