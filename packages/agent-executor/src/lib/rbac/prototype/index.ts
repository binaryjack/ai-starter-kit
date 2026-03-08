import { RbacPolicy } from '../rbac.js';
import {
    _matches,
    _permissions,
    assertCan,
    can,
    canRunLane,
    checkLanes,
    getRateLimits,
    principalsWith,
    summarize,
} from './methods.js';

Object.assign(RbacPolicy.prototype, {
  can,
  canRunLane,
  assertCan,
  checkLanes,
  principalsWith,
  getRateLimits,
  summarize,
  _permissions,
  _matches,
});
