import * as fs from 'fs/promises';
import * as path from 'path';

import type { IPromptRegistry } from '../prompt-registry.js';

export async function loadAll(this: IPromptRegistry): Promise<IPromptRegistry> {
  let entries: string[];
  try {
    entries = await fs.readdir(this._promptsDir);
  } catch {
    return this;
  }

  const promptFiles = entries.filter((e) => e.endsWith('.prompt.md'));
  await Promise.all(promptFiles.map((f) => this.loadFile(path.join(this._promptsDir, f))));
  return this;
}

export async function loadFile(this: IPromptRegistry, filePath: string): Promise<void> {
  try {
    const raw    = await fs.readFile(filePath, 'utf-8');
    const parsed = this._parseFrontmatter(raw, filePath);
    if (parsed) {
      const key = this._makeKey(parsed.frontmatter.agent, parsed.frontmatter.modelFamily);
      this._prompts.set(key, parsed);
    }
  } catch (err) {
    console.warn(`[PromptRegistry] Failed to load ${filePath}: ${err}`);
  }
}
