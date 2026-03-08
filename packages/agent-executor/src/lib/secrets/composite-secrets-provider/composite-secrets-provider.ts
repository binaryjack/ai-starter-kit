import type { SecretsProvider }  from '../secrets.types.js';

import './prototype/index.js';

export interface ICompositeSecretsProvider {
  new(providers: SecretsProvider[]): ICompositeSecretsProvider;
  _providers: SecretsProvider[];
  get(key: string): Promise<string | undefined>;
  has(key: string): Promise<boolean>;
}

export const CompositeSecretsProvider = function(
  this:      ICompositeSecretsProvider,
  providers: SecretsProvider[],
) {
  this._providers = providers;
} as unknown as ICompositeSecretsProvider;
