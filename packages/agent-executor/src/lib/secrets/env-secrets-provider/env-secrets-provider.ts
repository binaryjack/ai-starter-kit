import './prototype/index.js';

export interface IEnvSecretsProvider {
  new(): IEnvSecretsProvider;
  get(key: string): Promise<string | undefined>;
  has(key: string): Promise<boolean>;
}

export const EnvSecretsProvider = function(this: IEnvSecretsProvider) {
  // no state
} as unknown as IEnvSecretsProvider;
