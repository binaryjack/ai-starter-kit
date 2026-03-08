import type { IOllamaProvider } from '../ollama-provider.types.js';

export async function isAvailable(this: IOllamaProvider): Promise<boolean> {
  try {
    const res = await fetch(`${this._baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
