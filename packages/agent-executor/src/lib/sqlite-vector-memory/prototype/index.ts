import { SqliteVectorMemory } from '../sqlite-vector-memory.js';
import {
    _open,
    clear,
    close,
    deleteEntry,
    instanceCosineSim,
    instanceToFloat32,
    search,
    size,
    store,
} from './methods.js';

Object.assign((SqliteVectorMemory as unknown as { prototype: object }).prototype, {
  _open:      _open,
  store:      store,
  search:     search,
  delete:     deleteEntry,
  clear:      clear,
  size:       size,
  close:      close,
  _toFloat32: instanceToFloat32,
  _cosineSim: instanceCosineSim,
});
