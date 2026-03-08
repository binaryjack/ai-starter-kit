import type {
  LLMPrompt,
  LLMProvider,
  LLMResponse,
  LLMStreamChunk,
  ToolExecutorFn,
}                              from '../llm-provider.js';
import type { ScrubPattern, ScrubResult, PiiScrubberOptions } from './pii-scrubber.types.js';

import './prototype/index.js';

export type { ScrubPattern, ScrubResult, PiiScrubberOptions } from './pii-scrubber.types.js';

// ─── Built-in patterns ────────────────────────────────────────────────────────

export const BUILTIN_PATTERNS: ScrubPattern[] = [
  {
    name:        'AWS_ACCESS_KEY',
    pattern:     /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED:AWS_ACCESS_KEY]',
  },
  {
    name:        'GITHUB_TOKEN',
    pattern:     /gh[pousr]_[A-Za-z0-9_]{36,255}/g,
    replacement: '[REDACTED:GITHUB_TOKEN]',
  },
  {
    name:        'JWT',
    pattern:     /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: '[REDACTED:JWT]',
  },
  {
    name:        'SSH_PRIVATE_KEY',
    pattern:     /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED:SSH_PRIVATE_KEY]',
  },
  {
    name:        'ANTHROPIC_KEY',
    pattern:     /sk-ant-[A-Za-z0-9\-_]{20,}/g,
    replacement: '[REDACTED:ANTHROPIC_KEY]',
  },
  {
    name:        'OPENAI_KEY',
    pattern:     /sk-(?!ant-)[A-Za-z0-9]{20,}/g,
    replacement: '[REDACTED:OPENAI_KEY]',
  },
  {
    name:        'GENERIC_BEARER',
    pattern:     /Bearer\s+[A-Za-z0-9\-_\.~+/]+=*/g,
    replacement: 'Bearer [REDACTED:TOKEN]',
  },
  {
    name:        'ENV_ASSIGN',
    pattern:     /^([A-Z][A-Z0-9_]{3,})\s*=\s*(\S{8,})$/gm,
    replacement: '$1=[REDACTED:ENV_VALUE]',
  },
  {
    name:        'CREDIT_CARD',
    pattern:     /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    replacement: '[REDACTED:CREDIT_CARD]',
  },
  {
    name:        'EMAIL',
    pattern:     /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED:EMAIL]',
  },
  {
    name:        'PHONE_NUMBER',
    pattern:     /(?:\+?\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?){2,}\d{3,4}/g,
    replacement: '[REDACTED:PHONE_NUMBER]',
  },
  {
    name:        'IBAN',
    pattern:     /\b[A-Z]{2}\d{2}[A-Z0-9 ]{11,30}\b/g,
    replacement: '[REDACTED:IBAN]',
  },
  {
    name:        'IPV4_PRIVATE',
    pattern:     /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    replacement: '[REDACTED:INTERNAL_IP]',
  },
];

// ─── Interface + Constructor ──────────────────────────────────────────────────

export interface IPiiScrubber {
  new(options?: PiiScrubberOptions): IPiiScrubber;
  _patterns:  ScrubPattern[];
  _enabled:   boolean;
  scrub(text: string): ScrubResult;
  scrubPrompt(prompt: LLMPrompt): { prompt: LLMPrompt; result: ScrubResult };
  patternNames(): string[];
}

export const PiiScrubber = function(
  this:    IPiiScrubber,
  options: PiiScrubberOptions = {},
) {
  this._enabled = options.enabled ?? true;

  const custom: ScrubPattern[] = (options.customPatterns ?? []).map((c) => ({
    name:        c.name,
    pattern:     new RegExp(c.pattern, c.flags ?? 'g'),
    replacement: `[REDACTED:${c.name}]`,
  }));

  this._patterns = [...BUILTIN_PATTERNS, ...custom];
} as unknown as IPiiScrubber;

// ─── Provider Wrapper ─────────────────────────────────────────────────────────

export function createPiiSafeProvider(
  inner:   LLMProvider,
  options: PiiScrubberOptions & {
    onScrub?: (result: ScrubResult, modelId: string) => void;
  } = {},
): LLMProvider {
  const scrubber    = new PiiScrubber(options);
  const { onScrub } = options;

  return {
    name: inner.name,

    isAvailable: () => inner.isAvailable(),

    async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
      const { prompt: clean, result } = scrubber.scrubPrompt(prompt);
      if (result.scrubCount > 0) onScrub?.(result, modelId);
      return inner.complete(clean, modelId);
    },

    stream: inner.stream
      ? async function* (prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk> {
          const { prompt: clean, result } = scrubber.scrubPrompt(prompt);
          if (result.scrubCount > 0) onScrub?.(result, modelId);
          yield* inner.stream!(clean, modelId);
        }
      : undefined,

    completeWithTools: inner.completeWithTools
      ? async (
          prompt:   LLMPrompt,
          modelId:  string,
          executor: ToolExecutorFn,
        ): Promise<LLMResponse> => {
          const { prompt: clean, result } = scrubber.scrubPrompt(prompt);
          if (result.scrubCount > 0) onScrub?.(result, modelId);
          return inner.completeWithTools!(clean, modelId, executor);
        }
      : undefined,
  };
}
