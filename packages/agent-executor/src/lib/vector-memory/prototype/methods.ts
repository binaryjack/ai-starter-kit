import {
    Embedding,
    IVectorMemory,
    MemoryEntry,
    SearchOptions,
    SearchResult,
    SerializedMemory,
    StoreOptions,
    VectorMemory,
    VectorMemoryOptions,
} from '../vector-memory.js';

function toFloat32(v: Embedding): Float32Array {
  return v instanceof Float32Array ? v : new Float32Array(v);
}

function normalise(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += a[i] * b[i];
  return sum;
}

export function store(
  this: IVectorMemory,
  id: string,
  embedding: Embedding,
  options: StoreOptions = {},
): void {
  const vec = normalise(toFloat32(embedding));
  const existing = this._entries.findIndex(
    (e) => e.id === id && e.namespace === this._namespace,
  );
  const entry: MemoryEntry = {
    id,
    namespace: this._namespace,
    embedding: vec,
    metadata:  options.metadata ?? {},
    text:      options.text,
    storedAt:  new Date().toISOString(),
  };

  if (existing >= 0) {
    this._entries[existing] = entry;
  } else {
    this._entries.push(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries.shift();
    }
  }
}

export function deleteEntry(this: IVectorMemory, id: string): boolean {
  const before = this._entries.length;
  this._entries = this._entries.filter(
    (e) => !(e.id === id && e.namespace === this._namespace),
  );
  return this._entries.length < before;
}

export function clear(this: IVectorMemory): void {
  this._entries = this._entries.filter((e) => e.namespace !== this._namespace);
}

export function search(
  this: IVectorMemory,
  query: Embedding,
  options: SearchOptions = {},
): SearchResult[] {
  const topK     = options.topK     ?? 5;
  const minScore = options.minScore ?? 0.0;
  const ns       = options.namespace ?? this._namespace;
  const qVec     = normalise(toFloat32(query));

  const scored: Array<{ entry: MemoryEntry; score: number }> = [];
  for (const entry of this._entries) {
    if (entry.namespace !== ns) continue;
    const score = dotProduct(qVec, entry.embedding);
    if (score >= minScore) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ entry, score }) => ({
    id:       entry.id,
    score,
    metadata: entry.metadata,
    text:     entry.text,
    storedAt: entry.storedAt,
  }));
}

export function get(this: IVectorMemory, id: string): MemoryEntry | null {
  return this._entries.find((e) => e.id === id && e.namespace === this._namespace) ?? null;
}

export function size(this: IVectorMemory): number {
  return this._entries.filter((e) => e.namespace === this._namespace).length;
}

export function namespaces(this: IVectorMemory): string[] {
  return [...new Set(this._entries.map((e) => e.namespace))];
}

export function serialise(this: IVectorMemory): SerializedMemory {
  return {
    version: 1,
    entries: this._entries.map((e) => ({
      id:        e.id,
      namespace: e.namespace,
      embedding: Array.from(e.embedding),
      metadata:  e.metadata,
      text:      e.text,
      storedAt:  e.storedAt,
    })),
  };
}

export function deserialise(this: IVectorMemory, snapshot: SerializedMemory): void {
  for (const raw of snapshot.entries) {
    const vec = normalise(new Float32Array(raw.embedding));
    this._entries.push({
      id:        raw.id,
      namespace: raw.namespace,
      embedding: vec,
      metadata:  raw.metadata,
      text:      raw.text,
      storedAt:  raw.storedAt,
    });
  }
}

// Static factory
(VectorMemory as unknown as Record<string, unknown>).fromSnapshot = function (
  snapshot: SerializedMemory,
  options?: VectorMemoryOptions,
): IVectorMemory {
  const mem = new VectorMemory(options);
  mem.deserialise(snapshot);
  return mem;
};
