import type { IAnthropicProvider } from '../anthropic-provider.types.js'

export async function isAvailable(this: IAnthropicProvider): Promise<boolean> {
  return this._apiKey.length > 0;
}
