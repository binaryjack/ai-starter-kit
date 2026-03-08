import type { IStaticSecretsProvider } from '../static-secrets-provider.js'

export function set(
  this:  IStaticSecretsProvider,
  key:   string,
  value: string,
): IStaticSecretsProvider {
  this._secrets.set(key, value);
  return this;
}

export async function get(
  this: IStaticSecretsProvider,
  key:  string,
): Promise<string | undefined> {
  return this._secrets.get(key);
}

export async function has(this: IStaticSecretsProvider, key: string): Promise<boolean> {
  return this._secrets.has(key);
}
