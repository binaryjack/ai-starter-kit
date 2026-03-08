import type { ModelFamily }       from '../llm-provider.js';
import type { PromptFrontmatter, ResolvedPrompt } from './prompt-registry.types.js';

import './prototype/index.js';

export interface IPromptRegistry {
  new(promptsDir: string): IPromptRegistry;
  _prompts:    Map<string, ResolvedPrompt>;
  _promptsDir: string;
  loadAll(): Promise<IPromptRegistry>;
  loadFile(filePath: string): Promise<void>;
  resolve(agent: string, family: ModelFamily): ResolvedPrompt | undefined;
  has(agent: string, family: ModelFamily): boolean;
  list(): string[];
  size(): number;
  _makeKey(agent: string, family: ModelFamily): string;
  _parseFrontmatter(raw: string, filePath: string): ResolvedPrompt | null;
}

export const PromptRegistry = function(
  this:       IPromptRegistry,
  promptsDir: string,
) {
  this._promptsDir = promptsDir;
  this._prompts    = new Map<string, ResolvedPrompt>();
} as unknown as IPromptRegistry;
