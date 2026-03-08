import type { CheckType } from '../../../agent-types.js'
import { discoverPlugins } from '../../../plugin-api.js'
import type { ICheckHandler } from '../../check-handler.interface.js'

export async function discover(
  this: { _handlers: Map<CheckType, ICheckHandler>; register: (h: ICheckHandler) => unknown },
  nodeModulesDir?: string,
): Promise<void> {
  await discoverPlugins(this as unknown as Parameters<typeof discoverPlugins>[0], nodeModulesDir);
}
