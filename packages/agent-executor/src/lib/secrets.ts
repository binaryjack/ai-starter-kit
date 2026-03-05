/**
 * secrets.ts — Provider-agnostic secrets abstraction for AI-Kit DAG runs.
 *
 * Supports three built-in sources (in priority order when using `CompositeSecretsProvider`):
 *  1. Environment variables  (`EnvSecretsProvider`)
 *  2. `.env` / `.env.local`  (`DotenvSecretsProvider` — zero external dependency)
 *  3. Custom provider         (any object implementing `SecretsProvider`)
 *
 * ## Usage
 * ```typescript
 * // Simple: environment variables only (default when not configured)
 * const secrets = new EnvSecretsProvider();
 * const key = await secrets.get('ANTHROPIC_API_KEY');
 *
 * // Composite: env first, then .env file fallback
 * const secrets = new CompositeSecretsProvider([
 *   new EnvSecretsProvider(),
 *   new DotenvSecretsProvider(projectRoot),
 * ]);
 *
 * // Inject into DagOrchestrator
 * const orchestrator = new DagOrchestrator(projectRoot, { secrets });
 * ```
 *
 * ## DagRunOptions integration
 * When a `secrets` provider is present in `DagRunOptions`, the orchestrator
 * pre-fetches common API keys and sets them as environment variables before
 * launching lanes, so all provider adapters (Anthropic, OpenAI, etc.) continue
 * to work without modification.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Interface ────────────────────────────────────────────────────────────────

/**
 * Minimal secrets provider contract.
 * All built-in providers implement this interface; custom providers can too.
 */
export interface SecretsProvider {
  /**
   * Retrieve a secret by name.
   * @returns The secret value, or `undefined` if not found.
   */
  get(key: string): Promise<string | undefined>;
  /**
   * Check whether a secret exists without revealing its value.
   * Default implementation calls `get()` and checks for non-undefined.
   */
  has(key: string): Promise<boolean>;
}

// ─── Environment variables provider ──────────────────────────────────────────

/**
 * Reads secrets from `process.env`.
 * This is the zero-configuration default — no files or network needed.
 */
export class EnvSecretsProvider implements SecretsProvider {
  async get(key: string): Promise<string | undefined> {
    return process.env[key];
  }

  async has(key: string): Promise<boolean> {
    return key in process.env;
  }
}

// ─── .env file provider ───────────────────────────────────────────────────────

/**
 * Reads secrets from one or more `.env`-style files.
 *
 * Supports the subset of `.env` syntax used in virtually all projects:
 *   - `KEY=value`                   (bare value)
 *   - `KEY="value with spaces"`      (double-quoted)
 *   - `KEY='value with spaces'`      (single-quoted)
 *   - `# comment lines`              (ignored)
 *   - blank lines                    (ignored)
 *   - `export KEY=value`             (`export` prefix stripped)
 *
 * Multi-line values and variable interpolation are NOT supported
 * (zero-dependency constraint).
 *
 * @param projectRoot  Directory to search for `.env` files.
 * @param fileNames    Ordered list of file names to load.
 *                     Later files WIN over earlier ones (like dotenv-flow).
 *                     Defaults to `['.env', '.env.local']`.
 */
export class DotenvSecretsProvider implements SecretsProvider {
  private readonly fileNames: string[];
  private cache: Map<string, string> | null = null;

  constructor(
    private readonly projectRoot: string,
    fileNames: string[] = ['.env', '.env.local'],
  ) {
    this.fileNames = fileNames;
  }

  /** Load and parse all configured .env files, merging into a single map. */
  private async _load(): Promise<Map<string, string>> {
    if (this.cache) return this.cache;

    const merged = new Map<string, string>();

    for (const name of this.fileNames) {
      const filePath = path.join(this.projectRoot, name);
      const content  = await fs.readFile(filePath, 'utf-8').catch(() => '');

      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        // Strip optional `export ` prefix
        const stripped = line.replace(/^export\s+/, '');
        const eq       = stripped.indexOf('=');
        if (eq < 1) continue;

        const key   = stripped.slice(0, eq).trim();
        let   value = stripped.slice(eq + 1).trim();

        // Strip surrounding quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Remove inline comment: `VALUE  # comment`
        // Only strip if outside quotes (already un-quoted above)
        const commentIdx = value.indexOf(' #');
        if (commentIdx > -1) {
          value = value.slice(0, commentIdx).trim();
        }

        if (key) merged.set(key, value);
      }
    }

    this.cache = merged;
    return merged;
  }

  /** Invalidate the in-memory cache (useful in tests or watch mode). */
  invalidate(): void {
    this.cache = null;
  }

  async get(key: string): Promise<string | undefined> {
    return (await this._load()).get(key);
  }

  async has(key: string): Promise<boolean> {
    return (await this._load()).has(key);
  }
}

// ─── Static / in-memory provider (testing) ───────────────────────────────────

/**
 * In-memory secrets store useful for tests and programmatic configuration.
 */
export class StaticSecretsProvider implements SecretsProvider {
  private readonly secrets: Map<string, string>;

  constructor(secrets: Record<string, string> = {}) {
    this.secrets = new Map(Object.entries(secrets));
  }

  /** Add or overwrite a secret at runtime. */
  set(key: string, value: string): this {
    this.secrets.set(key, value);
    return this;
  }

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async has(key: string): Promise<boolean> {
    return this.secrets.has(key);
  }
}

// ─── Composite provider ───────────────────────────────────────────────────────

/**
 * Chain-of-responsibility: tries each provider in order and returns the first
 * defined value found.
 *
 * @example
 * ```typescript
 * const secrets = new CompositeSecretsProvider([
 *   new EnvSecretsProvider(),
 *   new DotenvSecretsProvider(projectRoot),
 * ]);
 * ```
 */
export class CompositeSecretsProvider implements SecretsProvider {
  constructor(private readonly providers: SecretsProvider[]) {}

  async get(key: string): Promise<string | undefined> {
    for (const provider of this.providers) {
      const value = await provider.get(key);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  async has(key: string): Promise<boolean> {
    for (const provider of this.providers) {
      if (await provider.has(key)) return true;
    }
    return false;
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Build the default secrets provider for a project root.
 *
 * Priority order (first match wins):
 *   1. `process.env` variables
 *   2. `.env.local` file (gitignored overrides)
 *   3. `.env` file (shared defaults committed to the repo)
 *
 * @param projectRoot  Root directory to search for `.env` files.
 */
export function createDefaultSecretsProvider(projectRoot: string): SecretsProvider {
  return new CompositeSecretsProvider([
    new EnvSecretsProvider(),
    new DotenvSecretsProvider(projectRoot, ['.env.local', '.env']),
  ]);
}

/**
 * Apply secrets to `process.env` for a known set of API key names.
 * Only sets variables that are NOT already defined in the environment,
 * so explicit `process.env` values always take precedence.
 *
 * Common AI provider keys populated automatically:
 *   - `ANTHROPIC_API_KEY`
 *   - `OPENAI_API_KEY`
 *   - `AZURE_OPENAI_API_KEY`
 *   - `GOOGLE_API_KEY` / `GEMINI_API_KEY`
 *   - `AIKIT_PRINCIPAL` (RBAC)
 *
 * @param provider   Secrets provider to query.
 * @param extraKeys  Additional key names to inject (beyond the built-in list).
 */
export async function injectSecretsToEnv(
  provider: SecretsProvider,
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
    if (process.env[key] !== undefined) continue;  // already set — don't overwrite
    const value = await provider.get(key);
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}
