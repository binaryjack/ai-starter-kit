/**
 * E8 — Prompt Injection Detection
 *
 * Detects adversarial prompt-injection attempts in LLM messages before they
 * reach the model.  Works as a transparent provider wrapper (same API as
 * `createPiiSafeProvider`) or as a standalone scanner.
 *
 * Detection families (10 signature sets):
 *   IGNORE_INSTRUCTIONS — "ignore previous/all/prior instructions"
 *   SYSTEM_OVERRIDE     — "forget everything / you are now / disregard"
 *   ROLE_JAILBREAK      — "act as DAN / unfiltered / evil AI"
 *   NEW_DIRECTIVE       — "your new instructions are / new system prompt"
 *   PROMPT_LEAK         — "repeat the text above / reveal your prompt"
 *   CONTEXT_FENCE       — structural delimiters: ### Human:, <|im_start|>, [SYSTEM]
 *   INDIRECT_INJECTION  — "when you read this, do X"
 *   TASK_OVERRIDE       — "your actual/true task is now"
 *   DATA_ESCAPE         — XML/HTML closing tags: </system>, </instruction>
 *   SUDO_COMMAND        — "developer mode / DAN mode / godmode / jailbreak mode"
 *
 * Confidence scoring:
 *   1 match → 0.3 (low)
 *   2 matches → 0.6 (medium)
 *   3+ matches → 0.9 (high)
 *
 * Detection modes:
 *   'warn'  — Emits a structured warning to stdout; request continues (default)
 *   'block' — Throws `PromptInjectionError`; request is aborted
 *
 * Usage:
 *   // Drop-in provider wrapper:
 *   const safeProvider = createInjectionSafeProvider(baseProvider, { mode: 'block' });
 *
 *   // Standalone scan:
 *   const detector = new PromptInjectionDetector();
 *   const result = detector.scan(prompt);
 *   if (result.detected) console.warn('Injection detected:', result.familiesMatched);
 *
 * Configuration via model-router.json:
 *   {
 *     "injectionDetection": {
 *       "enabled": true,
 *       "mode": "block",
 *       "skipRoles": ["system"],
 *       "customPatterns": [
 *         { "name": "MY_PATTERN", "pattern": "evil phrase here" }
 *       ]
 *     }
 *   }
 */

import type {
    LLMPrompt,
    LLMProvider,
    LLMResponse,
    LLMStreamChunk,
    ToolExecutorFn,
} from './llm-provider.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export type InjectionDetectionMode = 'warn' | 'block';

export interface InjectionSignature {
  name: string;
  /**
   * One or more patterns to test against a single normalised message string.
   * Detection fires when ANY pattern matches (OR semantics per signature;
   * AND semantics across multiple signatures is NOT required for detection).
   */
  patterns: RegExp[];
}

export interface InjectionScanResult {
  /** True when one or more signatures matched */
  detected: boolean;
  /** 0-1 score based on the number of distinct families matched */
  confidence: number;
  /** Names of the matched signature families */
  familiesMatched: string[];
  /** Flat list of all matched pattern names + excerpt (capped at 80 chars each) */
  matches: Array<{ family: string; excerpt: string }>;
}

export interface InjectionDetectorOptions {
  /**
   * 'warn' (default) — logs to stderr and continues.
   * 'block' — throws PromptInjectionError.
   */
  mode?: InjectionDetectionMode;
  /**
   * Message roles to skip scanning.
   * Defaults to [] (scan all roles including 'system').
   * Pass ['system'] to only scan user/assistant messages.
   */
  skipRoles?: Array<'system' | 'user' | 'assistant'>;
  /** Extra project-specific signatures to add (merged with built-in list). */
  customSignatures?: InjectionSignature[];
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class PromptInjectionError extends Error {
  readonly scanResult: InjectionScanResult;

  constructor(result: InjectionScanResult) {
    const families = result.familiesMatched.join(', ');
    super(
      `Prompt injection detected (confidence=${result.confidence.toFixed(2)}): ${families}`,
    );
    this.name = 'PromptInjectionError';
    this.scanResult = result;
  }
}

// ─── Built-in signatures ─────────────────────────────────────────────────────

/**
 * 10 signature families covering the most common real-world injection vectors.
 * All patterns are case-insensitive and compiled once at module load time.
 */
const BUILT_IN_SIGNATURES: InjectionSignature[] = [
  {
    name: 'IGNORE_INSTRUCTIONS',
    patterns: [
      /ignore\s+(all\s+)?(previous|prior|above|your|the\s+previous)\s+(instructions?|prompts?|directives?|guidelines?|rules?)/i,
      /disregard\s+(?:all\s+)?(?:\w+\s+){0,2}(instructions?|prompts?|directives?)/i,
    ],
  },
  {
    name: 'SYSTEM_OVERRIDE',
    patterns: [
      /forget\s+(everything|all\s+(previous|prior|your)\s+instructions?|your\s+(instructions?|training|purpose|role))/i,
      /you\s+are\s+now\s+(a|an|the)\s+\w/i,
      /override\s+(your\s+)?(instructions?|directives?|system\s+prompt|constraints?)/i,
    ],
  },
  {
    name: 'ROLE_JAILBREAK',
    patterns: [
      /act\s+as\s+(dan|jailbreak(ed)?|unchained|unfiltered|evil|unrestricted|uncensored|omniscient|god\s*mode)\b/i,
      /pretend\s+(you\s+are|to\s+be)\s+(dan|jailbroken|unrestricted|evil|an\s+unfiltered)/i,
      /enter\s+(dan|jailbreak|developer|god)\s*mode/i,
      /you['']?re?\s+(now\s+)?(?:dan|jailbroken|an\s+evil|an\s+unfiltered)\b/i,
    ],
  },
  {
    name: 'NEW_DIRECTIVE',
    patterns: [
      /your\s+(new\s+)?(instructions?\s+are|primary\s+objective\s+is|directive\s+is|system\s+prompt\s+is)/i,
      /new\s+(system\s+)?(prompt|instructions?|directive|message|rules?)[\s:]+/i,
      /updated?\s+instructions?[\s:]+/i,
    ],
  },
  {
    name: 'PROMPT_LEAK',
    patterns: [
      /repeat\s+(all\s+)?(the\s+)?(words?|text|prompt|instructions?|messages?)\s+(above|before|previously|from\s+above)/i,
      /reveal\s+(your\s+)?(system\s+)?(prompt|instructions?|training|context|message)/i,
      /what\s+(were|are|is)\s+(your|the)\s+(original\s+)?(instructions?|system\s+prompt|directives?)/i,
      /print\s+(your\s+)?(full\s+)?(system\s+)?(prompt|instructions?)\b/i,
    ],
  },
  {
    name: 'CONTEXT_FENCE',
    patterns: [
      /#+\s*(human|user|assistant|system|instruction|input|output)\s*:/i,
      /<\|im_(start|end|sep)\|>/i,
      /\[SYSTEM\]\s*\n/i,
      /---+\s*(end\s+of\s+)?(system\s+)?(prompt|context|instruction)/i,
      /={3,}\s*(system|instruction|directive)/i,
    ],
  },
  {
    name: 'INDIRECT_INJECTION',
    patterns: [
      /when\s+(you|the\s+ai|this\s+ai|the\s+model)\s+(read|see|process|encounter|receive)s?\s+this/i,
      /if\s+you\s+(read|see|get|receive)\s+this\s+(message|text|instruction)/i,
      /this\s+(message|text|instruction|note)\s+is\s+(for|directed\s+(at|to))\s+(the\s+)?(ai|model|assistant|llm)/i,
    ],
  },
  {
    name: 'TASK_OVERRIDE',
    patterns: [
      /your\s+(only|actual|real|true|new|primary)\s+(task|purpose|job|goal|mission|objective)\s+is\s+now/i,
      /from\s+(now\s+on|this\s+point\s+(forward|on))\s+(,\s*)?(you|your)\s+(must|will|should|only)/i,
      /stop\s+(being|acting\s+as)\s+(a|an)?\s*(helpful|ai|assistant)\s+and\s+(start|begin)/i,
    ],
  },
  {
    name: 'DATA_ESCAPE',
    patterns: [
      /<\/\s*(system|instruction|prompt|context|directive|human|user)\s*>/i,
      /\[\/\s*(system|instruction|prompt|directive)\s*\]/i,
      /<\s*(system|instruction|prompt)\s*>/i,
    ],
  },
  {
    name: 'SUDO_COMMAND',
    patterns: [
      /developer\s+mode\s+(on|enabled?|activated?)/i,
      /\bdan\s+mode\b/i,
      /god\s*mode\s+(on|enabled?|activated?)/i,
      /jailbreak\s+mode/i,
      /sudo\s+(mode|prompt|override|bypass)/i,
      /enable\s+(unrestricted|unfiltered|jailbreak|developer)\s+mode/i,
    ],
  },
];

// ─── PromptInjectionDetector ──────────────────────────────────────────────────

export class PromptInjectionDetector {
  private readonly signatures: InjectionSignature[];
  private readonly skipRoles: Set<string>;

  constructor(options: InjectionDetectorOptions = {}) {
    const custom = options.customSignatures ?? [];
    this.signatures = [...BUILT_IN_SIGNATURES, ...custom];
    this.skipRoles = new Set(options.skipRoles ?? []);
  }

  /**
   * Scan all messages in an LLMPrompt for injection patterns.
   * Returns a structured result; never throws — callers decide the response.
   */
  scan(prompt: LLMPrompt): InjectionScanResult {
    const matchedFamilies = new Set<string>();
    const allMatches: Array<{ family: string; excerpt: string }> = [];

    for (const message of prompt.messages) {
      if (this.skipRoles.has(message.role)) continue;

      const normalised = message.content
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, ' ')
        .replace(/\u200b|\u00ad|\ufeff/g, ''); // strip zero-width / soft-hyphen

      for (const sig of this.signatures) {
        for (const pattern of sig.patterns) {
          const m = pattern.exec(normalised);
          if (m) {
            matchedFamilies.add(sig.name);
            allMatches.push({
              family: sig.name,
              excerpt: m[0].slice(0, 80),
            });
            break; // one match per sig per message is enough
          }
        }
      }
    }

    const familyCount = matchedFamilies.size;
    const confidence =
      familyCount === 0 ? 0 :
      familyCount === 1 ? 0.3 :
      familyCount === 2 ? 0.6 :
                          0.9;

    return {
      detected: familyCount > 0,
      confidence,
      familiesMatched: [...matchedFamilies],
      matches: allMatches,
    };
  }

  /**
   * Scan and enforce based on the configured mode.
   * - 'warn': writes a structured warning to stderr; request continues.
   * - 'block': throws PromptInjectionError.
   * Returns the scan result in both cases.
   */
  enforce(prompt: LLMPrompt, mode: InjectionDetectionMode = 'warn'): InjectionScanResult {
    const result = this.scan(prompt);
    if (!result.detected) return result;

    const warning = {
      level: 'SECURITY_WARNING',
      event: 'PROMPT_INJECTION_DETECTED',
      confidence: result.confidence,
      familiesMatched: result.familiesMatched,
      matchCount: result.matches.length,
    };
    process.stderr.write(`[ai-kit] ${JSON.stringify(warning)}\n`);

    if (mode === 'block') {
      throw new PromptInjectionError(result);
    }

    return result;
  }
}

// ─── Provider wrapper ─────────────────────────────────────────────────────────

/**
 * Wraps any LLMProvider with injection detection on every `complete()`,
 * `stream()`, and `completeWithTools()` call.
 * Identical drop-in API to `createPiiSafeProvider()`.
 *
 * @param inner   - The underlying provider (Anthropic, OpenAI, Mock, etc.)
 * @param options - Detection options (mode, skipRoles, customSignatures)
 */
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
