import type { RendererCacheStatistics, RendererOutput } from "./types.js";

export class RendererCache {
  readonly #entries = new Map<string, RendererOutput>();
  readonly #capacity: number;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  get(key: string): RendererOutput | undefined {
    const value = this.#entries.get(key);
    if (!value) {
      this.#misses += 1;
      return undefined;
    }
    this.#hits += 1;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  set(key: string, value: RendererOutput): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.#capacity) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
      this.#evictions += 1;
    }
  }

  clear(): void {
    this.#entries.clear();
  }

  statistics(): RendererCacheStatistics {
    return Object.freeze({
      hits: this.#hits,
      misses: this.#misses,
      entries: this.#entries.size,
      evictions: this.#evictions,
    });
  }
}
