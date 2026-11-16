/**
 * The storage port used by the server's services: exactly the Redis
 * operations they need, nothing more. The Devvit Redis client satisfies it
 * structurally; tests use the in-memory implementation below.
 */
export type Store = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: { nx?: boolean }): Promise<string>;
  expire(key: string, seconds: number): Promise<void>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hDel(key: string, fields: string[]): Promise<number>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zCard(key: string): Promise<number>;
};

/** In-memory Store for tests and local tooling. */
export class MemoryStore implements Store {
  readonly #strings = new Map<string, string>();
  readonly #hashes = new Map<string, Map<string, string>>();
  readonly #sorted = new Map<string, Map<string, number>>();

  async get(key: string) {
    return this.#strings.get(key);
  }

  async set(key: string, value: string, options?: { nx?: boolean }) {
    if (options?.nx && this.#strings.has(key)) return '';
    this.#strings.set(key, value);
    return 'OK';
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
    return added;
  }

  async hGetAll(key: string) {
    return Object.fromEntries(this.#hashes.get(key) ?? []);
  }

  async hDel(key: string, fields: string[]) {
    const hash = this.#hashes.get(key);
    return fields.filter((f) => hash?.delete(f)).length;
  }

  async hIncrBy(key: string, field: string, value: number) {
    const hash = this.#hash(key);
    const next = Number(hash.get(field) ?? 0) + value;
    hash.set(field, String(next));
    return next;
  }

  #zset(key: string): Map<string, number> {
    let zset = this.#sorted.get(key);
    if (!zset) {
      zset = new Map();
      this.#sorted.set(key, zset);
    }
    return zset;
  }

  async zAdd(key: string, ...members: { member: string; score: number }[]) {
    const zset = this.#zset(key);
    let added = 0;
    for (const { member, score } of members) {
      if (!zset.has(member)) added++;
      zset.set(member, score);
    }
    return added;
  }

  async zRank(key: string, member: string) {
    const zset = this.#sorted.get(key);
    if (!zset?.has(member)) return undefined;
    const ordered = [...zset.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    return ordered.findIndex(([m]) => m === member);
  }

  async zScore(key: string, member: string) {
    return this.#sorted.get(key)?.get(member);
  }

  async zCard(key: string) {
    return this.#sorted.get(key)?.size ?? 0;
  }
}
