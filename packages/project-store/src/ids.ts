import { randomUUID } from "node:crypto";

export function createWorkspaceId(): `workspace_${string}` {
  return `workspace_${randomUUID()}`;
}

export function createSnapshotId(): `snapshot_${string}` {
  return `snapshot_${randomUUID()}`;
}

export function createLockToken(): `lock_${string}` {
  return `lock_${randomUUID()}`;
}
