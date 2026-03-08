import type { IOpenAIProvider } from '../openai-provider.types.js'

export async function isAvailable(this: IOpenAIProvider): Promise<boolean> {
  return this._apiKey.length > 0;
}
