/**
 * G-13: Vector Memory — in-process semantic memory with cosine similarity search.
 *
 * Design goals:
 *   - Zero external dependencies; uses Float32Array arithmetic for speed
 *   - Optional provider-backed embeddings (via LLMProvider.embed() when available)
 *   - Pluggable namespace isolation (one store per lane, agent, or run)
 *   - Persistence support: serialize/deserialize to/from JSON
 *
 * Usage:
 *   const mem = new VectorMemory({ namespace: 'backend-lane' });
 *   await mem.store('user-auth', embeddings, { source: 'openapi.yaml' });
 *   const results = await mem.search(queryEmbedding, { topK: 3 });
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Embedding = number[] | Float32Array;

export interface MemoryEntry {
  id: string;
  namespace: string;
  embedding: Float32Array;
  /** Free-form metadata stored alongside the vector */
  metadata: Record<string, unknown>;
  /** Optional text snippet for display / re-ranking */
  text?: string;
  storedAt: string;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
  text?: string;
  storedAt: string;
}

export interface VectorMemoryOptions {
  /** Logical namespace — used to partition entries. Default: 'default' */
  namespace?: string;
  /** Maximum number of entries before oldest are evicted. Default: 10 000 */
  maxEntries?: number;
}

export interface StoreOptions {
  /** Arbitrary metadata to attach to the entry */
  metadata?: Record<string, unknown>;
  /** Human-readable text snippet for the entry */
  text?: string;
}

export interface SearchOptions {
  /** Number of results to return. Default: 5 */
  topK?: number;
  /** Minimum cosine similarity threshold [0, 1]. Default: 0.0 */
  minScore?: number;
  /** Filter by namespace. Default: current store's namespace */
  namespace?: string;
}

// ─── Serialization ────────────────────────────────────────────────────────────

export interface SerializedEntry {
  id: string;
  namespace: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  text?: string;
  storedAt: string;
}

export interface SerializedMemory {
  version: 1;
  entries: SerializedEntry[];
}

// ─── VectorMemory ─────────────────────────────────────────────────────────────

/**
 * In-process vector store backed by a flat Float32Array index.
 *
 * Similarity metric: cosine similarity (L2-normalised dot product).
 * Complexity: O(n × d) per search query — suitable for up to ~50 000 entries
 * at typical embedding dimension (1536).
 *
 * For larger corpora, replace the linear scan with an HNSW or IVF index from
 * a native addon; the API surface is intentionally identical.
 */
export class VectorMemory {
  private readonly namespace: string;
  private readonly maxEntries: number;
  private entries: MemoryEntry[] = [];

  constructor(options: VectorMemoryOptions = {}) {
    this.namespace  = options.namespace  ?? 'default';
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  // ─── Mutation ────────────────────────────────────────────────────────────

  /**
   * Upsert an entry by `id`. If an entry with the same id exists in this
   * namespace it is replaced; otherwise a new entry is appended.
   */
  store(id: string, embedding: Embedding, options: StoreOptions = {}): void {
    const vec = normalise(toFloat32(embedding));

    const existing = this.entries.findIndex(
      (e) => e.id === id && e.namespace === this.namespace,
    );
    const entry: MemoryEntry = {
      id,
      namespace: this.namespace,
      embedding: vec,
      metadata:  options.metadata ?? {},
      text:      options.text,
      storedAt:  new Date().toISOString(),
    };

    if (existing >= 0) {
      this.entries[existing] = entry;
    } else {
      this.entries.push(entry);
      // Evict oldest entries when over capacity
      if (this.entries.length > this.maxEntries) {
        this.entries.shift();
      }
    }
  }

  /** Remove an entry by id in the current namespace. Returns true if removed. */
  delete(id: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter(
      (e) => !(e.id === id && e.namespace === this.namespace),
    );
    return this.entries.length < before;
  }

  /** Clear all entries in the current namespace. */
  clear(): void {
    this.entries = this.entries.filter((e) => e.namespace !== this.namespace);
  }

  // ─── Query ───────────────────────────────────────────────────────────────

  /**
   * Return the `topK` most similar entries to `query` using cosine similarity.
   *
   * @param query   Query embedding (will be L2-normalised internally)
   * @param options Search options (topK, minScore, namespace filter)
   */
  search(query: Embedding, options: SearchOptions = {}): SearchResult[] {
    const topK      = options.topK     ?? 5;
    const minScore  = options.minScore ?? 0.0;
    const ns        = options.namespace ?? this.namespace;
    const qVec      = normalise(toFloat32(query));

    const scored: Array<{ entry: MemoryEntry; score: number }> = [];

    for (const entry of this.entries) {
      if (entry.namespace !== ns) continue;
      const score = dotProduct(qVec, entry.embedding);
      if (score >= minScore) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ entry, score }) => ({
      id:        entry.id,
      score,
      metadata:  entry.metadata,
      text:      entry.text,
      storedAt:  entry.storedAt,
    }));
  }

  /** Retrieve a specific entry by id (null if not found). */
  get(id: string): MemoryEntry | null {
    return (
      this.entries.find((e) => e.id === id && e.namespace === this.namespace) ?? null
    );
  }

  /** Number of entries in the current namespace. */
  get size(): number {
    return this.entries.filter((e) => e.namespace === this.namespace).length;
  }

  /** All namespace keys present in the store. */
  get namespaces(): string[] {
    return [...new Set(this.entries.map((e) => e.namespace))];
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  /** Serialise all entries to a plain JSON-safe object. */
  serialise(): SerializedMemory {
    return {
      version: 1,
      entries: this.entries.map((e) => ({
        id:        e.id,
        namespace: e.namespace,
        embedding: Array.from(e.embedding),
        metadata:  e.metadata,
        text:      e.text,
        storedAt:  e.storedAt,
      })),
    };
  }

  /** Restore entries from a previously serialised snapshot. Appends to existing. */
  deserialise(snapshot: SerializedMemory): void {
    for (const raw of snapshot.entries) {
      const vec = normalise(new Float32Array(raw.embedding));
      this.entries.push({
        id:        raw.id,
        namespace: raw.namespace,
        embedding: vec,
        metadata:  raw.metadata,
        text:      raw.text,
        storedAt:  raw.storedAt,
      });
    }
  }

  /** Create a new VectorMemory from a serialised snapshot. */
  static fromSnapshot(snapshot: SerializedMemory, options?: VectorMemoryOptions): VectorMemory {
    const mem = new VectorMemory(options);
    mem.deserialise(snapshot);
    return mem;
  }
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function toFloat32(v: Embedding): Float32Array {
  return v instanceof Float32Array ? v : new Float32Array(v);
}

/** L2-normalise a vector in-place, returns the same Float32Array. */
function normalise(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

/** Dot product of two pre-normalised vectors (= cosine similarity). */
function dotProduct(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

// ─── Global store registry ────────────────────────────────────────────────────

const _stores = new Map<string, VectorMemory>();

/**
 * Get (or create) a named VectorMemory store.
 * Stores are keyed by namespace string; subsequent calls return the same instance.
 */
export function getVectorStore(namespace: string, options?: VectorMemoryOptions): VectorMemory {
  let store = _stores.get(namespace);
  if (!store) {
    store = new VectorMemory({ ...options, namespace });
    _stores.set(namespace, store);
  }
  return store;
}

/** Clear a named store from the global registry (useful in tests). */
export function clearVectorStore(namespace: string): void {
  _stores.delete(namespace);
}

/** List all registered store namespaces. */
export function listVectorStores(): string[] {
  return [..._stores.keys()];
}
