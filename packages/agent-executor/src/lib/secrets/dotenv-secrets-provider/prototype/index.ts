import { DotenvSecretsProvider } from '../dotenv-secrets-provider.js';
import { _load, get, has, invalidate } from './methods.js';

Object.assign(DotenvSecretsProvider.prototype, { get, has, invalidate, _load });
