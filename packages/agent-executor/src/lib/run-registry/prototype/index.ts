import { RunRegistry } from '../run-registry.js'
import { _paths, _read, _upsert, _write } from './helpers.js'
import { complete, create, deleteRun, purgeOld } from './lifecycle.js'
import { get, list, listActive, paths } from './query.js'

Object.assign(RunRegistry.prototype, {
  create,
  complete,
  delete: deleteRun,
  purgeOld,
  paths,
  get,
  list,
  listActive,
  _paths,
  _read,
  _write,
  _upsert,
});
