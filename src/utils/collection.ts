export class Collection<K extends string, V> extends Map<K, V> {
  constructor(entries?: readonly (readonly [K, V])[] | null) {
    super(entries);
  }

  get keysArray(): K[] {
    return Array.from(this.keys());
  }

  get valuesArray(): V[] {
    return Array.from(this.values());
  }

  get entriesArray(): [K, V][] {
    return Array.from(this.entries());
  }

  get json(): {
    [key: string]: V;
  } {
    return this.entriesArray.reduce(
      (acc, [key, value]) => {
        acc[key] = value;
        return acc;
      },
      {} as { [key: string]: V }
    );
  }

  find(fn: (value: V) => boolean): V | undefined {
    return this.valuesArray.find(fn);
  }

  findKey(fn: (value: V) => boolean): K | undefined {
    return this.entriesArray.find(([, value]) => fn(value))?.[0];
  }

  filter(fn: (value: V) => boolean): V[] {
    return this.valuesArray.filter(fn);
  }

  map<R>(fn: (value: V) => R): R[] {
    return this.valuesArray.map(fn);
  }

  reduce<A>(fn: (accumulator: A, value: V) => A, accumulator: A): A {
    return this.valuesArray.reduce(fn, accumulator);
  }

  set(key: K, value: V, deleteAfter?: number): this {
    super.set(key, value);
    if (deleteAfter) {
      setTimeout(() => {
        this.delete(key);
      }, deleteAfter);
    }
    return this;
  }
}
