import type { Embedding, SearchOptions, SearchResult, StoreOptions } from '../vector-memory.js';
export type { Embedding, SearchOptions, SearchResult, StoreOptions };

export interface SqliteVectorMemoryOptions {
  namespace?: string;
  dbPath?: string;
  maxEntries?: number;
}

export interface ISqliteVectorMemory {
  _namespace: string;
  _dbPath: string;
  _maxEntries: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _db: any | null;

  store(id: string, embedding: Embedding, options?: StoreOptions): Promise<void>;
  search(query: Embedding, options?: SearchOptions): Promise<SearchResult[]>;
  deleteEntry(id: string): Promise<void>;
  clear(namespace?: string): Promise<void>;
  size(namespace?: string): Promise<number>;
  close(): void;
  _open(): void;
  _toFloat32(emb: Embedding): Float32Array;
  _cosineSim(a: Float32Array, b: Float32Array): number;
}

export const SqliteVectorMemory = function SqliteVectorMemory(
  this: ISqliteVectorMemory,
  options: SqliteVectorMemoryOptions = {},
) {
  this._namespace  = options.namespace  ?? 'default';
  this._dbPath     = options.dbPath     ?? require('path').join(process.cwd(), '.agents', 'memory.db');
  this._maxEntries = options.maxEntries ?? 10_000;
  this._db         = null;
  this._open();
} as unknown as new (options?: SqliteVectorMemoryOptions) => ISqliteVectorMemory;
