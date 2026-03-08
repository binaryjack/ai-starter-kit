import type { LLMPrompt, TaskType, ToolExecutorFn } from '../../llm-provider.js';
import type { RoutedResponse }                       from '../model-router.types.js';
import type { IModelRouter }                         from '../model-router.js';

export async function route(
  this:             IModelRouter,
  taskType:         TaskType,
  prompt:           LLMPrompt,
  overrideProvider?: string,
): Promise<RoutedResponse> {
  const providerName = overrideProvider ?? this._config.defaultProvider;
  const provider     = this._providers.get(providerName);

  if (!provider) {
    const available = [...this._providers.keys()];
    throw new Error(
      `Provider "${providerName}" is not registered. Available: ${available.join(', ') || 'none'}. ` +
      `Call autoRegister() or registerProvider() first.`,
    );
  }

  const profile = this.profileFor(taskType);
  const modelId = this.modelIdFor(taskType, providerName);

  const basePrompt: LLMPrompt = {
    ...prompt,
    maxTokens:   prompt.maxTokens   ?? profile.maxTokens,
    temperature: prompt.temperature ?? profile.temperature,
  };
  const { prompt: mergedPrompt } = this._piiScrubber.scrubPrompt(basePrompt);

  const response = await this._retry.execute(
    () => this._breakerFor(providerName).execute(() => provider.complete(mergedPrompt, modelId)),
    `${providerName}:${taskType}`,
  );
  const cost = this.estimateCost(
    response.usage.inputTokens,
    response.usage.outputTokens,
    providerName,
    profile.family,
  );

  return { ...response, taskType, estimatedCostUSD: cost };
}

export async function routeWithTools(
  this:             IModelRouter,
  taskType:         TaskType,
  prompt:           LLMPrompt,
  executor:         ToolExecutorFn,
  overrideProvider?: string,
): Promise<RoutedResponse> {
  const providerName = overrideProvider ?? this._config.defaultProvider;
  const provider     = this._providers.get(providerName);

  if (!provider) {
    const available = [...this._providers.keys()];
    throw new Error(
      `Provider "${providerName}" not registered for tool-use. Available: ${available.join(', ') || 'none'}.`,
    );
  }

  const profile = this.profileFor(taskType);
  const modelId = this.modelIdFor(taskType, providerName);
  const rawMerged: LLMPrompt = {
    ...prompt,
    maxTokens:   prompt.maxTokens   ?? profile.maxTokens,
    temperature: prompt.temperature ?? profile.temperature,
  };
  const { prompt: merged } = this._piiScrubber.scrubPrompt(rawMerged);

  const response = await this._retry.execute(
    () => this._breakerFor(providerName).execute(() =>
      provider.completeWithTools
        ? provider.completeWithTools(merged, modelId, executor)
        : provider.complete(merged, modelId),
    ),
    `${providerName}:tools:${taskType}`,
  );

  const cost = this.estimateCost(
    response.usage.inputTokens,
    response.usage.outputTokens,
    providerName,
    profile.family,
  );
  return { ...response, taskType, estimatedCostUSD: cost };
}
