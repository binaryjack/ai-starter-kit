import { DiscoverySession } from '../discovery-session.js';
import {
    _acknowledgeAnswer,
    _extractProjectName,
    _save,
    _synthesizeInsights,
    run,
} from './methods.js';

Object.assign((DiscoverySession as unknown as { prototype: object }).prototype, {
  run,
  _acknowledgeAnswer,
  _synthesizeInsights,
  _extractProjectName,
  _save,
});
