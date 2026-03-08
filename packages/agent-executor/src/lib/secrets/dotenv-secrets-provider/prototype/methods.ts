import * as fs from 'fs/promises'
import * as path from 'path'

import type { IDotenvSecretsProvider } from '../dotenv-secrets-provider.js'

export async function _load(this: IDotenvSecretsProvider): Promise<Map<string, string>> {
  if (this._cache) return this._cache;

  const merged = new Map<string, string>();

  for (const name of this._fileNames) {
    const filePath = path.join(this._projectRoot, name);
    const content  = await fs.readFile(filePath, 'utf-8').catch(() => '');

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const stripped = line.replace(/^export\s+/, '');
      const eq       = stripped.indexOf('=');
      if (eq < 1) continue;

      const key   = stripped.slice(0, eq).trim();
      let   value = stripped.slice(eq + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      const commentIdx = value.indexOf(' #');
      if (commentIdx > -1) {
        value = value.slice(0, commentIdx).trim();
      }

      if (key) merged.set(key, value);
    }
  }

  this._cache = merged;
  return merged;
}

export function invalidate(this: IDotenvSecretsProvider): void {
  this._cache = null;
}

export async function get(
  this: IDotenvSecretsProvider,
  key:  string,
): Promise<string | undefined> {
  return (await this._load()).get(key);
}

export async function has(this: IDotenvSecretsProvider, key: string): Promise<boolean> {
  return (await this._load()).has(key);
}
