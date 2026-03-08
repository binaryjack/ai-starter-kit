import type { LLMPrompt } from '../../llm-provider.js';
import {
    InjectionDetectionMode,
    InjectionScanResult,
    IPromptInjectionDetector,
    PromptInjectionError,
} from '../prompt-injection-detector.js';

export function scan(this: IPromptInjectionDetector, prompt: LLMPrompt): InjectionScanResult {
  const matchedFamilies = new Set<string>();
  const allMatches: Array<{ family: string; excerpt: string }> = [];

  for (const message of prompt.messages) {
    if (this._skipRoles.has(message.role)) continue;

    const normalised = message.content
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\u200b|\u00ad|\ufeff/g, '');

    for (const sig of this._signatures) {
      for (const pattern of sig.patterns) {
        const m = pattern.exec(normalised);
        if (m) {
          matchedFamilies.add(sig.name);
          allMatches.push({ family: sig.name, excerpt: m[0].slice(0, 80) });
          break;
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
    detected:        familyCount > 0,
    confidence,
    familiesMatched: [...matchedFamilies],
    matches:         allMatches,
  };
}

export function enforce(
  this: IPromptInjectionDetector,
  prompt: LLMPrompt,
  mode: InjectionDetectionMode = 'warn',
): InjectionScanResult {
  const result = this.scan(prompt);
  if (!result.detected) return result;

  const warning = {
    level:           'SECURITY_WARNING',
    event:           'PROMPT_INJECTION_DETECTED',
    confidence:      result.confidence,
    familiesMatched: result.familiesMatched,
    matchCount:      result.matches.length,
  };
  process.stderr.write(`[ai-kit] ${JSON.stringify(warning)}\n`);

  if (mode === 'block') {
    throw new PromptInjectionError(result);
  }

  return result;
}
