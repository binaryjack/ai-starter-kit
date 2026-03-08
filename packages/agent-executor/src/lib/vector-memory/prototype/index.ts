import { VectorMemory } from '../vector-memory.js';
import {
    clear,
    deleteEntry,
    deserialise,
    get,
    namespaces,
    search,
    serialise,
    size,
    store,
} from './methods.js';

Object.assign((VectorMemory as unknown as { prototype: object }).prototype, {
  store, delete: deleteEntry, clear, search, get,
  size, namespaces, serialise, deserialise,
});
