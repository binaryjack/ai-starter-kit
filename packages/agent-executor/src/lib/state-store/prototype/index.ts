import { StateStore } from '../state-store.js'
import { clear, clearSync, exists, existsSync, load, loadSync, save, saveSync } from './methods.js'

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
