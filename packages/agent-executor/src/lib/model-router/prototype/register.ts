import {
  AnthropicProvider,
  type LLMProvider,
  MockProvider,
  OpenAIProvider,
}                              from '../../llm-provider.js';
import type { IModelRouter }   from '../model-router.js';

export function registerProvider(
  this:     IModelRouter,
  provider: LLMProvider,
): IModelRouter {
  this._providers.set(provider.name, provider);
  return this;
}

export async function autoRegister(this: IModelRouter): Promise<IModelRouter> {
  const candidates: LLMProvider[] = [new AnthropicProvider(), new OpenAIProvider()];
  for (const p of candidates) {
    if (await p.isAvailable()) this.registerProvider(p);
  }
  return this;
}

export function useMock(
  this:      IModelRouter,
  responses: Record<string, string> = {},
): IModelRouter {
  return this.registerProvider(new MockProvider(responses));
}
