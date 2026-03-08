import { RbacPolicy } from '../rbac.js';
import {
  can,
  canRunLane,
  assertCan,
  checkLanes,
  principalsWith,
  getRateLimits,
  summarize,
  _permissions,
  _matches,
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
