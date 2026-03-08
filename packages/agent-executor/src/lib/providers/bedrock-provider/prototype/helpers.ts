import type { IBedrockProvider, ConverseRequest } from '../bedrock-provider.types.js';
import type { LLMPrompt } from '../../../llm-provider.js';

export function _endpoint(
  this: IBedrockProvider,
  modelId: string,
  stream: boolean,
): { host: string; path: string } {
  const encoded = encodeURIComponent(modelId);
  const suffix  = stream ? '/converse-stream' : '/converse';
  return {
    host: `bedrock-runtime.${this._region}.amazonaws.com`,
    path: `/model/${encoded}${suffix}`,
  };
}

export function _buildConverseBody(
  this: IBedrockProvider,
  prompt: LLMPrompt,
): ConverseRequest {
  const systemMsgs = prompt.messages.filter((m) => m.role === 'system');
  const turnMsgs   = prompt.messages.filter((m) => m.role !== 'system');

  const body: ConverseRequest = {
    messages: turnMsgs.map((m) => ({
      role:    m.role as 'user' | 'assistant',
      content: [{ text: m.content }],
    })),
    inferenceConfig: {
      maxTokens:   prompt.maxTokens   ?? 4096,
      temperature: prompt.temperature ?? 0.7,
    },
  };

  if (systemMsgs.length > 0) {
    body.system = systemMsgs.map((m) => ({ text: m.content }));
  }

  return body;
}
