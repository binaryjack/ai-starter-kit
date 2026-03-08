export type Embedding = number[] | Float32Array;

export interface MemoryEntry {
  id:        string;
  namespace: string;
  embedding: Float32Array;
  metadata:  Record<string, unknown>;
  text?:     string;
  storedAt:  string;
}

export interface SearchResult {
  id:       string;
  score:    number;
  metadata: Record<string, unknown>;
  text?:    string;
  storedAt: string;
}

export interface VectorMemoryOptions {
  namespace?:  string;
  maxEntries?: number;
}

export interface StoreOptions {
  metadata?: Record<string, unknown>;
  text?:     string;
}

export interface SearchOptions {
  topK?:       number;
  minScore?:   number;
  namespace?:  string;
}

export interface SerializedEntry {
  id:        string;
  namespace: string;
  embedding: number[];
  metadata:  Record<string, unknown>;
  text?:     string;
  storedAt:  string;
}

export interface SerializedMemory {
  version: 1;
  entries: SerializedEntry[];
}

export interface IVectorMemory {
  _namespace:  string;
  _maxEntries: number;
  _entries:    MemoryEntry[];
  store(id: string, embedding: Embedding, options?: StoreOptions): void;
  deleteEntry(id: string): boolean;
  clear(): void;
  search(query: Embedding, options?: SearchOptions): SearchResult[];
  get(id: string): MemoryEntry | null;
  size(): number;
  namespaces(): string[];
  serialise(): SerializedMemory;
  deserialise(snapshot: SerializedMemory): void;
}

export const VectorMemory = function (
  this: IVectorMemory,
  options: VectorMemoryOptions = {},
) {
  this._namespace  = options.namespace  ?? 'default';
  this._maxEntries = options.maxEntries ?? 10_000;
  this._entries    = [];
} as unknown as {
  new (options?: VectorMemoryOptions): IVectorMemory;
  fromSnapshot(snapshot: SerializedMemory, options?: VectorMemoryOptions): IVectorMemory;
};
