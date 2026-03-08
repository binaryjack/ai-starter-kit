import type { LLMPrompt } from '../../llm-provider.js'
import type { IPiiScrubber } from '../pii-scrubber.js'
import type { ScrubResult } from '../pii-scrubber.types.js'

export function scrub(this: IPiiScrubber, text: string): ScrubResult {
  if (!this._enabled) {
    return { text, scrubCount: 0, patternsMatched: [] };
  }

  let result     = text;
  let totalCount = 0;
  const matched  = new Set<string>();

  for (const p of this._patterns) {
    p.pattern.lastIndex = 0;
    const before = result;
    result = result.replace(p.pattern, p.replacement);
    if (result !== before) {
      const occurrences = result.split(p.replacement).length - 1;
      if (occurrences > 0) {
        totalCount += occurrences;
        matched.add(p.name);
      }
    }
  }

  return {
    text:            result,
    scrubCount:      totalCount,
    patternsMatched: Array.from(matched),
  };
}

export function scrubPrompt(
  this:   IPiiScrubber,
  prompt: LLMPrompt,
): { prompt: LLMPrompt; result: ScrubResult } {
  if (!this._enabled) {
    return { prompt, result: { text: '', scrubCount: 0, patternsMatched: [] } };
  }

  let totalCount       = 0;
  const allMatched     = new Set<string>();

  const scrubbedMessages = prompt.messages.map((msg) => {
    const r = this.scrub(msg.content);
    totalCount += r.scrubCount;
    r.patternsMatched.forEach((p) => allMatched.add(p));
    return { ...msg, content: r.text };
  });

  return {
    prompt: { ...prompt, messages: scrubbedMessages },
    result: {
      text:            '',
      scrubCount:      totalCount,
      patternsMatched: Array.from(allMatched),
    },
  };
}

export function patternNames(this: IPiiScrubber): string[] {
  return this._patterns.map((p) => p.name);
}
