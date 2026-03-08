import { SupervisedAgent } from '../supervised-agent.js'
import { icon, name } from './helpers.js'
import { run } from './run.js'

Object.assign((SupervisedAgent as unknown as { prototype: object }).prototype, {
  run,
  name,
  icon,
});
