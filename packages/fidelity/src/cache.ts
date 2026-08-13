export class FidelityCache<T> {
  readonly #entries = new Map<string, T>();
  #hits = 0;
  #misses = 0;
  constructor(readonly maxEntries = 32) {}
  get(key: string): T | undefined {
    const value = this.#entries.get(key);
    if (value === undefined) this.#misses += 1;
    else this.#hits += 1;
    return value;
  }
  set(key: string, value: T): void {
    if (!this.#entries.has(key) && this.#entries.size >= this.maxEntries)
      this.#entries.delete(this.#entries.keys().next().value as string);
    this.#entries.set(key, value);
  }
  invalidate(prefix: string): number {
    let count = 0;
    for (const key of this.#entries.keys())
      if (key.startsWith(prefix)) {
        this.#entries.delete(key);
        count += 1;
      }
    return count;
  }
  clear(): void {
    this.#entries.clear();
  }
  statistics() {
    return Object.freeze({ hits: this.#hits, misses: this.#misses, entries: this.#entries.size });
  }
}
