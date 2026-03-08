import './prototype/index.js';

export interface IStaticSecretsProvider {
  new(secrets?: Record<string, string>): IStaticSecretsProvider;
  _secrets: Map<string, string>;
  set(key: string, value: string): IStaticSecretsProvider;
  get(key: string): Promise<string | undefined>;
  has(key: string): Promise<boolean>;
}

export const StaticSecretsProvider = function(
  this:    IStaticSecretsProvider,
  secrets: Record<string, string> = {},
) {
  this._secrets = new Map(Object.entries(secrets));
} as unknown as IStaticSecretsProvider;
