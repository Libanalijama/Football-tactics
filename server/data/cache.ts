import type { DataEnvelope } from "./types.js";

interface Entry {
  data: unknown;
  fetched: number;
  expires: number;
  staleUntil: number;
}

/** Warm-instance cache only. Stale data is always labelled and expires absolutely. */
export class ProviderCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<DataEnvelope<unknown>>>();

  constructor(
    private readonly maxEntries = 160,
    private readonly now = Date.now,
  ) {}

  async get<T>(
    key: string,
    provider: string,
    ttl: number,
    staleTtl: number,
    load: () => Promise<T>,
  ): Promise<DataEnvelope<T>> {
    const entry = this.entries.get(key);
    const current = this.now();
    if (entry && entry.expires > current)
      return this.envelope<T>(entry, provider, false);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight as Promise<DataEnvelope<T>>;
    const request = (async () => {
      try {
        const data = await Promise.resolve().then(load);
        const fetched = this.now();
        const fresh = {
          data,
          fetched,
          expires: fetched + ttl,
          staleUntil: fetched + ttl + staleTtl,
        };
        this.entries.delete(key);
        this.entries.set(key, fresh);
        while (this.entries.size > this.maxEntries)
          this.entries.delete(this.entries.keys().next().value!);
        return this.envelope<T>(fresh, provider, false);
      } catch (error) {
        if (entry && entry.staleUntil > this.now())
          return this.envelope<T>(entry, provider, true);
        this.entries.delete(key);
        throw error;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, request);
    return request;
  }

  private envelope<T>(
    entry: Entry,
    provider: string,
    stale: boolean,
  ): DataEnvelope<T> {
    return {
      // Clients must never mutate the cache by editing their tactical copy.
      data: structuredClone(entry.data) as T,
      provider,
      retrievedAt: new Date(entry.fetched).toISOString(),
      stale,
      ...(stale
        ? {
            warning:
              "Provider unavailable. Showing a previously retrieved snapshot; check its timestamp before use.",
          }
        : {}),
    };
  }
}
