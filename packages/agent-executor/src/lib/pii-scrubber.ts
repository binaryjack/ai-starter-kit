/**
 * E1 — PII Scrubbing Middleware
 *
 * Scrubs personally-identifiable and credential data from LLM prompts before
 * any HTTP call leaves the process.  Wraps any LLMProvider transparently.
 *
 * Built-in patterns:
 *   AWS_ACCESS_KEY   — AKIA[A-Z0-9]{16}
 *   GITHUB_TOKEN     — ghp_ / gho_ / ghs_ / ghu_ / ghr_
 *   JWT              — eyJ…. three-part base64url token
 *   ENV_ASSIGN       — LINE starting with UPPER_KEY=<value>
 *   SSH_PRIVATE_KEY  — -----BEGIN … PRIVATE KEY-----
 *   CREDIT_CARD      — Luhn-pattern 12-16 digit cards (Visa/MC/Amex/Discover)
 *   ANTHROPIC_KEY    — sk-ant-…
 *   OPENAI_KEY       — sk-…
 *   GENERIC_BEARER   — Bearer <token> in Authorization headers
 *
 * Usage:
 *   const safeProvider = createPiiSafeProvider(anthropicProvider);
 *   // Drop-in replacement — all calls are scrubbed before reaching the API
 *
 *   // Or use directly:
 *   const scrubber = new PiiScrubber();
 *   const { text, scrubCount, patternsMatched } = scrubber.scrub(fileContent);
 *
 * Configuration via model-router.json:
 *   {
 *     "piiScrubbing": {
 *       "enabled": true,
 *       "customPatterns": [
 *         { "name": "MY_INTERNAL_TOKEN", "pattern": "MYT-[A-Za-z0-9]{32}" }
 *       ]
 *     }
 *   }
 */

import type { LLMPrompt, LLMProvider, LLMResponse, LLMStreamChunk, ToolExecutorFn } from './llm-provider.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrubPattern {
  /** Human-readable name used in audit log entries and redaction replacements */
  name: string;
  pattern: RegExp;
  replacement: string;
}

/**
 * Result of a single scrub pass.
 * The `patternsMatched` array is safe to persist — it never includes the actual secrets.
 */
export interface ScrubResult {
  /** The scrubbed text with redaction placeholders inserted */
  text: string;
  /** Total number of individual replacements performed */
  scrubCount: number;
  /** Names of the patterns that matched (e.g. ['GITHUB_TOKEN', 'JWT']) */
  patternsMatched: string[];
}

export interface PiiScrubberOptions {
  /** Whether scrubbing is active. Default: true */
  enabled?: boolean;
  /**
   * Additional patterns to apply after the built-ins.
   * `pattern` is a regex string (without delimiters).
   */
  customPatterns?: Array<{ name: string; pattern: string; flags?: string }>;
}

// ─── Built-in patterns ────────────────────────────────────────────────────────

const BUILTIN_PATTERNS: ScrubPattern[] = [
  {
    name: 'AWS_ACCESS_KEY',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[REDACTED:AWS_ACCESS_KEY]',
  },
  {
    name: 'GITHUB_TOKEN',
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g,
    replacement: '[REDACTED:GITHUB_TOKEN]',
  },
  {
    name: 'JWT',
    // Three base64url segments separated by dots — standard JWT structure
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: '[REDACTED:JWT]',
  },
  {
    name: 'SSH_PRIVATE_KEY',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: '[REDACTED:SSH_PRIVATE_KEY]',
  },
  {
    name: 'ANTHROPIC_KEY',
    pattern: /sk-ant-[A-Za-z0-9\-_]{20,}/g,
    replacement: '[REDACTED:ANTHROPIC_KEY]',
  },
  {
    name: 'OPENAI_KEY',
    // sk- followed by 20+ alphanumeric (not followed immediately by "ant-" to avoid double-match)
    pattern: /sk-(?!ant-)[A-Za-z0-9]{20,}/g,
    replacement: '[REDACTED:OPENAI_KEY]',
  },
  {
    name: 'GENERIC_BEARER',
    pattern: /Bearer\s+[A-Za-z0-9\-_\.~+/]+=*/g,
    replacement: 'Bearer [REDACTED:TOKEN]',
  },
  {
    name: 'ENV_ASSIGN',
    // Lines like `API_KEY=abc123secret` or `DATABASE_PASSWORD=hunter2`
    pattern: /^([A-Z][A-Z0-9_]{3,})\s*=\s*(\S{8,})$/gm,
    replacement: '$1=[REDACTED:ENV_VALUE]',
  },
  {
    name: 'CREDIT_CARD',
    // Luhn-patterned card numbers: Visa 4xxx, MC 5x, Amex 3x, Discover 6011/65
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    replacement: '[REDACTED:CREDIT_CARD]',
  },
];

// ─── PiiScrubber ──────────────────────────────────────────────────────────────

export class PiiScrubber {
  private readonly patterns: ScrubPattern[];
  readonly enabled: boolean;

  constructor(options: PiiScrubberOptions = {}) {
    this.enabled = options.enabled ?? true;

    const custom: ScrubPattern[] = (options.customPatterns ?? []).map((c) => ({
      name: c.name,
      pattern: new RegExp(c.pattern, c.flags ?? 'g'),
      replacement: `[REDACTED:${c.name}]`,
    }));

    this.patterns = [...BUILTIN_PATTERNS, ...custom];
  }

  /**
   * Scrub a single text string.
   * Returns the cleaned text and metadata about what was found.
   */
  scrub(text: string): ScrubResult {
    if (!this.enabled) {
      return { text, scrubCount: 0, patternsMatched: [] };
    }

    let result = text;
    let totalCount = 0;
    const matched = new Set<string>();

    for (const p of this.patterns) {
      // Reset lastIndex so global regexes work correctly across calls
      p.pattern.lastIndex = 0;
      const before = result;
      result = result.replace(p.pattern, p.replacement);
      if (result !== before) {
        // Count matches by counting the replacement string occurrences
        const occurrences = (result.split(p.replacement).length - 1);
        if (occurrences > 0) {
          totalCount += occurrences;
          matched.add(p.name);
        }
      }
    }

    return {
      text: result,
      scrubCount: totalCount,
      patternsMatched: Array.from(matched),
    };
  }

  /**
   * Scrub all message content in an LLMPrompt.
   * Returns a new prompt object (original is not mutated) plus the aggregate scrub results.
   */
  scrubPrompt(prompt: LLMPrompt): { prompt: LLMPrompt; result: ScrubResult } {
    if (!this.enabled) {
      return { prompt, result: { text: '', scrubCount: 0, patternsMatched: [] } };
    }

    let totalCount = 0;
    const allMatched = new Set<string>();

    const scrubbedMessages = prompt.messages.map((msg) => {
      const r = this.scrub(msg.content);
      totalCount += r.scrubCount;
      r.patternsMatched.forEach((p) => allMatched.add(p));
      return { ...msg, content: r.text };
    });

    return {
      prompt: { ...prompt, messages: scrubbedMessages },
      result: {
        text: '',
        scrubCount: totalCount,
        patternsMatched: Array.from(allMatched),
      },
    };
  }

  /** Return the list of active pattern names (built-in + custom). */
  get patternNames(): string[] {
    return this.patterns.map((p) => p.name);
  }
}

// ─── Provider Wrapper ─────────────────────────────────────────────────────────

/**
 * Wrap any LLMProvider so that all outbound prompts are PII-scrubbed.
 *
 * A `onScrub` callback is invoked after each scrub pass — use it to emit
 * audit log entries without coupling this module to AuditLog.
 *
 * @example
 * const safe = createPiiSafeProvider(anthropicProvider, {
 *   onScrub: (result) => auditLog.write('pii:scrubbed', { ...result }),
 * });
 */
export function createPiiSafeProvider(
  inner: LLMProvider,
  options: PiiScrubberOptions & {
    onScrub?: (result: ScrubResult, modelId: string) => void;
  } = {},
): LLMProvider {
  const scrubber = new PiiScrubber(options);
  const { onScrub } = options;

  return {
    name: inner.name,

    isAvailable: () => inner.isAvailable(),

    async complete(prompt: LLMPrompt, modelId: string): Promise<LLMResponse> {
      const { prompt: clean, result } = scrubber.scrubPrompt(prompt);
      if (result.scrubCount > 0) {
        onScrub?.(result, modelId);
      }
      return inner.complete(clean, modelId);
    },

    stream: inner.stream
      ? async function* (prompt: LLMPrompt, modelId: string): AsyncIterable<LLMStreamChunk> {
          const { prompt: clean, result } = scrubber.scrubPrompt(prompt);
          if (result.scrubCount > 0) {
            onScrub?.(result, modelId);
          }
          yield* inner.stream!(clean, modelId);
        }
      : undefined,

    completeWithTools: inner.completeWithTools
      ? async (prompt: LLMPrompt, modelId: string, executor: ToolExecutorFn): Promise<LLMResponse> => {
          const { prompt: clean, result } = scrubber.scrubPrompt(prompt);
          if (result.scrubCount > 0) {
            onScrub?.(result, modelId);
          }
          return inner.completeWithTools!(clean, modelId, executor);
        }
      : undefined,
  };
}
