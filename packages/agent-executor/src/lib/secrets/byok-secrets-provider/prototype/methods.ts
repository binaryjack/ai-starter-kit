import type { IByokSecretsProvider } from '../byok-secrets-provider.types.js'

export async function get(
  this: IByokSecretsProvider,
  key:  string,
): Promise<string | undefined> {
  return this._secrets.get(key);
}

export async function has(this: IByokSecretsProvider, key: string): Promise<boolean> {
  return this._secrets.has(key);
}
