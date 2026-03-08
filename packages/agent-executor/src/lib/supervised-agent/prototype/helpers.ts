import type { ISupervisedAgent } from '../supervised-agent.js'

export function name(this: ISupervisedAgent): string {
  return this._definition.name;
}

export function icon(this: ISupervisedAgent): string {
  return this._definition.icon;
}
