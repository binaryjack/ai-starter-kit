import type { LLMPrompt, LLMStreamChunk } from '../../../llm-provider.js';
import type { ConverseStreamEvent, IBedrockProvider } from '../bedrock-provider.types.js';
import { signRequest } from '../bedrock-sigv4.js';

export async function* stream(
  this: IBedrockProvider,
  prompt: LLMPrompt,
  modelId: string,
): AsyncIterable<LLMStreamChunk> {
  if (!this._accessKeyId || !this._secretKey) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for Bedrock');
  }

  const body = this._buildConverseBody(prompt);
  const json = JSON.stringify(body);
  const { host, path: urlPath } = this._endpoint(modelId, true);

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
    throw new Error(`Bedrock ConverseStream error ${res.status}: ${err}`);
  }

  if (!res.body) throw new Error('Bedrock stream: no response body');

  let inputTokens  = 0;
  let outputTokens = 0;
  let remainder    = Buffer.alloc(0);

  for await (const raw of res.body as unknown as AsyncIterable<Uint8Array>) {
    remainder = Buffer.concat([remainder, Buffer.from(raw)]);

    while (remainder.length >= 12) {
      const totalLen   = remainder.readUInt32BE(0);
      const headersLen = remainder.readUInt32BE(4);

      if (remainder.length < totalLen) break;

      const headersStart = 12;
      const payloadStart = headersStart + headersLen;
      const payloadEnd   = totalLen - 4;
      const payload      = remainder.slice(payloadStart, payloadEnd);
      remainder          = remainder.slice(totalLen);

      try {
        const evt = JSON.parse(payload.toString('utf-8')) as ConverseStreamEvent;

        if (evt.contentBlockDelta?.delta?.text) {
          yield { token: evt.contentBlockDelta.delta.text, done: false };
        }
        if (evt.metadata?.usage) {
          inputTokens  = evt.metadata.usage.inputTokens;
          outputTokens = evt.metadata.usage.outputTokens;
        }
        if (evt.messageStop) {
          yield { token: '', done: true, usage: { inputTokens, outputTokens } };
        }
      } catch {
        // skip malformed frames
      }
    }
  }
}
