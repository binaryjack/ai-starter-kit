import { Arbiter } from '../arbiter.js';
import { _save, getDecisions, microAlign, raise, runStandardDecisions } from './methods.js';

Object.assign((Arbiter as unknown as { prototype: object }).prototype, {
  raise,
  microAlign,
  getDecisions,
  runStandardDecisions,
  _save,
});
