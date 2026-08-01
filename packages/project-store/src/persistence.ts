import type { CanonicalDesignDocument } from "@aevum/document-model";
import type { ProjectHistoryEntry, ProjectMetadata, ProjectSnapshot, Workspace } from "./schemas.js";

export interface PersistedProjectState {
  readonly project: ProjectMetadata;
  readonly document: CanonicalDesignDocument;
  readonly history: readonly ProjectHistoryEntry[];
  readonly historyCursor: number;
  readonly snapshots: readonly ProjectSnapshot[];
}

export interface ProjectPersistenceAdapter {
  loadProject(projectId: string): Promise<PersistedProjectState | null>;
  saveProject(state: PersistedProjectState): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  loadWorkspace(workspaceId: string): Promise<Workspace | null>;
  saveWorkspace(workspace: Workspace): Promise<void>;
}

export interface AutosaveController {
  autosave(state: PersistedProjectState): Promise<void>;
  restore(projectId: string): Promise<PersistedProjectState | null>;
}
