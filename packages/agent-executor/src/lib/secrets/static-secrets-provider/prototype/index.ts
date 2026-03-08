import { StaticSecretsProvider } from '../static-secrets-provider.js';
import { get, has, set }          from './methods.js';

Object.assign(StaticSecretsProvider.prototype, { get, has, set });
