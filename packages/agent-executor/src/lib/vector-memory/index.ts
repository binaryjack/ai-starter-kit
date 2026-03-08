import './prototype/index.js';
export { VectorMemory } from './vector-memory.js';
export type {
    Embedding, IVectorMemory, MemoryEntry, SearchOptions, SearchResult, SerializedEntry,
    SerializedMemory, StoreOptions, VectorMemoryOptions
} from './vector-memory.js';

import type { IVectorMemory, VectorMemoryOptions } from './vector-memory.js';
import { VectorMemory } from './vector-memory.js';

const _stores = new Map<string, IVectorMemory>();

export function getVectorStore(namespace: string, options?: VectorMemoryOptions): IVectorMemory {
  let store = _stores.get(namespace);
  if (!store) {
    store = new VectorMemory({ ...options, namespace });
    _stores.set(namespace, store);
  }
  return store;
}

export function clearVectorStore(namespace: string): void {
  _stores.delete(namespace);
}

export function listVectorStores(): string[] {
  return [..._stores.keys()];
}
