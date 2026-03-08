import type { LLMPrompt, LLMStreamChunk, TaskType } from '../../llm-provider.js';
import type { RoutedResponse }                       from '../model-router.types.js';
import type { IModelRouter }                         from '../model-router.js';

export async function* streamRoute(
  this:             IModelRouter,
  taskType:         TaskType,
  prompt:           LLMPrompt,
  overrideProvider?: string,
  onDone?:          (response: RoutedResponse) => void,
): AsyncIterable<string> {
  const providerName = overrideProvider ?? this._config.defaultProvider;
  const provider     = this._providers.get(providerName);

  if (!provider) {
    const available = [...this._providers.keys()];
    throw new Error(
      `Provider "${providerName}" is not registered for streaming. Available: ${available.join(', ') || 'none'}.`,
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

  let inputTokens  = 0;
  let outputTokens = 0;
  let fullContent  = '';

  const breaker = this._breakerFor(providerName);

  if (provider.stream) {
    const chunks = await this._retry.execute(
      () => breaker.execute(async () => {
        const collected: LLMStreamChunk[] = [];
        for await (const c of provider.stream!(merged, modelId) as AsyncIterable<LLMStreamChunk>) {
          collected.push(c);
        }
        return collected;
      }),
      `${providerName}:stream:${taskType}`,
    );
    for (const chunk of chunks) {
      if (!chunk.done && chunk.token) {
        fullContent += chunk.token;
        yield chunk.token;
      }
      if (chunk.done && chunk.usage) {
        inputTokens  = chunk.usage.inputTokens;
        outputTokens = chunk.usage.outputTokens;
      }
    }
  } else {
    const response = await this._retry.execute(
      () => breaker.execute(() => provider.complete(merged, modelId)),
      `${providerName}:complete:${taskType}`,
    );
    fullContent  = response.content;
    inputTokens  = response.usage.inputTokens;
    outputTokens = response.usage.outputTokens;
    yield fullContent;
  }

  if (onDone) {
    const cost = this.estimateCost(inputTokens, outputTokens, providerName, profile.family);
    onDone({
      content:          fullContent,
      usage:            { inputTokens, outputTokens },
      model:            modelId,
      provider:         providerName,
      taskType,
      estimatedCostUSD: cost,
    });
  }
}
