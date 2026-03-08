import type { LLMPrompt, LLMResponse } from '../../../llm-provider.js';
import type { IBedrockProvider, ConverseResponse } from '../bedrock-provider.types.js';
import { signRequest } from '../bedrock-sigv4.js';

export async function complete(
  this: IBedrockProvider,
  prompt: LLMPrompt,
  modelId: string,
): Promise<LLMResponse> {
  if (!this._accessKeyId || !this._secretKey) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Bedrock');
  }

  const body = this._buildConverseBody(prompt);
  const json = JSON.stringify(body);
  const { host, path: urlPath } = this._endpoint(modelId, false);

  const sigHeaders = signRequest({
    method:       'POST',
    host,
    path:         urlPath,
    body:         json,
    accessKeyId:  this._accessKeyId,
    secretKey:    this._secretKey,
    sessionToken: this._sessionToken,
    region:       this._region,
    service:      'bedrock',
  });

  const res = await fetch(`https://${host}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...sigHeaders,
    },
    body: json,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bedrock Converse error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as ConverseResponse;
  const text = data.output?.message?.content?.map((c) => c.text).join('') ?? '';

  return {
    content:  text,
    usage: {
      inputTokens:  data.usage?.inputTokens  ?? 0,
      outputTokens: data.usage?.outputTokens ?? 0,
    },
    model:    modelId,
    provider: this.name,
  };
}
