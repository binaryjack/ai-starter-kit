import type { LLMPrompt } from '../llm-provider.js';

export type InjectionDetectionMode = 'warn' | 'block';

export interface InjectionSignature {
  name:     string;
  patterns: RegExp[];
}

export interface InjectionScanResult {
  detected:        boolean;
  confidence:      number;
  familiesMatched: string[];
  matches:         Array<{ family: string; excerpt: string }>;
}

export interface InjectionDetectorOptions {
  mode?:             InjectionDetectionMode;
  skipRoles?:        Array<'system' | 'user' | 'assistant'>;
  customSignatures?: InjectionSignature[];
}

// Error subclass — kept as class
export class PromptInjectionError extends Error {
  readonly scanResult: InjectionScanResult;

  constructor(result: InjectionScanResult) {
    const families = result.familiesMatched.join(', ');
    super(`Prompt injection detected (confidence=${result.confidence.toFixed(2)}): ${families}`);
    this.name = 'PromptInjectionError';
    this.scanResult = result;
  }
}

export const BUILT_IN_SIGNATURES: InjectionSignature[] = [
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

export interface IPromptInjectionDetector {
  _signatures: InjectionSignature[];
  _skipRoles:  Set<string>;
  scan(prompt: LLMPrompt): InjectionScanResult;
  enforce(prompt: LLMPrompt, mode?: InjectionDetectionMode): InjectionScanResult;
}

export const PromptInjectionDetector = function (
  this: IPromptInjectionDetector,
  options: InjectionDetectorOptions = {},
) {
  const custom = options.customSignatures ?? [];
  this._signatures = [...BUILT_IN_SIGNATURES, ...custom];
  this._skipRoles  = new Set(options.skipRoles ?? []);
} as unknown as new (options?: InjectionDetectorOptions) => IPromptInjectionDetector;
