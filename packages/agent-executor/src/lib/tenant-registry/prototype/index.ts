import { TenantRunRegistry } from '../tenant-registry.js';
import { deleteTenant, exportTenant, listTenants } from './admin.js';
import { _configPath, _runDir } from './helpers.js';
import { appendEvent, complete, create, deleteRun, get, list, listActive, purgeOld } from './lifecycle.js';

Object.assign((TenantRunRegistry as unknown as { prototype: object }).prototype, {
  create,
  complete,
  appendEvent,
  get,
  delete: deleteRun,
  list,
  listActive,
  purgeOld,
  listTenants,
  exportTenant,
  deleteTenant,
  _runDir,
  _configPath,
});
