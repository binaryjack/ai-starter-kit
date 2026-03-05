/**
 * E10 — AWS Bedrock provider via the Converse API.
 *
 * Uses the AWS Bedrock Runtime Converse API for a unified interface across all
 * Bedrock-hosted models (Claude Sonnet/Haiku on Bedrock, Titan, Llama, etc.).
 *
 * Authentication — standard AWS credential chain (in priority order):
 *   1. Constructor parameters (apiKey = accessKeyId, secretKey, sessionToken)
 *   2. Environment variables:
 *        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (optional)
 *   3. Region: AWS_REGION || AWS_DEFAULT_REGION (default: us-east-1)
 *
 * Signing: AWS Signature Version 4 implemented with Node's built-in `crypto`
 * module — zero additional dependencies.
 *
 * Model mapping defaults (override per model-router.json):
 *   haiku  → us.anthropic.claude-haiku-4-5-20241022-v1:0
 *   sonnet → us.anthropic.claude-sonnet-4-5-20241022-v1:0
 *   opus   → us.anthropic.claude-opus-4-5-20240229-v1:0
 *
 * Add to model-router.json providers section:
 * {
 *   "bedrock": {
 *     "models": {
 *       "haiku":  "us.anthropic.claude-haiku-4-5-20241022-v1:0",
 *       "sonnet": "us.anthropic.claude-sonnet-4-5-20241022-v1:0",
 *       "opus":   "us.anthropic.claude-opus-4-5-20240229-v1:0"
 *     },
 *     "costs": { "inputPerMillion": 0.80, "outputPerMillion": 4.00 }
 *   }
 * }
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID       — IAM access key
 *   AWS_SECRET_ACCESS_KEY   — IAM secret key
 *   AWS_SESSION_TOKEN       — (optional) for assumed-role / SSO credentials
 *   AWS_REGION              — e.g. "us-east-1" (default)
 */

import { createHash, createHmac } from 'crypto'
import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk } from '../llm-provider.js'

// ─── AWS SigV4 helpers ────────────────────────────────────────────────────────

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function deriveSigV4Key(secretKey: string, date: string, region: string, service: string): Buffer {
  const kDate    = hmacSha256(`AWS4${secretKey}`, date);
  const kRegion  = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

interface SigV4Headers {
  Authorization: string;
  'x-amz-date': string;
  'x-amz-security-token'?: string;
  host: string;
}

function signRequest(params: {
  method:       string;
  host:         string;
  path:         string;
  body:         string;
  accessKeyId:  string;
  secretKey:    string;
  sessionToken?: string;
  region:       string;
  service:      string;
}): SigV4Headers {
  const now = new Date();
  const amzDate  = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');  // YYYYMMDDTHHMMSSZ
  const dateOnly = amzDate.slice(0, 8);                                              // YYYYMMDD

  const payloadHash = sha256Hex(params.body);

  // ─ Canonical request ───────────────────────────────────────────────────────
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'host':         params.host,
    'x-amz-date':   amzDate,
  };
  if (params.sessionToken) {
    headers['x-amz-security-token'] = params.sessionToken;
  }

  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v.trim()}\n`)
    .join('');

  const signedHeaders = Object.keys(headers).sort().join(';');

  const canonicalRequest = [
    params.method,
    params.path,
    '',                   // query string (empty)
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // ─ String to sign ──────────────────────────────────────────────────────────
  const credentialScope = `${dateOnly}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // ─ Signing key + signature ─────────────────────────────────────────────────
  const signingKey = deriveSigV4Key(params.secretKey, dateOnly, params.region, params.service);
  const signature  = hmacSha256(signingKey, stringToSign).toString('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const result: SigV4Headers = {
    Authorization: authorization,
    'x-amz-date':  amzDate,
    host:          params.host,
  };
  if (params.sessionToken) {
    result['x-amz-security-token'] = params.sessionToken;
  }
  return result;
}

// ─── Converse API types ───────────────────────────────────────────────────────

interface ConverseMessage {
  role: 'user' | 'assistant';
  content: Array<{ text: string }>;
}

interface ConverseRequest {
  messages:        ConverseMessage[];
  system?:         Array<{ text: string }>;
  inferenceConfig?: { maxTokens?: number; temperature?: number };
}

interface ConverseResponse {
  output?: {
    message?: {
      role: string;
      content: Array<{ text: string }>;
    };
  };
  usage?: {
    inputTokens:  number;
    outputTokens: number;
    totalTokens:  number;
  };
  stopReason?: string;
}

// ─── Streaming event types ────────────────────────────────────────────────────

interface ConverseStreamEvent {
  contentBlockDelta?: { delta?: { text?: string } };
  metadata?:          { usage?: { inputTokens: number; outputTokens: number } };
  messageStop?:       { stopReason?: string };
}

// ─── BedrockProvider ──────────────────────────────────────────────────────────

export class BedrockProvider implements LLMProvider {
  readonly name = 'bedrock';

  private readonly accessKeyId:  string;
  private readonly secretKey:    string;
  private readonly sessionToken: string | undefined;
  private readonly region:       string;

  constructor(options: {
    accessKeyId?:  string;
    secretKey?:    string;
    sessionToken?: string;
    region?:       string;
  } = {}) {
    this.accessKeyId  = options.accessKeyId  ?? process.env['AWS_ACCESS_KEY_ID']      ?? '';
    this.secretKey    = options.secretKey    ?? process.env['AWS_SECRET_ACCESS_KEY']   ?? '';
    this.sessionToken = options.sessionToken ?? process.env['AWS_SESSION_TOKEN'];
    this.region       = options.region       ?? process.env['AWS_REGION']              ??
                                                process.env['AWS_DEFAULT_REGION']      ?? 'us-east-1';
  }

  async isAvailable(): Promise<boolean> {
    return this.accessKeyId.length > 0 && this.secretKey.length > 0;
  }

  async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
    if (!this.accessKeyId || !this.secretKey) {
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
      accessKeyId:  this.accessKeyId,
      secretKey:    this.secretKey,
      sessionToken: this.sessionToken,
      region:       this.region,
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

  async *stream(prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk> {
    if (!this.accessKeyId || !this.secretKey) {
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
      accessKeyId:  this.accessKeyId,
      secretKey:    this.secretKey,
      sessionToken: this.sessionToken,
      region:       this.region,
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

    // Bedrock ConverseStream uses HTTP/2 binary event stream encoding.
    // Each frame is: 4-byte total-length | 4-byte headers-length | 4-byte prelude-crc |
    //                N-byte headers | M-byte payload | 4-byte message-crc.
    // We parse the raw bytes to extract the JSON payload.
    let inputTokens  = 0;
    let outputTokens = 0;
    let remainder    = Buffer.alloc(0);

    for await (const raw of res.body as unknown as AsyncIterable<Uint8Array>) {
      remainder = Buffer.concat([remainder, Buffer.from(raw)]);

      while (remainder.length >= 12) {
        const totalLen   = remainder.readUInt32BE(0);
        const headersLen = remainder.readUInt32BE(4);

        if (remainder.length < totalLen) break;  // incomplete frame

        const headersStart = 12;
        const payloadStart = headersStart + headersLen;
        const payloadEnd   = totalLen - 4;           // minus trailing CRC
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
            yield {
              token: '',
              done: true,
              usage: { inputTokens, outputTokens },
            };
          }
        } catch {
          // skip malformed frames
        }
      }
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _endpoint(modelId: string, stream: boolean): { host: string; path: string } {
    const encoded = encodeURIComponent(modelId);
    const suffix  = stream ? '/converse-stream' : '/converse';
    return {
      host: `bedrock-runtime.${this.region}.amazonaws.com`,
      path: `/model/${encoded}${suffix}`,
    };
  }

  private _buildConverseBody(prompt: LLMPrompt): ConverseRequest {
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
}
