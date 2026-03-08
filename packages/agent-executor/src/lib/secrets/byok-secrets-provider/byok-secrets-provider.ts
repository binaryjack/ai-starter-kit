import type { ByokProviderCredentials, IByokSecretsProvider } from './byok-secrets-provider.types.js'
import { get, has } from './prototype/index.js'

/**
 * In-memory secrets provider backed by BYOK (Bring Your Own Key) credentials.
 *
 * The cloud-api decrypts customer API keys from the AES-256-GCM vault immediately
 * before a run and constructs this provider. Keys exist in plaintext only for the
 * duration of the run and are never written to disk, logged, or returned in
 * API responses.
 *
 * Usage (cloud-api run handler):
 *   const decrypted = await vault.decrypt(tenantId, providerId);
 *   const secrets   = new ByokSecretsProvider({ ANTHROPIC_API_KEY: decrypted });
 *   const router    = await ModelRouter.fromConfig(config);
 *   router.registerProvider(new AnthropicProvider(decrypted));
 *
 * Usage via SecretsProvider chain (composite):
 *   const secrets = new CompositeSecretsProvider([
 *     new ByokSecretsProvider({ ANTHROPIC_API_KEY: decrypted }),
 *     new EnvSecretsProvider(),   // fallback for non-BYOK keys
 *   ]);
 */
export const ByokSecretsProvider = function(
  this:        IByokSecretsProvider,
  credentials: ByokProviderCredentials,
) {
  this._secrets = new Map(
    Object.entries(credentials).filter(([, v]) => v !== undefined) as [string, string][],
  );
} as unknown as IByokSecretsProvider;

Object.assign(ByokSecretsProvider.prototype, { get, has });
