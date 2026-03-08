import { DotenvSecretsProvider }  from '../dotenv-secrets-provider.js';
import { get, has, invalidate, _load } from './methods.js';

Object.assign(DotenvSecretsProvider.prototype, { get, has, invalidate, _load });
