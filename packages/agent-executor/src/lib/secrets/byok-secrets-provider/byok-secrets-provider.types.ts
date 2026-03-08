/**
 * BYOK (Bring Your Own Key) provider credentials.
 *
 * Keys use the same names as the environment variables the providers read,
 * so this provider can be used as a drop-in replacement for EnvSecretsProvider
 * in cloud / per-request contexts where the caller has already decrypted the
 * customer's API keys from the encrypted vault.
 *
 * The cloud-api layer is responsible for:
 *   1. Fetching the AES-256-GCM encrypted row from `api_keys_enc`
 *   2. Decrypting it in-memory using the Doppler master key
 *   3. Constructing a ByokSecretsProvider with the plaintext keys
 *   4. Discarding the plaintext immediately after the run completes
 *
 * Keys are NEVER logged, written to disk, or returned in API responses.
 */
export interface ByokProviderCredentials {
  /** Anthropic API key → ANTHROPIC_API_KEY */
  ANTHROPIC_API_KEY?: string;
  /** OpenAI API key → OPENAI_API_KEY */
  OPENAI_API_KEY?: string;
  /** Gemini/Google API key → GEMINI_API_KEY */
  GEMINI_API_KEY?: string;
  /** Google API key alias → GOOGLE_API_KEY */
  GOOGLE_API_KEY?: string;
  /** AWS access key for Bedrock → AWS_ACCESS_KEY_ID */
  AWS_ACCESS_KEY_ID?: string;
  /** AWS secret for Bedrock → AWS_SECRET_ACCESS_KEY */
  AWS_SECRET_ACCESS_KEY?: string;
  /** AWS session token for Bedrock → AWS_SESSION_TOKEN */
  AWS_SESSION_TOKEN?: string;
  /** AWS region for Bedrock → AWS_REGION */
  AWS_REGION?: string;
  /** Allow arbitrary extra env-style keys */
  [key: string]: string | undefined;
}

export interface IByokSecretsProvider {
  new(credentials: ByokProviderCredentials): IByokSecretsProvider;
  _secrets: Map<string, string>;
  get(key: string): Promise<string | undefined>;
  has(key: string): Promise<boolean>;
}
