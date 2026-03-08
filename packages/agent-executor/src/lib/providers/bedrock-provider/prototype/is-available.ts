import type { IBedrockProvider } from '../bedrock-provider.types.js';

export async function isAvailable(this: IBedrockProvider): Promise<boolean> {
  return this._accessKeyId.length > 0 && this._secretKey.length > 0;
}
