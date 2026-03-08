import { StateStore } from '../state-store.js';
import { save, load, exists, clear, saveSync, loadSync, existsSync, clearSync } from './methods.js';

Object.assign((StateStore as unknown as { prototype: object }).prototype, {
  save,
  load,
  exists,
  clear,
  saveSync,
  loadSync,
  existsSync,
  clearSync,
});
