import type { IGeminiProvider } from '../gemini-provider.types.js';

export async function isAvailable(this: IGeminiProvider): Promise<boolean> {
  return this._apiKey.length > 0;
}
