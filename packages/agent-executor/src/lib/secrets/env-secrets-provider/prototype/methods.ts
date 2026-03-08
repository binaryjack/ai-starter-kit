import type { IEnvSecretsProvider } from '../env-secrets-provider.js'

export async function get(this: IEnvSecretsProvider, key: string): Promise<string | undefined> {
  return process.env[key];
}

export async function has(this: IEnvSecretsProvider, key: string): Promise<boolean> {
  return key in process.env;
}
