import './prototype/index.js';
export {
    BUILT_IN_SIGNATURES, PromptInjectionDetector,
    PromptInjectionError
} from './prompt-injection-detector.js';
export type {
    InjectionDetectionMode, InjectionDetectorOptions, InjectionScanResult, InjectionSignature, IPromptInjectionDetector
} from './prompt-injection-detector.js';

import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk, ToolExecutorFn } from '../llm-provider.js';
import type { InjectionDetectorOptions } from './prompt-injection-detector.js';
import { PromptInjectionDetector } from './prompt-injection-detector.js';

export function createInjectionSafeProvider(
  inner: LLMProvider,
  options: InjectionDetectorOptions = {},
): LLMProvider {
  const detector = new PromptInjectionDetector(options);
  const mode = options.mode ?? 'warn';

  return {
    name: inner.name,

    isAvailable: () => inner.isAvailable(),

    async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
      detector.enforce(prompt, mode);
      return inner.complete(prompt, modelId);
    },

    stream: inner.stream
      ? async function* (prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk> {
          detector.enforce(prompt, mode);
          yield* inner.stream!(prompt, modelId);
        }
      : undefined,

    completeWithTools: inner.completeWithTools
      ? async (prompt: LLMPrompt, modelId: string, executor: ToolExecutorFn): Promise<LLMResponse> => {
          detector.enforce(prompt, mode);
          return inner.completeWithTools!(prompt, modelId, executor);
        }
      : undefined,
  };
}
