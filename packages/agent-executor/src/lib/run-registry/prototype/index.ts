import { RunRegistry }                         from '../run-registry.js';
import { create, complete, deleteRun, purgeOld } from './lifecycle.js';
import { paths, get, list, listActive }          from './query.js';
import { _paths, _read, _write, _upsert }        from './helpers.js';

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
