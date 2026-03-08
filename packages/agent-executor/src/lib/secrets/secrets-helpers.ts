import type { SecretsProvider } from './secrets.types.js';
import { EnvSecretsProvider }   from './env-secrets-provider/env-secrets-provider.js';
import { DotenvSecretsProvider } from './dotenv-secrets-provider/dotenv-secrets-provider.js';
import { CompositeSecretsProvider } from './composite-secrets-provider/composite-secrets-provider.js';

export function createDefaultSecretsProvider(projectRoot: string): SecretsProvider {
  return new CompositeSecretsProvider([
    new EnvSecretsProvider(),
    new DotenvSecretsProvider(projectRoot, ['.env.local', '.env']),
  ]);
}

export async function injectSecretsToEnv(
  provider:  SecretsProvider,
  extraKeys: string[] = [],
): Promise<void> {
  const builtInKeys = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'GOOGLE_API_KEY',
    'GEMINI_API_KEY',
    'AIKIT_PRINCIPAL',
  ];

  for (const key of [...builtInKeys, ...extraKeys]) {
    if (process.env[key] !== undefined) continue;
    const value = await provider.get(key);
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}
