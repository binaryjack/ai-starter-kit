import { CompositeSecretsProvider } from '../composite-secrets-provider.js';
import { get, has }                  from './methods.js';

Object.assign(CompositeSecretsProvider.prototype, { get, has });
