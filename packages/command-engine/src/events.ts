export type CommandEventType =
  | "DocumentCreated"
  | "DocumentRenamed"
  | "PageCreated"
  | "PageDeleted"
  | "PageRenamed"
  | "NodeCreated"
  | "NodeDeleted"
  | "NodeMoved"
  | "NodeReparented"
  | "NodeDuplicated"
  | "NodeUpdated"
  | "AssetRegistered"
  | "AssetRemoved"
  | "ReferenceRegistered";

export interface CommandEventDraft {
  readonly type: CommandEventType;
  readonly entityIds: readonly string[];
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface CommandEvent extends CommandEventDraft {
  readonly id: string;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly transactionId: string;
  readonly correlationId: string;
  readonly timestamp: string;
}

export interface CommandEventPublisher {
  publish(events: readonly CommandEvent[]): void;
}

export function createEventPublisher(): CommandEventPublisher & {
  subscribe(listener: (event: CommandEvent) => void): () => void;
} {
  const listeners = new Set<(event: CommandEvent) => void>();
  return {
    publish(events) {
      for (const event of events) for (const listener of listeners) listener(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
