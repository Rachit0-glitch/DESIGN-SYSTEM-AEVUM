export function deepFreeze<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (value instanceof Map) {
    for (const [key, entry] of value) {
      deepFreeze(key);
      deepFreeze(entry);
    }
    return value;
  }
  for (const property of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[property]);
  }
  return Object.freeze(value);
}

class ImmutableMapView<K, V> implements ReadonlyMap<K, V> {
  readonly #map: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#map = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    return this.#map.get(key);
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.#map.entries();
  }

  keys(): MapIterator<K> {
    return this.#map.keys();
  }

  values(): MapIterator<V> {
    return this.#map.values();
  }

  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#map) callbackfn.call(thisArg, value, key, this);
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.#map[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return "ImmutableMap";
  }
}

export function immutableMap<K, V>(entries: Iterable<readonly [K, V]>): ReadonlyMap<K, V> {
  return new ImmutableMapView(entries);
}
