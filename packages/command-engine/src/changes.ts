export interface ChangeSetMetadata {
  readonly commandIds: readonly string[];
  readonly transactionId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
}

export interface ChangeSet {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly updated: readonly string[];
  readonly moved: readonly string[];
  readonly metadata: ChangeSetMetadata;
}

export interface AppliedChanges {
  readonly added?: readonly string[];
  readonly removed?: readonly string[];
  readonly updated?: readonly string[];
  readonly moved?: readonly string[];
}

export function mergeChanges(changes: readonly AppliedChanges[]): Omit<ChangeSet, "metadata"> {
  const collect = (key: keyof AppliedChanges): string[] => [...new Set(changes.flatMap((change) => change[key] ?? []))];
  return {
    added: collect("added"),
    removed: collect("removed"),
    updated: collect("updated"),
    moved: collect("moved"),
  };
}
