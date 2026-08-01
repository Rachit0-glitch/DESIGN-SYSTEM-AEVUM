import type { SceneProjectionResult } from "./types.js";

export interface SceneProjectionCacheStatistics {
  readonly hits: number;
  readonly misses: number;
  readonly entries: number;
  readonly evictions: number;
}

export interface SceneProjectionCache {
  get(fingerprint: string): SceneProjectionResult | undefined;
  set(fingerprint: string, projection: SceneProjectionResult): void;
  clear(): void;
  statistics(): SceneProjectionCacheStatistics;
}

export class BoundedSceneProjectionCache implements SceneProjectionCache {
  readonly #capacity: number;
  readonly #entries = new Map<string, SceneProjectionResult>();
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(capacity = 500) {
    if (!Number.isInteger(capacity) || capacity <= 0)
      throw new RangeError("Cache capacity must be a positive integer.");
    this.#capacity = capacity;
  }

  get(fingerprint: string): SceneProjectionResult | undefined {
    const value = this.#entries.get(fingerprint);
    if (!value) {
      this.#misses += 1;
      return undefined;
    }
    this.#hits += 1;
    this.#entries.delete(fingerprint);
    this.#entries.set(fingerprint, value);
    return value;
  }

  set(fingerprint: string, projection: SceneProjectionResult): void {
    this.#entries.delete(fingerprint);
    this.#entries.set(fingerprint, projection);
    if (this.#entries.size <= this.#capacity) return;
    const oldest = this.#entries.keys().next().value;
    if (oldest !== undefined) this.#entries.delete(oldest);
    this.#evictions += 1;
  }

  clear(): void {
    this.#entries.clear();
  }

  statistics(): SceneProjectionCacheStatistics {
    return Object.freeze({
      hits: this.#hits,
      misses: this.#misses,
      entries: this.#entries.size,
      evictions: this.#evictions,
    });
  }
}
