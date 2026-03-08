import type { ModelFamily } from '../../llm-provider.js';
import type { IPromptRegistry } from '../prompt-registry.js';
import type { ResolvedPrompt } from '../prompt-registry.types.js';

export function resolve(
  this:   IPromptRegistry,
  agent:  string,
  family: ModelFamily,
): ResolvedPrompt | undefined {
  const exact = this._prompts.get(this._makeKey(agent, family));
  if (exact) return exact;

  const fallbackOrder: Record<ModelFamily, ModelFamily[]> = {
    opus:   ['opus', 'sonnet', 'haiku'],
    sonnet: ['sonnet', 'haiku', 'opus'],
    haiku:  ['haiku', 'sonnet', 'opus'],
  };

  for (const f of fallbackOrder[family]) {
    const candidate = this._prompts.get(this._makeKey(agent, f));
    if (candidate) return candidate;
  }

  return undefined;
}

export function has(this: IPromptRegistry, agent: string, family: ModelFamily): boolean {
  return this._prompts.has(this._makeKey(agent, family));
}

export function list(this: IPromptRegistry): string[] {
  return [...this._prompts.keys()].sort();
}

export function size(this: IPromptRegistry): number {
  return this._prompts.size;
}
