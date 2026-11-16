/**
 * The storage port used by the server's services: exactly the Redis
 * operations they need, nothing more. The Devvit Redis client satisfies it
 * structurally; tests use the in-memory implementation below.
 */

/** An optimistic transaction (WATCH / MULTI / EXEC). */
export type Transaction = {
  multi(): Promise<void>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<unknown>;
  hSetNX(key: string, field: string, value: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  /** Resolves to null (or rejects) when a watched key changed since `watch`. */
  exec(): Promise<unknown[] | null>;
  unwatch(): Promise<unknown>;
};

export type Store = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: { nx?: boolean; expiration?: Date }): Promise<string>;
  del(...keys: string[]): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hDel(key: string, fields: string[]): Promise<number>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zCard(key: string): Promise<number>;
  watch(...keys: string[]): Promise<Transaction>;
};

/** In-memory Store for tests and local tooling, including WATCH semantics. */
export class MemoryStore implements Store {
  readonly #strings = new Map<string, string>();
  readonly #hashes = new Map<string, Map<string, string>>();
  readonly #sorted = new Map<string, Map<string, number>>();
  readonly #versions = new Map<string, number>();

  #touch(key: string): void {
    this.#versions.set(key, (this.#versions.get(key) ?? 0) + 1);
  }

  async get(key: string) {
    return this.#strings.get(key);
  }

  async set(key: string, value: string, options?: { nx?: boolean }) {
    if (options?.nx && this.#strings.has(key)) return '';
    this.#strings.set(key, value);
    this.#touch(key);
    return 'OK';
  }

  async del(...keys: string[]) {
    for (const key of keys) {
      this.#strings.delete(key);
      this.#hashes.delete(key);
      this.#sorted.delete(key);
      this.#touch(key);
    }
  }

  async expire() {
    // Expiry is irrelevant in memory.
  }

  #hash(key: string): Map<string, string> {
    let hash = this.#hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.#hashes.set(key, hash);
    }
    return hash;
  }

  async hGet(key: string, field: string) {
    return this.#hashes.get(key)?.get(field);
  }

  async hSet(key: string, fieldValues: Record<string, string>) {
    const hash = this.#hash(key);
    let added = 0;
    for (const [field, value] of Object.entries(fieldValues)) {
      if (!hash.has(field)) added++;
      hash.set(field, value);
    }
    this.#touch(key);
    return added;
  }

  async hSetNX(key: string, field: string, value: string) {
    const hash = this.#hash(key);
    if (hash.has(field)) return 0;
    hash.set(field, value);
    this.#touch(key);
    return 1;
  }

  async hGetAll(key: string) {
    return Object.fromEntries(this.#hashes.get(key) ?? []);
  }

  async hDel(key: string, fields: string[]) {
    const hash = this.#hashes.get(key);
    const removed = fields.filter((f) => hash?.delete(f)).length;
    if (removed > 0) this.#touch(key);
    return removed;
  }

  async hIncrBy(key: string, field: string, value: number) {
    const hash = this.#hash(key);
    const next = Number(hash.get(field) ?? 0) + value;
    hash.set(field, String(next));
    this.#touch(key);
    return next;
  }

  async zAdd(key: string, ...members: { member: string; score: number }[]) {
    let zset = this.#sorted.get(key);
    if (!zset) {
      zset = new Map();
      this.#sorted.set(key, zset);
    }
    let added = 0;
    for (const { member, score } of members) {
      if (!zset.has(member)) added++;
      zset.set(member, score);
    }
    this.#touch(key);
    return added;
  }

  async zRank(key: string, member: string) {
    const zset = this.#sorted.get(key);
    if (!zset?.has(member)) return undefined;
    const ordered = [...zset.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    return ordered.findIndex(([m]) => m === member);
  }

  async zCard(key: string) {
    return this.#sorted.get(key)?.size ?? 0;
  }

  async watch(...keys: string[]): Promise<Transaction> {
    const seen = new Map(keys.map((key) => [key, this.#versions.get(key) ?? 0]));
    const queue: (() => Promise<unknown>)[] = [];
    let queuing = false;
    const enqueue = (op: () => Promise<unknown>): Promise<unknown> => {
      if (!queuing) return op();
      queue.push(op);
      return Promise.resolve(undefined);
    };
    return {
      multi: async () => {
        queuing = true;
      },
      hSet: (key, fieldValues) => enqueue(() => this.hSet(key, fieldValues)),
      hSetNX: (key, field, value) => enqueue(() => this.hSetNX(key, field, value)),
      expire: (_key, _seconds) => enqueue(() => this.expire()),
      exec: async () => {
        const changed = [...seen].some(([key, version]) => (this.#versions.get(key) ?? 0) !== version);
        if (changed) return null;
        const results: unknown[] = [];
        for (const op of queue) results.push(await op());
        return results;
      },
      unwatch: async () => undefined,
    };
  }
}
