import { SupervisedAgent } from '../supervised-agent.js';
import { run } from './run.js';
import { name, icon } from './helpers.js';

Object.assign((SupervisedAgent as unknown as { prototype: object }).prototype, {
  run,
  name,
  icon,
});
