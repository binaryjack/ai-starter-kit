import { EnvSecretsProvider } from '../env-secrets-provider.js';
import { get, has }            from './methods.js';

Object.assign(EnvSecretsProvider.prototype, { get, has });
